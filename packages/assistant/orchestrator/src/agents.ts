import type { ParsedExternalData } from '@easyink/assistant-adapters'
import type { AssistantTaskInput } from '@easyink/assistant-capabilities'
import type { LLMClient } from '@easyink/assistant-llm'
import type { AssistantStore } from '@easyink/assistant-store'
import type { DocumentSchema, ExpectedDataSource, ExpectedField } from '@easyink/schema'
import { isValidSchema } from '@easyink/schema'
import { z } from 'zod'
import { buildMaterialContext, buildSchemaSystemPrompt } from './prompts'

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
  pages?: number
  reason?: string
}

export interface PlanningBrief {
  documentIntent?: string
  confidence?: 'high' | 'medium' | 'low'
  page?: {
    mode?: 'fixed' | 'continuous'
    width?: number
    height?: number
    unit: 'mm'
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
  page: z.object({
    mode: z.enum(['fixed', 'continuous']).optional(),
    width: z.number().optional(),
    height: z.number().optional(),
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
        'Only include page fields that are explicit in the prompt or strongly implied by the print medium. Put unresolved assumptions in uncertainty instead of filling defaults.',
        'If page is present, return page.reason as one short English sentence.',
      ].join('\n'),
      `用户需求：${context.input.prompt}`,
      memorySummary ? `历史上下文：${memorySummary}` : '',
    ],
  })
  return {
    documentIntent: result.documentIntent,
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
): Promise<SchemaAgentResult | undefined> {
  if (!context.llm)
    return undefined
  if (!context.input.materialManifest?.materials.length)
    return undefined

  const planningBrief = buildPlanningBrief(planner)
  const materialContext = buildMaterialContext(context.input.materialManifest)
  const result = await completeJson(context.llm, SchemaAgentSchema, {
    messages: [
      buildSchemaSystemPrompt(materialContext),
      [
        `EasyInk planning brief:\n${JSON.stringify(planningBrief, null, 2)}`,
        isValidSchema(context.input.currentSchema)
          ? `Current schema context:\n${JSON.stringify(context.input.currentSchema, null, 2)}`
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

  if (!isValidSchema(result.schema))
    throw new Error('Schema Agent returned an invalid DocumentSchema shape.')
  const expectedDataSource = ExpectedDataSourceSchema.parse(normalizeExpectedDataSource(result.expectedDataSource))

  return {
    schema: result.schema,
    expectedDataSource,
    planningBrief,
    warnings: result.warnings ?? [],
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
    confidence: planner.confidence,
    page: hasPageFacts
      ? {
          mode: page.mode,
          width: page.width,
          height: page.height,
          unit: 'mm',
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
