import type { DataSourceGenerationInput, DataSourceGenerationOutput, LLMConfig, LLMProvider, SchemaGenerationInput, SchemaGenerationOutput } from './types'

export class OpenAIProvider implements LLMProvider {
  readonly name = 'openai'
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

  async generateSchema(input: SchemaGenerationInput): Promise<SchemaGenerationOutput> {
    const { prompt, currentSchema, systemPrompt } = input

    const userContent = currentSchema
      ? `Current schema context:\n${JSON.stringify(currentSchema, null, 2)}\n\nUser request: ${prompt}`
      : prompt

    const response = await this.client.chat.completions.create({
      model: this.model,
      max_tokens: 8192,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
      response_format: { type: 'json_object' },
    })

    const content = response.choices[0]?.message?.content
    if (!content) {
      throw new Error('OpenAI returned empty response')
    }

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
    const { systemPrompt, expectedDataSource } = input

    const response = await this.client.chat.completions.create({
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
    })

    const content = response.choices[0]?.message?.content
    if (!content) {
      throw new Error('OpenAI returned empty response')
    }

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
}
