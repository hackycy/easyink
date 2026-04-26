import type { TemplateGenerationIntent } from '@easyink/schema-tools'
import type { DataSourceGenerationInput, DataSourceGenerationOutput, LLMConfig, LLMProgressEvent, LLMProvider, SchemaGenerationInput, SchemaGenerationOutput, TemplateIntentGenerationInput } from './types'

/** Minimum interval between `llm-delta` progress emissions, in ms. */
const PROGRESS_THROTTLE_MS = 1000

export class OpenAIProvider implements LLMProvider {
  readonly name = 'openai'
  readonly supportsStreaming = true
  private client: import('openai').OpenAI
  private model: string

  private constructor(config: LLMConfig, OpenAIClass: typeof import('openai').OpenAI) {
    this.client = new OpenAIClass({ apiKey: config.apiKey, baseURL: config.baseUrl })
    this.model = config.model ?? 'gpt-4o'
  }

  static async create(config: LLMConfig): Promise<OpenAIProvider> {
    const { OpenAI: OpenAIClass } = await import('openai')
    return new OpenAIProvider(config, OpenAIClass)
  }

  async generateTemplateIntent(input: TemplateIntentGenerationInput): Promise<TemplateGenerationIntent> {
    const { prompt, currentSchema, systemPrompt, generationPlan, signal, onProgress } = input

    const userContent = [
      currentSchema ? `Current schema context:\n${JSON.stringify(currentSchema, null, 2)}` : undefined,
      generationPlan ? `EasyInk generation plan:\n${JSON.stringify(generationPlan, null, 2)}` : undefined,
      `User request: ${prompt}`,
    ].filter(Boolean).join('\n\n')

    const content = await this.streamJSON(
      {
        model: this.model,
        max_tokens: 4096,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent },
        ],
        response_format: { type: 'json_object' },
      },
      signal,
      onProgress,
    )

    try {
      return JSON.parse(content) as TemplateGenerationIntent
    }
    catch {
      throw new Error(`OpenAI returned invalid TemplateIntent JSON: ${content.slice(0, 200)}`)
    }
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
        response_format: { type: 'json_object' },
      },
      signal,
      onProgress,
    )

    let parsed: { schema?: unknown, expectedDataSource?: unknown }
    try {
      parsed = JSON.parse(content)
    }
    catch {
      throw new Error(`OpenAI returned invalid JSON: ${content.slice(0, 200)}`)
    }

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
        response_format: { type: 'json_object' },
      },
      signal,
      onProgress,
    )

    let parsed: { dataSource?: unknown }
    try {
      parsed = JSON.parse(content)
    }
    catch {
      throw new Error(`OpenAI returned invalid JSON: ${content.slice(0, 200)}`)
    }

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
    params: import('openai/resources/chat/completions').ChatCompletionCreateParamsBase,
    signal: AbortSignal | undefined,
    onProgress: ((event: LLMProgressEvent) => void) | undefined,
  ): Promise<string> {
    onProgress?.({ phase: 'llm-start', tokens: 0, message: 'Calling OpenAI...' })

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
}
