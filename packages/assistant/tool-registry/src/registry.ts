import type { ToolCallResult, ToolDefinition, ToolExecutionContext, ToolManifest } from './types'

export class ToolRegistry {
  private readonly tools = new Map<string, ToolDefinition>()

  register(tool: ToolDefinition): void {
    this.tools.set(tool.name, tool)
  }

  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name)
  }

  has(name: string): boolean {
    return this.tools.has(name)
  }

  async execute(name: string, input: unknown, context: ToolExecutionContext): Promise<ToolCallResult> {
    const tool = this.tools.get(name)
    if (!tool)
      return { success: false, error: `Unknown tool: ${name}` }

    const parsed = tool.parameters.safeParse(input)
    if (!parsed.success) {
      return { success: false, error: `Invalid parameters: ${parsed.error.message}` }
    }

    try {
      const result = await tool.execute(parsed.data, context)
      return { success: true, data: result }
    }
    catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return { success: false, error: message }
    }
  }

  manifest(): ToolManifest[] {
    return [...this.tools.values()].map(tool => ({
      name: tool.name,
      description: tool.description,
      category: tool.category,
      parameters: this.schemaToJson(tool.parameters),
    }))
  }

  byCategory(category: string): ToolDefinition[] {
    return [...this.tools.values()].filter(t => t.category === category)
  }

  names(): string[] {
    return [...this.tools.keys()]
  }

  private schemaToJson(schema: unknown): Record<string, unknown> {
    if (schema && typeof schema === 'object' && 'shape' in schema) {
      const shape = (schema as { shape: Record<string, unknown> }).shape
      const result: Record<string, unknown> = {}
      for (const [key, value] of Object.entries(shape)) {
        result[key] = { type: this.inferZodType(value) }
      }
      return result
    }
    return {}
  }

  private inferZodType(schema: unknown): string {
    if (!schema || typeof schema !== 'object')
      return 'unknown'
    const s = schema as Record<string, unknown>
    if ('_def' in s) {
      const def = s._def as Record<string, unknown>
      if (def.typeName === 'ZodString')
        return 'string'
      if (def.typeName === 'ZodNumber')
        return 'number'
      if (def.typeName === 'ZodBoolean')
        return 'boolean'
      if (def.typeName === 'ZodArray')
        return 'array'
      if (def.typeName === 'ZodObject')
        return 'object'
    }
    return 'unknown'
  }
}
