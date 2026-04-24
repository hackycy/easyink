import type { Anthropic } from '@anthropic-ai/sdk'
import type { DataSourceGenerationInput, DataSourceGenerationOutput, LLMConfig, LLMProvider, SchemaGenerationInput, SchemaGenerationOutput } from './types'

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
  private client: Anthropic
  private model: string

  private constructor(config: LLMConfig, AnthropicClass: typeof Anthropic) {
    this.client = new AnthropicClass({ apiKey: config.apiKey, baseURL: config.baseUrl })
    this.model = config.model ?? 'claude-sonnet-4-6'
  }

  static async create(config: LLMConfig): Promise<ClaudeProvider> {
    const { Anthropic: AnthropicClass } = await import('@anthropic-ai/sdk')
    return new ClaudeProvider(config, AnthropicClass)
  }

  async generateSchema(input: SchemaGenerationInput): Promise<SchemaGenerationOutput> {
    const { prompt, currentSchema, systemPrompt } = input

    const userContent = currentSchema
      ? `Current schema context:\n${JSON.stringify(currentSchema, null, 2)}\n\nUser request: ${prompt}`
      : prompt

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 8192,
      system: systemPrompt,
      messages: [{ role: 'user', content: userContent }],
      tools: [TOOL_GENERATE_SCHEMA],
      tool_choice: { type: 'tool', name: 'generate_schema' },
    })

    const toolBlock = response.content.find(
      (block: { type: string, name?: string, input?: unknown }) =>
        block.type === 'tool_use' && block.name === 'generate_schema',
    )
    if (!toolBlock || toolBlock.type !== 'tool_use') {
      throw new Error('Claude did not return a tool_use block for generate_schema')
    }

    const result = toolBlock.input as { schema: unknown, expectedDataSource: unknown }
    if (!result.schema || !result.expectedDataSource) {
      throw new Error('Claude returned incomplete tool_use result')
    }

    return {
      schema: result.schema as SchemaGenerationOutput['schema'],
      expectedDataSource: result.expectedDataSource as SchemaGenerationOutput['expectedDataSource'],
    }
  }

  async generateDataSource(input: DataSourceGenerationInput): Promise<DataSourceGenerationOutput> {
    const { systemPrompt, expectedDataSource } = input

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{
        role: 'user',
        content: `Generate a complete DataSourceDescriptor based on this expected structure:\n${JSON.stringify(expectedDataSource, null, 2)}`,
      }],
      tools: [TOOL_GENERATE_DATASOURCE],
      tool_choice: { type: 'tool', name: 'generate_datasource' },
    })

    const toolBlock = response.content.find(
      (block: { type: string, name?: string, input?: unknown }) =>
        block.type === 'tool_use' && block.name === 'generate_datasource',
    )
    if (!toolBlock || toolBlock.type !== 'tool_use') {
      throw new Error('Claude did not return a tool_use block for generate_datasource')
    }

    const result = toolBlock.input as { dataSource: unknown }
    return result.dataSource as DataSourceGenerationOutput
  }
}
