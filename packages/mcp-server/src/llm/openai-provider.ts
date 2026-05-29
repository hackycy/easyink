import type { TemplateGenerationIntent } from '@easyink/schema-tools'
import type { ResponseFormatJSONObject, ResponseFormatJSONSchema } from 'openai/resources/shared'
import type { DataSourceGenerationInput, DataSourceGenerationOutput, LLMConfig, LLMProgressEvent, LLMProvider, PlanGenerationInput, PlanGenerationOutput, SchemaGenerationInput, SchemaGenerationOutput, TemplateIntentGenerationInput } from './types'
import { openAIJsonSchemaResponseFormat, PLAN_JSON_SCHEMA, TEMPLATE_INTENT_JSON_SCHEMA } from './structured-output'

/** Minimum interval between `llm-delta` progress emissions, in ms. */
const PROGRESS_THROTTLE_MS = 1000
const JSON_REPAIR_ATTEMPTS = 2
const JSON_REPAIR_PREVIEW_CHARS = 6000

type ResponseFormatMode = 'json_schema' | 'json_object' | 'none'
type ChatParams = import('openai/resources/chat/completions').ChatCompletionCreateParamsBase
type JSONParseResult<T> = { ok: true, value: T } | { ok: false }

export class OpenAIProvider implements LLMProvider {
  readonly name = 'openai'
  readonly supportsStreaming = true
  private client: import('openai').OpenAI
  private model: string
  private responseFormatMode: ResponseFormatMode

  private constructor(config: LLMConfig, OpenAIClass: typeof import('openai').OpenAI) {
    this.client = new OpenAIClass({ apiKey: config.apiKey, baseURL: config.baseUrl })
    this.model = config.model ?? 'gpt-4o'
    this.responseFormatMode = config.strictOutput ?? true ? 'json_schema' : 'json_object'
  }

  static async create(config: LLMConfig): Promise<OpenAIProvider> {
    const { OpenAI: OpenAIClass } = await import('openai')
    return new OpenAIProvider(config, OpenAIClass)
  }

  async generatePlan(input: PlanGenerationInput): Promise<PlanGenerationOutput> {
    const { prompt, systemPrompt, signal, onProgress } = input

    const content = await this.streamJSON(
      {
        model: this.model,
        max_tokens: 1024,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `User request: ${prompt}` },
        ],
        ...this.withResponseFormat('easyink_generation_plan', PLAN_JSON_SCHEMA),
      },
      signal,
      onProgress,
    )

    return parseJSONResponse<PlanGenerationOutput>('plan', content)
  }

  async generateTemplateIntent(input: TemplateIntentGenerationInput): Promise<TemplateGenerationIntent> {
    const { prompt, currentSchema, systemPrompt, generationPlan, signal, onProgress, temperature, feedbackMessages } = input

    const userContent = [
      currentSchema ? `Current schema context:\n${JSON.stringify(currentSchema, null, 2)}` : undefined,
      generationPlan ? `EasyInk generation plan:\n${JSON.stringify(generationPlan, null, 2)}` : undefined,
      feedbackMessages?.length
        ? `Previous attempt had the following issues. Fix them in this output:\n${feedbackMessages.map(line => `- ${line}`).join('\n')}`
        : undefined,
      `User request: ${prompt}`,
    ].filter(Boolean).join('\n\n')

    const params: import('openai/resources/chat/completions').ChatCompletionCreateParamsBase = {
      model: this.model,
      max_tokens: 8192,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
      ...this.withResponseFormat('easyink_template_intent', TEMPLATE_INTENT_JSON_SCHEMA),
    }
    if (typeof temperature === 'number')
      params.temperature = temperature

    return await this.streamParsedJSON<TemplateGenerationIntent>(
      params,
      'TemplateIntent',
      signal,
      onProgress,
    )
  }

  async generateSchema(input: SchemaGenerationInput): Promise<SchemaGenerationOutput> {
    const { prompt, currentSchema, systemPrompt, generationPlan, signal, onProgress } = input

    const userContent = [
      currentSchema ? `Current schema context:\n${JSON.stringify(currentSchema, null, 2)}` : undefined,
      generationPlan ? `EasyInk generation plan:\n${JSON.stringify(generationPlan, null, 2)}` : undefined,
      `User request: ${prompt}`,
    ].filter(Boolean).join('\n\n')

    const content = await this.streamJSON(
      {
        model: this.model,
        max_tokens: 8192,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent },
        ],
        ...this.withJSONResponseFormat(),
      },
      signal,
      onProgress,
    )

    const parsed = parseJSONResponse<{ schema?: unknown, expectedDataSource?: unknown }>('schema', content)

    if (!parsed.schema || !parsed.expectedDataSource) {
      throw new Error('OpenAI returned incomplete result (missing schema or expectedDataSource)')
    }

    return {
      schema: parsed.schema as SchemaGenerationOutput['schema'],
      expectedDataSource: parsed.expectedDataSource as SchemaGenerationOutput['expectedDataSource'],
    }
  }

  async generateDataSource(input: DataSourceGenerationInput): Promise<DataSourceGenerationOutput> {
    const { systemPrompt, expectedDataSource, signal, onProgress } = input

    const content = await this.streamJSON(
      {
        model: this.model,
        max_tokens: 4096,
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: `Generate a complete DataSourceDescriptor based on this expected structure:\n${JSON.stringify(expectedDataSource, null, 2)}`,
          },
        ],
        ...this.withJSONResponseFormat(),
      },
      signal,
      onProgress,
    )

    const parsed = parseJSONResponse<{ dataSource?: unknown }>('dataSource', content)

    if (!parsed.dataSource) {
      throw new Error('OpenAI returned incomplete result (missing dataSource)')
    }

    return parsed.dataSource as DataSourceGenerationOutput
  }

  /**
   * Drive a streaming chat completion, accumulate the assistant text, and
   * relay throttled progress to the caller. Returns the concatenated content.
   *
   * `signal` is forwarded to the OpenAI HTTP request so that aborting the
   * MCP request also aborts the upstream LLM call (no wasted spend).
   */
  private async streamJSON(
    params: ChatParams,
    signal: AbortSignal | undefined,
    onProgress: ((event: LLMProgressEvent) => void) | undefined,
  ): Promise<string> {
    onProgress?.({ phase: 'llm-start', tokens: 0, message: 'Calling OpenAI...' })

    let currentParams = params
    while (true) {
      try {
        return await this.streamOnce(currentParams, signal, onProgress)
      }
      catch (error) {
        const fallbackParams = this.downgradeResponseFormat(currentParams, error)
        if (!fallbackParams)
          throw error

        currentParams = fallbackParams
        onProgress?.({
          phase: 'llm-start',
          tokens: 0,
          message: 'OpenAI endpoint rejected response_format; retrying with a compatible JSON mode...',
        })
      }
    }
  }

  private async streamOnce(
    params: ChatParams,
    signal: AbortSignal | undefined,
    onProgress: ((event: LLMProgressEvent) => void) | undefined,
  ): Promise<string> {
    const stream = await this.client.chat.completions.create(
      { ...params, stream: true },
      { signal },
    )

    let buffer = ''
    let lastEmit = Date.now()
    let chunks = 0

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content
      if (delta) {
        buffer += delta
        chunks++
        const now = Date.now()
        if (now - lastEmit >= PROGRESS_THROTTLE_MS) {
          lastEmit = now
          onProgress?.({
            phase: 'llm-delta',
            tokens: chunks,
            message: `Received ${chunks} chunks (${buffer.length} chars)`,
          })
        }
      }
    }

    if (!buffer) {
      throw new Error('OpenAI returned empty response')
    }

    onProgress?.({ phase: 'llm-done', tokens: chunks, message: `Total ${buffer.length} chars` })
    return buffer
  }

  private async streamParsedJSON<T>(
    params: ChatParams,
    label: string,
    signal: AbortSignal | undefined,
    onProgress: ((event: LLMProgressEvent) => void) | undefined,
  ): Promise<T> {
    let currentParams = params
    let lastContent = ''

    for (let attempt = 1; attempt <= JSON_REPAIR_ATTEMPTS; attempt++) {
      const content = await this.streamJSON(currentParams, signal, onProgress)
      const parsed = tryParseJSONResponse<T>(content)
      if (parsed.ok)
        return parsed.value

      lastContent = content
      if (attempt < JSON_REPAIR_ATTEMPTS) {
        onProgress?.({
          phase: 'llm-start',
          tokens: 0,
          message: `${label} response was invalid JSON; requesting a complete JSON object again...`,
        })
        currentParams = withJSONRepairPrompt(currentParams, label, content)
      }
    }

    throw invalidJSONError(label, lastContent)
  }

  private withResponseFormat(
    name: string,
    schema: Record<string, unknown>,
  ): { response_format?: ResponseFormatJSONSchema | ResponseFormatJSONObject } {
    switch (this.responseFormatMode) {
      case 'json_schema':
        return { response_format: openAIJsonSchemaResponseFormat(name, schema) }
      case 'json_object':
        return { response_format: { type: 'json_object' } }
      case 'none':
        return {}
    }
  }

  private withJSONResponseFormat(): { response_format?: ResponseFormatJSONObject } {
    return this.responseFormatMode === 'none'
      ? {}
      : { response_format: { type: 'json_object' } }
  }

  private downgradeResponseFormat(
    params: ChatParams,
    error: unknown,
  ): ChatParams | undefined {
    if (!isResponseFormatUnavailableError(error))
      return undefined

    const currentType = params.response_format?.type
    if (currentType === 'json_schema') {
      this.responseFormatMode = 'json_object'
      return {
        ...params,
        response_format: { type: 'json_object' },
      }
    }

    if (currentType === 'json_object') {
      this.responseFormatMode = 'none'
      const { response_format: _responseFormat, ...rest } = params
      return rest
    }

    return undefined
  }
}

function parseJSONResponse<T>(label: string, content: string): T {
  const parsed = tryParseJSONResponse<T>(content)
  if (parsed.ok)
    return parsed.value
  throw invalidJSONError(label, content)
}

function tryParseJSONResponse<T>(content: string): JSONParseResult<T> {
  const candidates = [content.trim()]

  const fenced = extractFencedJSON(content)
  if (fenced)
    candidates.push(fenced)

  const extracted = extractFirstJSONObject(content)
  if (extracted)
    candidates.push(extracted)

  for (const candidate of candidates) {
    try {
      return { ok: true, value: JSON.parse(candidate) as T }
    }
    catch {}
  }

  return { ok: false }
}

function extractFencedJSON(content: string): string | undefined {
  const fenceStart = content.indexOf('```')
  if (fenceStart < 0)
    return undefined

  let bodyStart = fenceStart + 3
  const firstLineEnd = content.indexOf('\n', bodyStart)
  if (firstLineEnd >= 0) {
    const info = content.slice(bodyStart, firstLineEnd).trim().toLowerCase()
    if (info === '' || info === 'json')
      bodyStart = firstLineEnd + 1
  }

  const fenceEnd = content.indexOf('```', bodyStart)
  if (fenceEnd < 0)
    return undefined

  const fenced = content.slice(bodyStart, fenceEnd).trim()
  return fenced || undefined
}

function extractFirstJSONObject(content: string): string | undefined {
  const start = content.indexOf('{')
  if (start < 0)
    return undefined

  let depth = 0
  let inString = false
  let escaped = false

  for (let index = start; index < content.length; index++) {
    const char = content[index]

    if (escaped) {
      escaped = false
      continue
    }

    if (char === '\\') {
      escaped = inString
      continue
    }

    if (char === '"') {
      inString = !inString
      continue
    }

    if (inString)
      continue

    if (char === '{')
      depth += 1
    else if (char === '}')
      depth -= 1

    if (depth === 0)
      return content.slice(start, index + 1)
  }

  return undefined
}

function withJSONRepairPrompt(params: ChatParams, label: string, content: string): ChatParams {
  return {
    ...params,
    max_tokens: Math.max(typeof params.max_tokens === 'number' ? params.max_tokens : 0, 8192),
    temperature: 0,
    messages: [
      ...params.messages,
      {
        role: 'assistant',
        content: content.slice(0, JSON_REPAIR_PREVIEW_CHARS),
      },
      {
        role: 'user',
        content: [
          `The previous ${label} response was invalid, incomplete, or contained non-JSON text.`,
          'Return one complete JSON object only.',
          'Do not use Markdown fences, prose, comments, trailing text, or partial keys.',
          'Close every object and array before finishing.',
        ].join('\n'),
      },
    ],
  }
}

function invalidJSONError(label: string, content: string): Error {
  return new Error(`OpenAI returned invalid ${label} JSON: ${content.slice(0, 200)}`)
}

function isResponseFormatUnavailableError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  const normalized = message.toLowerCase()
  return normalized.includes('response_format')
    && (
      normalized.includes('unavailable')
      || normalized.includes('unsupported')
      || normalized.includes('not supported')
      || normalized.includes('not available')
      || normalized.includes('not enabled')
    )
}
