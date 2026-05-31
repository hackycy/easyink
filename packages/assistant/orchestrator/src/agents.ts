import type { ParsedExternalData } from '@easyink/assistant-adapters'
import type { AssistantTaskInput, AssistantValidationIssue } from '@easyink/assistant-capabilities'
import type { LLMClient } from '@easyink/assistant-llm'
import type { AssistantStore } from '@easyink/assistant-store'
import type { DocumentSchema, ExpectedDataSource, ExpectedField } from '@easyink/schema'
import type { PromptContext } from './prompts'
import { formatSchemaValidationIssue, isValidSchema, validateSchemaIssues } from '@easyink/schema'
import { normalizeAllFieldPaths, SchemaValidator } from '@easyink/schema-tools'
import { z } from 'zod'
import { buildLayoutMaterialContext, buildLayoutSystemPrompt, buildMaterialContext, buildSchemaRepairSystemPrompt, buildSchemaSystemPrompt } from './prompts'

export interface AssistantAgentContext {
  input: AssistantTaskInput
  taskId: string
  store: AssistantStore
  llm?: LLMClient
  sourceData?: ParsedExternalData
}

export interface IntakeAgentResult {
  requiresClarification: boolean
  questions: string[]
  suggestedAnswers: string[][]
  taskType?: string
}

export interface PlannerAgentResult {
  documentIntent?: string
  scenario?: string
  page?: PlannerPage
  confidence?: 'high' | 'medium' | 'low'
  requiredBlocks: string[]
  dataNeeds: string[]
  styleHints: string[]
  uncertainty: string[]
  summary?: string
  warnings: string[]
}

export interface SourceAgentResult {
  fieldMeanings: Record<string, string>
  warnings: string[]
}

export interface ValidatorAgentResult {
  explanation?: string
  repairHint?: string
}

export interface SchemaAgentResult {
  schema: DocumentSchema
  expectedDataSource: ExpectedDataSource
  planningBrief: PlanningBrief
  warnings: string[]
}

export interface ContractAgentResult {
  dataSource?: ExpectedDataSource
  warnings: string[]
}

export interface LayoutBox {
  id: string
  type: string
  x: number
  y: number
  width: number
  height: number
}

export interface LayoutAgentResult {
  page?: PlannerPage
  blocks: LayoutBox[]
  warnings: string[]
}

export interface SchemaUpstreamContext {
  contract?: ContractAgentResult
  layout?: LayoutAgentResult
}

export interface SchemaRepairRequest {
  schemaResult: SchemaAgentResult
  errors: AssistantValidationIssue[]
  upstream?: SchemaUpstreamContext
  memorySummary?: string
}

export interface AssistantAgentBundle {
  intake: IntakeAgentResult
  planner: PlannerAgentResult
  source: SourceAgentResult
  validator: ValidatorAgentResult
  memorySummary?: string
}

export interface PlannerPage {
  mode?: 'fixed' | 'continuous'
  width?: number
  height?: number
  unit?: 'mm' | 'px' | 'pt'
  pages?: number
  reason?: string
}

export interface PlanningBrief {
  documentIntent?: string
  scenario?: string
  confidence?: 'high' | 'medium' | 'low'
  page?: {
    mode?: 'fixed' | 'continuous'
    width?: number
    height?: number
    unit: 'mm' | 'px' | 'pt'
    reason?: string
  }
  fieldNaming: 'english-camel-path-chinese-label'
  sampleData: 'required'
  requiredBlocks: string[]
  dataNeeds: string[]
  styleHints: string[]
  uncertainty: string[]
  warnings: string[]
}

const IntakeSchema = z.object({
  requiresClarification: z.boolean().optional(),
  questions: z.array(z.string()).optional(),
  suggestedAnswers: z.array(z.array(z.string())).optional(),
  taskType: z.string().optional(),
})

const PlannerSchema = z.object({
  documentIntent: z.string().optional(),
  scenario: z.string().optional(),
  page: z.object({
    mode: z.enum(['fixed', 'continuous']).optional(),
    width: z.number().optional(),
    height: z.number().optional(),
    unit: z.enum(['mm', 'px', 'pt']).optional(),
    pages: z.number().optional(),
    reason: z.string().optional(),
  }).optional(),
  confidence: z.enum(['high', 'medium', 'low']).optional(),
  requiredBlocks: z.array(z.string()).optional(),
  dataNeeds: z.array(z.string()).optional(),
  styleHints: z.array(z.string()).optional(),
  uncertainty: z.array(z.string()).optional(),
  summary: z.string().optional(),
  warnings: z.array(z.string()).optional(),
})

const SourceSchema = z.object({
  fieldMeanings: z.record(z.string()).optional(),
  warnings: z.array(z.string()).optional(),
})

const ValidatorSchema = z.object({
  explanation: z.string().optional(),
  repairHint: z.string().optional(),
})

const ExpectedFieldSchema: z.ZodType<ExpectedField> = z.lazy(() => z.object({
  name: z.string(),
  title: z.string().optional(),
  fieldLabel: z.string().optional(),
  type: z.enum(['string', 'number', 'boolean', 'array', 'object']),
  required: z.boolean().optional(),
  path: z.string(),
  children: z.array(ExpectedFieldSchema).optional(),
}))

const ExpectedDataSourceSchema: z.ZodType<ExpectedDataSource> = z.object({
  name: z.string(),
  fields: z.array(ExpectedFieldSchema),
  sampleData: z.record(z.unknown()).optional(),
})

const SchemaAgentSchema = z.object({
  schema: z.unknown(),
  expectedDataSource: z.unknown(),
  warnings: z.array(z.string()).optional(),
})

const ContractSchema = z.object({
  name: z.string().optional(),
  fields: z.unknown().optional(),
  sampleData: z.record(z.unknown()).optional(),
  warnings: z.array(z.string()).optional(),
})

const LayoutSchema = z.object({
  page: z.object({
    mode: z.enum(['fixed', 'continuous']).optional(),
    width: z.number().optional(),
    height: z.number().optional(),
    pages: z.number().optional(),
    reason: z.string().optional(),
  }).optional(),
  blocks: z.array(z.object({
    id: z.string(),
    type: z.string(),
    x: z.number(),
    y: z.number(),
    width: z.number(),
    height: z.number(),
  })).optional(),
  warnings: z.array(z.string()).optional(),
})

export async function runAssistantAgents(context: AssistantAgentContext): Promise<AssistantAgentBundle> {
  const memorySummary = await runMemoryAgent(context)
  const intake = await runIntakeAgent(context, memorySummary)
  const planner = await runPlannerAgent(context, memorySummary).catch((error: unknown) => ({
    ...emptyPlannerResult(),
    warnings: [formatAgentWarning('Planner', error)],
  }))
  const source = await runSourceAgent(context).catch((error: unknown) => ({
    fieldMeanings: {},
    warnings: [formatAgentWarning('Source', error)],
  }))
  const validator = await runValidatorAgent(context).catch((error: unknown) => ({
    explanation: formatAgentWarning('Validator', error),
  }))
  return { intake, planner, source, validator, memorySummary }
}

export async function runIntakeAgent(context: AssistantAgentContext, memorySummary?: string): Promise<IntakeAgentResult> {
  const fallback = heuristicIntake(context.input.prompt)
  if (!context.llm)
    return fallback
  const result = await completeJson(context.llm, IntakeSchema, {
    messages: [
      '你是 EasyInk Assistant 的 Intake Agent。判断任务类型，以及是否必须澄清。只输出 JSON。',
      `用户需求：${context.input.prompt}`,
      memorySummary ? `历史上下文：${memorySummary}` : '',
    ],
  }).catch(() => fallback)
  return {
    requiresClarification: result.requiresClarification ?? fallback.requiresClarification,
    questions: result.questions?.length ? result.questions : fallback.questions,
    suggestedAnswers: result.suggestedAnswers?.length ? result.suggestedAnswers : fallback.suggestedAnswers,
    taskType: result.taskType ?? fallback.taskType,
  }
}

export async function runPlannerAgent(context: AssistantAgentContext, memorySummary?: string): Promise<PlannerAgentResult> {
  if (!context.llm)
    return emptyPlannerResult()
  const result = await completeJson(context.llm, PlannerSchema, {
    messages: [
      [
        'You are EasyInk Assistant\'s planning brief writer. Output JSON only.',
        'Domain profiles and material strategies are deprecated.',
        'Your job is to describe the user goal, physical page constraints, required business blocks, data needs, style hints, and uncertainty.',
        'Do NOT choose material types. Do NOT output implementation strategy enums. The Schema Agent will choose from the registered Designer material manifest.',
        '',
        '## Scenario inference',
        'Output a `scenario` string that best describes the document type (e.g. "invoice", "receipt", "h5-landing", "poster", "prototype", "certificate", "label", "report").',
        'This is a free-form string — use whatever best matches the user intent. It will be used to match material fitness scores.',
        '',
        '## Page and unit inference',
        'Infer `page.unit` from the document context:',
        '- Print documents (invoices, receipts, labels, certificates, reports): unit = "mm"',
        '- Screen/digital documents (H5 pages, posters for digital display, prototypes, activity pages): unit = "px"',
        '- If the user explicitly mentions a unit, use that.',
        '',
        'Infer page dimensions from the scenario:',
        '- A4 print: { mode: "fixed", width: 210, height: 297, unit: "mm" }',
        '- Thermal receipt (58mm): { mode: "continuous", width: 58, unit: "mm" }',
        '- Thermal receipt (80mm): { mode: "continuous", width: 80, unit: "mm" }',
        '- Mobile H5 page: { mode: "fixed", width: 375, height: 667, unit: "px" }',
        '- Poster (portrait): { mode: "fixed", width: 1080, height: 1920, unit: "px" }',
        '- Only include page fields that are explicit in the prompt or strongly implied by the medium.',
        '',
        'Put unresolved assumptions in uncertainty instead of filling defaults.',
        'If page is present, return page.reason as one short English sentence.',
      ].join('\n'),
      `用户需求：${context.input.prompt}`,
      memorySummary ? `历史上下文：${memorySummary}` : '',
    ],
  })
  return {
    documentIntent: result.documentIntent,
    scenario: result.scenario,
    page: result.page,
    confidence: result.confidence,
    requiredBlocks: result.requiredBlocks ?? [],
    dataNeeds: result.dataNeeds ?? [],
    styleHints: result.styleHints ?? [],
    uncertainty: result.uncertainty ?? [],
    summary: result.summary,
    warnings: result.warnings ?? [],
  }
}

function emptyPlannerResult(): PlannerAgentResult {
  return {
    requiredBlocks: [],
    dataNeeds: [],
    styleHints: [],
    uncertainty: [],
    warnings: [],
  }
}

export async function runSourceAgent(context: AssistantAgentContext): Promise<SourceAgentResult> {
  if (!context.llm || !context.sourceData)
    return { fieldMeanings: {}, warnings: [] }
  const result = await completeJson(context.llm, SourceSchema, {
    messages: [
      '你是 EasyInk Assistant 的 Source Agent。解释数据源字段含义，指出字段风险。只输出 JSON。',
      `字段描述：${JSON.stringify(context.sourceData.descriptor.fields).slice(0, 6000)}`,
      `样例：${JSON.stringify(context.sourceData.sample).slice(0, 6000)}`,
    ],
  })
  return { fieldMeanings: result.fieldMeanings ?? {}, warnings: result.warnings ?? [] }
}

export async function runValidatorAgent(context: AssistantAgentContext): Promise<ValidatorAgentResult> {
  if (!context.llm)
    return {}
  return completeJson(context.llm, ValidatorSchema, {
    messages: [
      '你是 EasyInk Assistant 的 Validator Agent。解释可能的校验风险并给出 repair hint。只输出 JSON。',
      `用户需求：${context.input.prompt}`,
    ],
  })
}

export async function runSchemaAgent(
  context: AssistantAgentContext,
  planner: PlannerAgentResult,
  source: SourceAgentResult,
  memorySummary?: string,
  upstream?: SchemaUpstreamContext,
): Promise<SchemaAgentResult | undefined> {
  if (!context.llm)
    return undefined
  if (!context.input.materialManifest?.materials.length)
    return undefined

  const planningBrief = buildPlanningBrief(planner)
  const promptCtx = buildPromptContext(planningBrief)
  const materialContext = buildMaterialContext(context.input.materialManifest, planningBrief.scenario)
  const result = await completeJson(context.llm, SchemaAgentSchema, {
    messages: [
      buildSchemaSystemPrompt(materialContext, promptCtx),
      [
        `EasyInk planning brief:\n${JSON.stringify(planningBrief, null, 2)}`,
        isValidSchema(context.input.currentSchema)
          ? `Current schema context:\n${JSON.stringify(context.input.currentSchema, null, 2)}`
          : '',
        upstream?.contract?.dataSource
          ? `Expected data contract (use as the binding source of truth):\n${JSON.stringify(upstream.contract.dataSource, null, 2)}`
          : '',
        upstream?.layout?.blocks?.length
          ? `Layout skeleton (id/type/x/y/width/height in ${promptCtx.unit}; refine props and bindings, keep ids and boxes):\n${JSON.stringify(upstream.layout.blocks, null, 2)}`
          : '',
        context.sourceData
          ? `External source descriptor:\n${JSON.stringify(context.sourceData.descriptor, null, 2).slice(0, 12000)}`
          : '',
        context.sourceData
          ? `External source sample:\n${JSON.stringify(context.sourceData.sample, null, 2).slice(0, 12000)}`
          : '',
        Object.keys(source.fieldMeanings).length
          ? `Source field meanings:\n${JSON.stringify(source.fieldMeanings, null, 2)}`
          : '',
        memorySummary ? `Historical preference summary:\n${memorySummary}` : '',
        [
          `User request: ${context.input.prompt}`,
          'Use expectedDataSource.name as every binding.sourceId and binding.sourceName.',
          'Cover every explicit business requirement from the user request in the generated schema.',
        ].join('\n'),
      ].filter(Boolean).join('\n\n'),
    ],
  })

  return finalizeSchemaAgentResult(result, planningBrief)
}

export async function runContractAgent(
  context: AssistantAgentContext,
  planner: PlannerAgentResult,
  source: SourceAgentResult,
  memorySummary?: string,
): Promise<ContractAgentResult> {
  if (!context.llm)
    return { warnings: [] }
  const result = await completeJson(context.llm, ContractSchema, {
    messages: [
      [
        'You are EasyInk Assistant\'s data contract architect. Output JSON only.',
        'Define the expected data contract the document will bind to: a flat-or-nested field list plus mirrored sampleData.',
        'Field paths use slash-separated absolute paths (e.g. "items/name"). Field names are English camelCase; titles follow the prompt language.',
        'fields MUST be an array of field objects. sampleData MUST mirror every leaf field path exactly.',
        'Do NOT design layout or choose materials. Only describe the data contract.',
      ].join('\n'),
      `User request: ${context.input.prompt}`,
      planner.dataNeeds.length ? `Planned data needs: ${JSON.stringify(planner.dataNeeds)}` : '',
      Object.keys(source.fieldMeanings).length ? `Source field meanings:\n${JSON.stringify(source.fieldMeanings, null, 2)}` : '',
      context.sourceData ? `External source descriptor:\n${JSON.stringify(context.sourceData.descriptor, null, 2).slice(0, 8000)}` : '',
      context.sourceData ? `External source sample:\n${JSON.stringify(context.sourceData.sample, null, 2).slice(0, 8000)}` : '',
      memorySummary ? `Historical preference summary:\n${memorySummary}` : '',
    ],
  })

  const warnings = result.warnings ?? []
  const name = result.name?.trim()
  if (result.fields === undefined)
    return { warnings }
  try {
    const dataSource = ExpectedDataSourceSchema.parse(normalizeExpectedDataSource({
      name: name || 'dataSource',
      fields: result.fields,
      sampleData: result.sampleData,
    }))
    return { dataSource, warnings }
  }
  catch (error) {
    return { warnings: [...warnings, formatAgentWarning('Contract', error)] }
  }
}

export async function runLayoutAgent(
  context: AssistantAgentContext,
  planner: PlannerAgentResult,
  contract: ContractAgentResult,
  memorySummary?: string,
): Promise<LayoutAgentResult> {
  if (!context.llm)
    return { blocks: [], warnings: [] }
  const planningBrief = buildPlanningBrief(planner)
  const briefPage = planningBrief.page
  const unit = briefPage?.unit ?? 'mm'
  const pageMode = briefPage?.mode ?? 'fixed'
  const pageWidth = briefPage?.width ?? (pageMode === 'continuous' ? (unit === 'px' ? 375 : 80) : (unit === 'px' ? 375 : 210))
  const pageHeight = briefPage?.height ?? (pageMode === 'continuous' ? (unit === 'px' ? 800 : 200) : (unit === 'px' ? 667 : 297))

  const materialContext = buildLayoutMaterialContext(context.input.materialManifest)
  const result = await completeJson(context.llm, LayoutSchema, {
    messages: [
      buildLayoutSystemPrompt(materialContext, pageWidth, pageHeight, pageMode, unit),
      [
        `User request: ${context.input.prompt}`,
        `Planning brief:\n${JSON.stringify(planningBrief, null, 2)}`,
        contract.dataSource
          ? `Data contract fields:\n${JSON.stringify(contract.dataSource.fields, null, 2)}`
          : '',
        memorySummary ? `Historical preference summary:\n${memorySummary}` : '',
      ].filter(Boolean).join('\n\n'),
    ],
  })

  const validTypes = new Set(
    context.input.materialManifest?.materials.map(m => m.type) ?? [],
  )
  return normalizeLayoutResult(result, validTypes, pageWidth, pageHeight)
}

export async function runSchemaRepairAgent(
  context: AssistantAgentContext,
  request: SchemaRepairRequest,
): Promise<SchemaAgentResult | undefined> {
  if (!context.llm)
    return undefined
  if (!context.input.materialManifest?.materials.length)
    return undefined

  const planningBrief = request.schemaResult.planningBrief
  const promptCtx = buildPromptContext(planningBrief)
  const materialContext = buildMaterialContext(context.input.materialManifest, planningBrief.scenario)
  const result = await completeJson(context.llm, SchemaAgentSchema, {
    messages: [
      buildSchemaRepairSystemPrompt(materialContext, promptCtx),
      [
        `EasyInk planning brief:\n${JSON.stringify(planningBrief, null, 2)}`,
        `Current schema (must be repaired):\n${JSON.stringify(request.schemaResult.schema, null, 2).slice(0, 16000)}`,
        `Realized data contract:\n${JSON.stringify(request.schemaResult.expectedDataSource, null, 2)}`,
        request.upstream?.layout?.blocks?.length
          ? `Layout skeleton:\n${JSON.stringify(request.upstream.layout.blocks, null, 2)}`
          : '',
        `Deterministic validation errors to fix:\n${JSON.stringify(request.errors.map(issue => ({ code: issue.code, message: issue.message, path: issue.path })), null, 2)}`,
        request.memorySummary ? `Historical preference summary:\n${request.memorySummary}` : '',
        `User request: ${context.input.prompt}`,
      ].filter(Boolean).join('\n\n'),
    ],
  })

  const finalized = finalizeSchemaAgentResult(result, planningBrief)
  return {
    ...finalized,
    warnings: [...finalized.warnings, `Repair pass addressed ${request.errors.length} deterministic error(s).`],
  }
}

function finalizeSchemaAgentResult(
  result: z.infer<typeof SchemaAgentSchema>,
  planningBrief: PlanningBrief,
): SchemaAgentResult {
  const normalizedSchema = normalizeSchemaAgentSchema(result.schema, planningBrief)
  const schemaIssues = validateSchemaIssues(normalizedSchema.schema)
  if (schemaIssues.length > 0) {
    throw new Error(
      `Schema Agent returned an invalid DocumentSchema shape: ${schemaIssues.map(formatSchemaValidationIssue).join('; ')}`,
    )
  }
  const expectedDataSource = ExpectedDataSourceSchema.parse(normalizeExpectedDataSource(result.expectedDataSource))

  return {
    schema: normalizedSchema.schema as DocumentSchema,
    expectedDataSource,
    planningBrief,
    warnings: [
      ...normalizedSchema.warnings,
      ...(result.warnings ?? []),
    ],
  }
}

export async function runMemoryAgent(context: AssistantAgentContext): Promise<string | undefined> {
  const snapshot = await context.store.exportSnapshot()
  const related = snapshot.tasks
    .filter(task => task.id !== context.taskId)
    .slice(0, 5)
    .map(task => `${task.input.prompt} -> ${task.status}`)
  if (!related.length)
    return undefined
  if (!context.llm)
    return related.join('\n')
  const response = await context.llm.complete({
    messages: [
      { role: 'system', content: '你是 EasyInk Assistant 的 Memory Agent。用一句话总结历史任务偏好。' },
      { role: 'user', content: related.join('\n') },
    ],
  })
  return response.content.trim() || related.join('\n')
}

function buildPlanningBrief(planner: PlannerAgentResult): PlanningBrief {
  const page = planner.page ?? {}
  const hasPageFacts = page.mode || typeof page.width === 'number' || typeof page.height === 'number' || page.reason
  return {
    documentIntent: planner.documentIntent,
    scenario: planner.scenario,
    confidence: planner.confidence,
    page: hasPageFacts
      ? {
          mode: page.mode,
          width: page.width,
          height: page.height,
          unit: page.unit ?? 'mm',
          reason: page.reason,
        }
      : undefined,
    fieldNaming: 'english-camel-path-chinese-label',
    sampleData: 'required',
    requiredBlocks: planner.requiredBlocks,
    dataNeeds: planner.dataNeeds,
    styleHints: planner.styleHints,
    uncertainty: planner.uncertainty,
    warnings: planner.warnings,
  }
}

function buildPromptContext(brief: PlanningBrief): PromptContext {
  return {
    unit: brief.page?.unit ?? 'mm',
    mode: brief.page?.mode ?? 'fixed',
    scenario: brief.scenario,
  }
}

function normalizeLayoutResult(
  result: z.infer<typeof LayoutSchema>,
  validTypes: Set<string>,
  pageWidth: number,
  pageHeight: number,
): LayoutAgentResult {
  const warnings: string[] = [...(result.warnings ?? [])]
  const blocks: LayoutBox[] = []

  for (const block of result.blocks ?? []) {
    if (!validTypes.has(block.type)) {
      warnings.push(`Layout block "${block.id}" uses unregistered type "${block.type}"; removed.`)
      continue
    }

    const width = Math.max(block.width, 5)
    const height = Math.max(block.height, 5)
    const x = Math.max(0, Math.min(block.x, pageWidth - width))
    const y = Math.max(0, Math.min(block.y, pageHeight - height))

    if (x !== block.x || y !== block.y || width !== block.width || height !== block.height)
      warnings.push(`Layout block "${block.id}" was clamped to fit page bounds.`)

    blocks.push({ id: block.id, type: block.type, x, y, width, height })
  }

  return { page: result.page, blocks, warnings }
}

function normalizeExpectedDataSource(value: unknown): unknown {
  if (!isRecord(value))
    return value
  return {
    ...value,
    fields: normalizeExpectedFields(value.fields),
  }
}

function normalizeExpectedFields(value: unknown, parentPath = ''): unknown {
  if (Array.isArray(value))
    return value.map(field => normalizeExpectedField(field, undefined, parentPath))
  if (!isRecord(value))
    return value
  return Object.entries(value).map(([key, field]) => normalizeExpectedField(field, key, parentPath))
}

function normalizeExpectedField(value: unknown, key: string | undefined, parentPath: string): unknown {
  const fallbackPath = key ? joinFieldPath(parentPath, key) : parentPath
  if (!isRecord(value)) {
    return {
      name: key ?? fallbackPath,
      path: fallbackPath,
      title: typeof value === 'string' ? value : undefined,
      type: inferExpectedFieldType(value),
    }
  }

  const rawName = typeof value.name === 'string' ? value.name : key
  const rawPath = typeof value.path === 'string' ? value.path : rawName
  const path = rawPath ? joinFieldPath(parentPath, rawPath) : fallbackPath
  return {
    ...value,
    name: rawName ?? path,
    path,
    type: normalizeExpectedFieldType(value.type, value.children ?? value.fields),
    children: normalizeExpectedChildren(value.children ?? value.fields, path),
  }
}

function normalizeExpectedChildren(value: unknown, parentPath: string): unknown {
  if (value === undefined)
    return undefined
  return normalizeExpectedFields(value, parentPath)
}

function normalizeExpectedFieldType(value: unknown, children: unknown): ExpectedField['type'] {
  if (value === 'string' || value === 'number' || value === 'boolean' || value === 'array' || value === 'object')
    return value
  if (Array.isArray(children) || isRecord(children))
    return 'object'
  return inferExpectedFieldType(value)
}

function inferExpectedFieldType(value: unknown): ExpectedField['type'] {
  if (typeof value === 'number')
    return 'number'
  if (typeof value === 'boolean')
    return 'boolean'
  if (Array.isArray(value))
    return 'array'
  if (isRecord(value))
    return 'object'
  return 'string'
}

function joinFieldPath(parentPath: string, path: string): string {
  if (!parentPath)
    return path
  if (!path)
    return parentPath
  if (path.startsWith(`${parentPath}/`))
    return path
  return `${parentPath}/${path}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function normalizeSchemaAgentSchema(
  value: unknown,
  planningBrief: PlanningBrief,
): { schema: unknown, warnings: string[] } {
  if (!isRecord(value))
    return { schema: value, warnings: [] }

  const warnings: string[] = []
  const next: Record<string, unknown> = { ...value }

  if (typeof next.version !== 'string' || !next.version) {
    next.version = '1.0.0'
    warnings.push('Schema Agent output was missing schema.version; defaulted to 1.0.0.')
  }

  if (next.unit !== 'mm' && next.unit !== 'pt' && next.unit !== 'px' && next.unit !== 'inch') {
    next.unit = planningBrief.page?.unit ?? 'mm'
    warnings.push(`Schema Agent output was missing or using an unsupported schema.unit; defaulted to ${next.unit}.`)
  }

  next.page = normalizeSchemaPage(next.page, planningBrief, warnings)
  next.page = normalizeSchemaPageModel(next.page, warnings)
  next.guides = normalizeGuides(next.guides, warnings)

  if (!Array.isArray(next.elements)) {
    next.elements = []
    warnings.push('Schema Agent output was missing schema.elements; initialized an empty element list.')
  }

  const validator = new SchemaValidator({ autoFix: true })
  const repaired = validator.autoFix(next as unknown as DocumentSchema)
  for (const issue of repaired.issues)
    warnings.push(`Schema Agent output normalized ${issue.path}: ${issue.reason}.`)

  return {
    schema: normalizeAllFieldPaths(repaired.fixed),
    warnings,
  }
}

function normalizeSchemaPageModel(value: unknown, warnings: string[]): DocumentSchema['page'] {
  if (!isRecord(value))
    return value as DocumentSchema['page']

  const page = { ...value }
  const mode = page.mode === 'continuous' ? 'continuous' : 'fixed'
  const width = typeof page.width === 'number' && page.width > 0 ? page.width : (mode === 'continuous' ? 80 : 210)
  const height = typeof page.height === 'number' && page.height > 0 ? page.height : (mode === 'continuous' ? 200 : 297)

  const expectedKind = mode === 'continuous' ? 'continuous-paper' : 'paged-paper'
  const pageModel = isRecord(page.pageModel) ? { ...page.pageModel } : {}
  const paper = isRecord(pageModel.paper) ? { ...pageModel.paper } : {}

  if (pageModel.kind !== expectedKind) {
    warnings.push(`Schema Agent output had incompatible page.pageModel.kind; normalized to ${expectedKind}.`)
  }

  if (paper.width !== width) {
    warnings.push(`Schema Agent output had no valid page.pageModel.paper.width; normalized to ${width}.`)
  }

  if (paper.height !== height) {
    warnings.push(`Schema Agent output had no valid page.pageModel.paper.height; normalized to ${height}.`)
  }

  return {
    ...page,
    mode,
    width,
    height,
    pageModel: {
      ...pageModel,
      kind: expectedKind,
      paper: {
        ...paper,
        width,
        height,
      },
    },
  } as DocumentSchema['page']
}

function normalizeSchemaPage(
  value: unknown,
  planningBrief: PlanningBrief,
  warnings: string[],
): DocumentSchema['page'] {
  const page = isRecord(value) ? { ...value } : {}
  const briefPage = planningBrief.page
  const unit = briefPage?.unit ?? 'mm'
  const mode = page.mode === 'continuous' || page.mode === 'fixed'
    ? page.mode
    : briefPage?.mode ?? 'fixed'
  const defaultWidth = briefPage?.width ?? (mode === 'continuous' ? (unit === 'px' ? 375 : 80) : (unit === 'px' ? 375 : 210))
  const defaultHeight = briefPage?.height ?? (mode === 'continuous' ? (unit === 'px' ? 800 : 200) : (unit === 'px' ? 667 : 297))
  const width = typeof page.width === 'number' && page.width > 0 ? page.width : defaultWidth
  const height = typeof page.height === 'number' && page.height > 0 ? page.height : defaultHeight

  if (!isRecord(value))
    warnings.push('Schema Agent output was missing schema.page; initialized page from the planning brief.')
  if (page.mode !== mode)
    warnings.push(`Schema Agent output had no valid page.mode; defaulted to ${mode}.`)
  if (page.width !== width)
    warnings.push(`Schema Agent output had no valid page.width; defaulted to ${width}.`)
  if (page.height !== height)
    warnings.push(`Schema Agent output had no valid page.height; defaulted to ${height}.`)

  return {
    ...page,
    mode,
    width,
    height,
  } as DocumentSchema['page']
}

function normalizeGuides(value: unknown, warnings: string[]): DocumentSchema['guides'] {
  if (!isRecord(value)) {
    warnings.push('Schema Agent output was missing schema.guides; initialized empty guide axes.')
    return { x: [], y: [] }
  }
  return {
    ...value,
    x: Array.isArray(value.x) ? value.x : [],
    y: Array.isArray(value.y) ? value.y : [],
  } as DocumentSchema['guides']
}

interface CompleteJsonOptions {
  messages: string[]
}

class LLMJsonParseError extends Error {
  constructor(message: string, readonly content: string) {
    super(`${message}: ${content.slice(0, 240)}`)
    this.name = 'LLMJsonParseError'
  }
}

async function completeJson<T>(llm: LLMClient, schema: z.ZodType<T>, options: CompleteJsonOptions): Promise<T> {
  const content = options.messages
  const response = await llm.complete({
    messages: [
      { role: 'system', content: content[0] ?? '只输出 JSON。' },
      { role: 'user', content: content.slice(1).filter(Boolean).join('\n') },
    ],
    options: { responseFormat: 'json', temperature: 0.2 },
  })
  return schema.parse(parseJsonObject(response.content))
}

function parseJsonObject(content: string): unknown {
  const normalized = stripJsonFence(content.trim())
  try {
    return JSON.parse(normalized)
  }
  catch (error) {
    const objectText = findBalancedJsonObject(normalized)
    if (objectText) {
      try {
        return JSON.parse(objectText)
      }
      catch {
        // Fall through to a diagnostic error with the original parse message.
      }
    }
    const message = error instanceof Error ? error.message : 'Invalid JSON'
    throw new LLMJsonParseError(message, content)
  }
}

function stripJsonFence(content: string): string {
  if (!content.startsWith('```'))
    return content
  const firstLineEnd = content.indexOf('\n')
  if (firstLineEnd < 0)
    return content
  const closingFenceStart = content.lastIndexOf('```')
  if (closingFenceStart <= firstLineEnd)
    return content
  return content.slice(firstLineEnd + 1, closingFenceStart).trim()
}

function findBalancedJsonObject(content: string): string | undefined {
  const start = content.indexOf('{')
  if (start < 0)
    return undefined
  let depth = 0
  let inString = false
  let escaped = false
  for (let index = start; index < content.length; index += 1) {
    const char = content[index]
    if (escaped) {
      escaped = false
      continue
    }
    if (char === '\\') {
      escaped = true
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
    if (char === '}') {
      depth -= 1
      if (depth === 0)
        return content.slice(start, index + 1)
    }
  }
  return undefined
}

function formatAgentWarning(agent: string, error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return `${agent} Agent 返回不可用，已保留可用上下文并交由 Schema Agent 处理。${message}`
}

function heuristicIntake(prompt: string): IntakeAgentResult {
  const normalized = prompt.replace(/\s+/g, '')
  const genericDocument = /单据|单子|表单/.test(normalized)
    && !/报价单|出库单|入库单|收据|小票|发票|送货单|采购单|标签/.test(normalized)
  if (!genericDocument)
    return { requiresClarification: false, questions: [], suggestedAnswers: [] }
  return {
    requiresClarification: true,
    questions: ['这是报价单、出库单、收据，还是其他类型的单据？'],
    suggestedAnswers: [['报价单', '出库单', '收据']],
    taskType: 'generic-document',
  }
}
