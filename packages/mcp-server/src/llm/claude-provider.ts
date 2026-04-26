import type { Anthropic } from '@anthropic-ai/sdk'
import type { TemplateGenerationIntent } from '@easyink/schema-tools'
import type { DataSourceGenerationInput, DataSourceGenerationOutput, LLMConfig, LLMProgressEvent, LLMProvider, PlanGenerationInput, PlanGenerationOutput, SchemaGenerationInput, SchemaGenerationOutput, TemplateIntentGenerationInput } from './types'

const PROGRESS_THROTTLE_MS = 1000

const TOOL_GENERATE_PLAN = {
  name: 'generate_plan',
  description: 'Decide the deterministic generation plan for an EasyInk template (domain, paper, table strategy).',
  input_schema: {
    type: 'object' as const,
    properties: {
      domain: { type: 'string' },
      page: {
        type: 'object',
        properties: {
          mode: { type: 'string', enum: ['fixed', 'stack', 'label', 'continuous'] },
          width: { type: 'number' },
          height: { type: 'number' },
          reason: { type: 'string' },
        },
        required: ['mode', 'width', 'height'],
      },
      tableStrategy: {
        type: 'string',
        enum: ['table-data-for-arrays', 'table-static-for-fixed', 'avoid-table'],
      },
      confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    },
    required: ['domain', 'page', 'tableStrategy'],
  },
}

const TOOL_GENERATE_SCHEMA = {
  name: 'generate_schema',
  description: 'Generate a valid EasyInk DocumentSchema and expected data source structure',
  input_schema: {
    type: 'object' as const,
    properties: {
      schema: {
        type: 'object',
        description: 'A valid EasyInk DocumentSchema object with version, unit, page, guides, elements',
      },
      expectedDataSource: {
        type: 'object',
        description: 'Expected data source structure with name and fields array',
        properties: {
          name: { type: 'string' },
          fields: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                type: { type: 'string', enum: ['string', 'number', 'boolean', 'array', 'object'] },
                required: { type: 'boolean' },
                path: { type: 'string' },
                children: { type: 'array' },
              },
              required: ['name', 'type', 'path'],
            },
          },
        },
        required: ['name', 'fields'],
      },
    },
    required: ['schema', 'expectedDataSource'],
  },
}

const TOOL_GENERATE_TEMPLATE_INTENT = {
  name: 'generate_template_intent',
  description: 'Generate a compact EasyInk TemplateIntent. Do not generate DocumentSchema.',
  input_schema: {
    type: 'object' as const,
    properties: {
      name: { type: 'string' },
      domain: { type: 'string' },
      dataSourceName: { type: 'string' },
      page: { type: 'object' },
      fields: { type: 'array', items: { type: 'object' } },
      sections: { type: 'array', items: { type: 'object' } },
      sampleData: { type: 'object' },
      warnings: { type: 'array', items: { type: 'string' } },
    },
    required: ['fields', 'sections'],
  },
}

const TOOL_GENERATE_DATASOURCE = {
  name: 'generate_datasource',
  description: 'Generate a valid EasyInk DataSourceDescriptor',
  input_schema: {
    type: 'object' as const,
    properties: {
      dataSource: {
        type: 'object',
        description: 'A valid DataSourceDescriptor with id, name, fields array',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          tag: { type: 'string' },
          title: { type: 'string' },
          fields: { type: 'array' },
        },
        required: ['id', 'name', 'fields'],
      },
    },
    required: ['dataSource'],
  },
}

export class ClaudeProvider implements LLMProvider {
  readonly name = 'claude'
  readonly supportsStreaming = true
  private client: Anthropic
  private model: string
  private strictOutput: boolean

  private constructor(config: LLMConfig, AnthropicClass: typeof Anthropic) {
    this.client = new AnthropicClass({ apiKey: config.apiKey, baseURL: config.baseUrl })
    this.model = config.model ?? 'claude-sonnet-4-6'
    this.strictOutput = config.strictOutput ?? true
  }

  static async create(config: LLMConfig): Promise<ClaudeProvider> {
    const { Anthropic: AnthropicClass } = await import('@anthropic-ai/sdk')
    return new ClaudeProvider(config, AnthropicClass)
  }

  async generatePlan(input: PlanGenerationInput): Promise<PlanGenerationOutput> {
    const { prompt, systemPrompt, signal, onProgress } = input

    const toolInput = await this.streamToolUse(
      {
        model: this.model,
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: 'user', content: `User request: ${prompt}` }],
        tools: [this.toolDefinition(TOOL_GENERATE_PLAN)],
        tool_choice: { type: 'tool', name: 'generate_plan' },
      },
      'generate_plan',
      signal,
      onProgress,
    )

    return toolInput as PlanGenerationOutput
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

    const params: Anthropic.Messages.MessageCreateParamsNonStreaming = {
      model: this.model,
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: 'user', content: userContent }],
      tools: [this.toolDefinition(TOOL_GENERATE_TEMPLATE_INTENT)],
      tool_choice: { type: 'tool', name: 'generate_template_intent' },
    }
    if (typeof temperature === 'number')
      params.temperature = temperature

    const toolInput = await this.streamToolUse(
      params,
      'generate_template_intent',
      signal,
      onProgress,
    )

    return toolInput as TemplateGenerationIntent
  }

  async generateSchema(input: SchemaGenerationInput): Promise<SchemaGenerationOutput> {
    const { prompt, currentSchema, systemPrompt, generationPlan, signal, onProgress } = input

    const userContent = [
      currentSchema ? `Current schema context:\n${JSON.stringify(currentSchema, null, 2)}` : undefined,
      generationPlan ? `EasyInk generation plan:\n${JSON.stringify(generationPlan, null, 2)}` : undefined,
      `User request: ${prompt}`,
    ].filter(Boolean).join('\n\n')

    const toolInput = await this.streamToolUse(
      {
        model: this.model,
        max_tokens: 8192,
        system: systemPrompt,
        messages: [{ role: 'user', content: userContent }],
        tools: [this.toolDefinition(TOOL_GENERATE_SCHEMA)],
        tool_choice: { type: 'tool', name: 'generate_schema' },
      },
      'generate_schema',
      signal,
      onProgress,
    )

    const result = toolInput as { schema?: unknown, expectedDataSource?: unknown }
    if (!result.schema || !result.expectedDataSource) {
      throw new Error('Claude returned incomplete tool_use result')
    }

    return {
      schema: result.schema as SchemaGenerationOutput['schema'],
      expectedDataSource: result.expectedDataSource as SchemaGenerationOutput['expectedDataSource'],
    }
  }

  async generateDataSource(input: DataSourceGenerationInput): Promise<DataSourceGenerationOutput> {
    const { systemPrompt, expectedDataSource, signal, onProgress } = input

    const toolInput = await this.streamToolUse(
      {
        model: this.model,
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{
          role: 'user',
          content: `Generate a complete DataSourceDescriptor based on this expected structure:\n${JSON.stringify(expectedDataSource, null, 2)}`,
        }],
        tools: [this.toolDefinition(TOOL_GENERATE_DATASOURCE)],
        tool_choice: { type: 'tool', name: 'generate_datasource' },
      },
      'generate_datasource',
      signal,
      onProgress,
    )

    const result = toolInput as { dataSource?: unknown }
    if (!result.dataSource) {
      throw new Error('Claude returned incomplete tool_use result for generate_datasource')
    }
    return result.dataSource as DataSourceGenerationOutput
  }

  /**
   * Drive a streaming Claude messages.create call that produces a single
   * tool_use block. Aggregates the tool input deltas and emits throttled
   * progress so the MCP request timeout can be reset.
   */
  private async streamToolUse(
    params: Anthropic.Messages.MessageCreateParamsNonStreaming,
    expectedToolName: string,
    signal: AbortSignal | undefined,
    onProgress: ((event: LLMProgressEvent) => void) | undefined,
  ): Promise<unknown> {
    onProgress?.({ phase: 'llm-start', tokens: 0, message: 'Calling Claude...' })

    const stream = this.client.messages.stream(params, { signal })

    let lastEmit = Date.now()
    let deltaCount = 0
    let charCount = 0

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'input_json_delta') {
        deltaCount++
        charCount += event.delta.partial_json.length
        const now = Date.now()
        if (now - lastEmit >= PROGRESS_THROTTLE_MS) {
          lastEmit = now
          onProgress?.({
            phase: 'llm-delta',
            tokens: deltaCount,
            message: `Received ${deltaCount} chunks (${charCount} chars)`,
          })
        }
      }
    }

    const finalMessage = await stream.finalMessage()
    onProgress?.({ phase: 'llm-done', tokens: deltaCount, message: `Total ${charCount} chars` })

    const toolBlock = finalMessage.content.find(
      (block): block is Anthropic.Messages.ToolUseBlock =>
        block.type === 'tool_use' && block.name === expectedToolName,
    )
    if (!toolBlock) {
      throw new Error(`Claude did not return a tool_use block for ${expectedToolName}`)
    }
    return toolBlock.input
  }

  private toolDefinition<T extends Record<string, unknown>>(tool: T): T {
    return this.strictOutput ? { ...tool, strict: true } : tool
  }
}
