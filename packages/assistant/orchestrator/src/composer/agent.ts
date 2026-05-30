import type { LLMClient } from '@easyink/assistant-llm'
import type { MaterialKnowledgeRegistry } from '@easyink/assistant-material-knowledge'
import type { ToolManifest } from '@easyink/assistant-tool-registry'
import type {
  ComposerAgentOptions,
  ComposerEventHandler,
  ComposerInput,
  ComposerResult,
  ComposerStep,
  ToolCallRecord,
} from './types'
import { createRegistryFromManifest, MaterialKnowledgeRegistry as KnowledgeRegistry } from '@easyink/assistant-material-knowledge'
import { ScenarioClassifier } from '@easyink/assistant-scenario-templates'
import { SchemaBuilder } from '@easyink/assistant-schema-builder'
import {
  createDataTools,
  createLayoutTools,
  createMaterialTools,
  createSchemaTools,
  ToolRegistry,
} from '@easyink/assistant-tool-registry'
import { TypeAligner } from '@easyink/assistant-type-aligner'

const MAX_ITERATIONS = 15

export class ComposerAgent {
  private readonly llm: LLMClient
  private readonly providedRegistry?: MaterialKnowledgeRegistry
  private readonly maxIterations: number

  constructor(options: ComposerAgentOptions) {
    this.llm = options.llm
    this.providedRegistry = options.registry
    this.maxIterations = options.maxIterations ?? MAX_ITERATIONS
  }

  async compose(input: ComposerInput, onStep?: ComposerEventHandler): Promise<ComposerResult> {
    const registry = this.providedRegistry ?? this.buildRegistryFromInput(input)
    const pageMode = input.pageMode ?? 'fixed'
    const pageWidth = input.pageWidth ?? (pageMode === 'continuous' ? 72 : 210)
    const pageHeight = input.pageHeight ?? (pageMode === 'continuous' ? 200 : 297)
    const dataSourceName = input.sourceName ?? 'dataSource'

    const builder = new SchemaBuilder(
      { pageMode, pageWidth, pageHeight, unit: 'mm', dataSourceName },
      registry,
    )
    const aligner = new TypeAligner(registry)
    const classifier = new ScenarioClassifier()

    const toolRegistry = new ToolRegistry()
    for (const tool of createMaterialTools(registry)) toolRegistry.register(tool)
    for (const tool of createSchemaTools(builder)) toolRegistry.register(tool)
    for (const tool of createDataTools(aligner)) toolRegistry.register(tool)
    for (const tool of createLayoutTools(classifier)) toolRegistry.register(tool)

    const toolManifest = toolRegistry.manifest()
    const systemPrompt = this.buildSystemPrompt(toolManifest, input, registry)
    const toolCalls: ToolCallRecord[] = []
    const warnings: string[] = []

    const messages: Array<{ role: string, content: string }> = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: this.buildUserMessage(input) },
    ]

    const toolContext = {
      pageMode,
      pageWidth,
      pageHeight,
      unit: 'mm' as const,
      dataSourceName,
      currentElements: [],
    }

    let iterations = 0
    while (iterations < this.maxIterations) {
      iterations++
      this.emit(onStep, { type: 'think', timestamp: Date.now() })

      const response = await this.llm.complete({
        messages: messages.map(m => ({ role: m.role as 'system' | 'user' | 'assistant', content: m.content })),
        options: { responseFormat: 'json', temperature: 0.2 },
      })

      const parsed = this.parseResponse(response.content)

      if (parsed.type === 'complete') {
        this.emit(onStep, { type: 'complete', content: 'Schema generation complete', timestamp: Date.now() })
        break
      }

      if (parsed.type === 'tool_call' && parsed.toolName) {
        this.emit(onStep, { type: 'tool_call', toolName: parsed.toolName, toolInput: parsed.toolInput, timestamp: Date.now() })

        const result = await toolRegistry.execute(parsed.toolName, parsed.toolInput, toolContext)
        toolCalls.push({ tool: parsed.toolName, input: parsed.toolInput, output: result.data, timestamp: Date.now() })

        this.emit(onStep, { type: 'tool_result', toolName: parsed.toolName, toolResult: result, timestamp: Date.now() })

        messages.push({ role: 'assistant', content: response.content })
        messages.push({ role: 'user', content: JSON.stringify({ tool_result: { name: parsed.toolName, result: result.data, error: result.error } }) })

        if (!result.success) {
          warnings.push(`Tool ${parsed.toolName} failed: ${result.error}`)
        }
      }
      else {
        messages.push({ role: 'assistant', content: response.content })
        messages.push({ role: 'user', content: '{"instruction": "Continue. Call a tool or output {\"type\": \"complete\"} when done."}' })
      }
    }

    const schema = builder.buildSchema()
    const dataSignature = aligner.infer(input.sourceData, dataSourceName)
    const expectedDataSource = this.buildExpectedDataSource(dataSignature, dataSourceName)

    return { schema, expectedDataSource, warnings, iterations, toolCalls }
  }

  private buildSystemPrompt(tools: ToolManifest[], input: ComposerInput, registry: MaterialKnowledgeRegistry): string {
    const classifier = new ScenarioClassifier()
    const classification = classifier.classify(input.prompt)
    const focused = classification ? classifier.getFocusedContext(classification.scenario) : undefined

    const materialSection = focused
      ? `Relevant materials for this scenario (${classification!.scenario}): ${focused.relevantMaterials.join(', ')}`
      : `Available materials: ${registry.types().join(', ')}`

    return [
      'You are EasyInk Composer Agent - a document template architect.',
      'Your job: transform user requirements into print-ready document templates by calling tools.',
      '',
      'WORKFLOW:',
      '1. Classify the scenario (call classify_scenario)',
      '2. Plan regions (call plan_region)',
      '3. If source data exists, infer the data contract (call infer_contract)',
      '4. For each region, query suitable materials (call query_material)',
      '5. Emit elements one by one (call emit_text, emit_table_data, emit_table_static, emit_element)',
      '6. Validate (call validate_schema)',
      '7. When done, output {"type": "complete"}',
      '',
      `${materialSection}`,
      '',
      'RULES:',
      '- All coordinates and sizes are in mm',
      '- Field paths use slash-separated absolute paths (e.g. "items/name")',
      '- Column ratios are auto-normalized to sum to 1',
      '- Only use registered material types',
      '- Binding sourceId and sourceName are auto-set to the data source name',
      '',
      focused ? `SCENARIO HINTS:\n${focused.promptHints.join('\n')}` : '',
      '',
      'AVAILABLE TOOLS:',
      tools.map(t => `- ${t.name}: ${t.description}`).join('\n'),
      '',
      'OUTPUT FORMAT: Always respond with JSON.',
      'To call a tool: {"type": "tool_call", "name": "<tool_name>", "input": {...}}',
      'When finished: {"type": "complete"}',
    ].filter(Boolean).join('\n')
  }

  private buildUserMessage(input: ComposerInput): string {
    const parts = [`User request: ${input.prompt}`]
    if (input.sourceData) {
      parts.push(`Source data sample:\n${JSON.stringify(input.sourceData, null, 2).slice(0, 8000)}`)
    }
    if (input.currentSchema) {
      parts.push(`Current schema context (for reference):\n${JSON.stringify(input.currentSchema, null, 2).slice(0, 4000)}`)
    }
    return parts.join('\n\n')
  }

  private parseResponse(content: string): { type: string, toolName?: string, toolInput?: unknown } {
    try {
      const json = JSON.parse(content.trim().replace(/^```json?\n?/, '').replace(/\n?```$/, ''))
      if (json.type === 'complete')
        return { type: 'complete' }
      if (json.type === 'tool_call' && json.name) {
        return { type: 'tool_call', toolName: json.name, toolInput: json.input ?? {} }
      }
      return { type: 'unknown' }
    }
    catch {
      const match = content.match(/\{[\s\S]*\}/)
      if (match) {
        try {
          const json = JSON.parse(match[0])
          if (json.type === 'complete')
            return { type: 'complete' }
          if (json.type === 'tool_call' && json.name) {
            return { type: 'tool_call', toolName: json.name, toolInput: json.input ?? {} }
          }
        }
        catch { /* ignore */ }
      }
      return { type: 'unknown' }
    }
  }

  private buildExpectedDataSource(signature: { name: string, fields: Array<{ path: string, name: string, type: string, isArray: boolean, children?: unknown[] }> }, name: string): Record<string, unknown> {
    const fields = this.convertToExpectedFields(signature.fields)
    const sampleData = this.buildSampleData(signature.fields)
    return { name, fields, sampleData }
  }

  private convertToExpectedFields(fields: Array<{ path: string, name: string, type: string, isArray: boolean, children?: unknown[] }>): unknown[] {
    return fields.map(f => ({
      name: f.name,
      path: f.path,
      type: f.isArray ? 'array' : f.type,
      children: f.children ? this.convertToExpectedFields(f.children as typeof fields) : undefined,
    }))
  }

  private buildSampleData(fields: Array<{ path: string, name: string, type: string, isArray: boolean, children?: unknown[] }>): Record<string, unknown> {
    const data: Record<string, unknown> = {}
    for (const field of fields) {
      if (field.isArray) {
        data[field.name] = field.children ? [this.buildSampleData(field.children as typeof fields)] : []
      }
      else if (field.type === 'object' && field.children) {
        data[field.name] = this.buildSampleData(field.children as typeof fields)
      }
      else if (field.type === 'number') {
        data[field.name] = 0
      }
      else if (field.type === 'boolean') {
        data[field.name] = false
      }
      else {
        data[field.name] = ''
      }
    }
    return data
  }

  private emit(handler: ComposerEventHandler | undefined, step: ComposerStep): void {
    if (handler)
      handler(step)
  }

  private buildRegistryFromInput(input: ComposerInput): MaterialKnowledgeRegistry {
    if (input.materialManifest) {
      return createRegistryFromManifest(input.materialManifest as any)
    }
    return new KnowledgeRegistry()
  }
}
