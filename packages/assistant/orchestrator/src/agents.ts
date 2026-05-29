import type { ParsedExternalData } from '@easyink/assistant-adapters'
import type { AssistantTaskInput } from '@easyink/assistant-capabilities'
import type { LLMClient } from '@easyink/assistant-llm'
import type { AssistantStore } from '@easyink/assistant-store'
import type { TemplateGenerationIntent } from '@easyink/schema-tools'
import { z } from 'zod'

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
  domain?: string
  page?: TemplateGenerationIntent['page']
  strategy?: string
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

export interface AssistantAgentBundle {
  intake: IntakeAgentResult
  planner: PlannerAgentResult
  source: SourceAgentResult
  composer?: TemplateGenerationIntent
  validator: ValidatorAgentResult
  memorySummary?: string
}

const IntakeSchema = z.object({
  requiresClarification: z.boolean().optional(),
  questions: z.array(z.string()).optional(),
  suggestedAnswers: z.array(z.array(z.string())).optional(),
  taskType: z.string().optional(),
})

const PlannerSchema = z.object({
  domain: z.string().optional(),
  page: z.object({
    mode: z.enum(['fixed', 'continuous']).optional(),
    width: z.number().optional(),
    height: z.number().optional(),
    pages: z.number().optional(),
  }).optional(),
  strategy: z.string().optional(),
  warnings: z.array(z.string()).optional(),
})

const SourceSchema = z.object({
  fieldMeanings: z.record(z.string()).optional(),
  warnings: z.array(z.string()).optional(),
})

const ComposerSchema: z.ZodType<TemplateGenerationIntent> = z.object({
  name: z.string().optional(),
  domain: z.string().optional(),
  dataSourceName: z.string().optional(),
  page: z.record(z.unknown()).optional(),
  fields: z.array(z.record(z.unknown())).optional(),
  sections: z.array(z.record(z.unknown())).optional(),
  sampleData: z.record(z.unknown()).optional(),
  warnings: z.array(z.string()).optional(),
}) as z.ZodType<TemplateGenerationIntent>

const ValidatorSchema = z.object({
  explanation: z.string().optional(),
  repairHint: z.string().optional(),
})

export async function runAssistantAgents(context: AssistantAgentContext): Promise<AssistantAgentBundle> {
  const memorySummary = await runMemoryAgent(context)
  const intake = await runIntakeAgent(context, memorySummary)
  const planner = await runPlannerAgent(context, memorySummary)
  const source = await runSourceAgent(context)
  const composer = await runComposerAgent(context, planner, source, memorySummary)
  const validator = await runValidatorAgent(context)
  return { intake, planner, source, composer, validator, memorySummary }
}

export async function runIntakeAgent(context: AssistantAgentContext, memorySummary?: string): Promise<IntakeAgentResult> {
  const fallback = heuristicIntake(context.input.prompt)
  if (!context.llm)
    return fallback
  const result = await completeJson(context.llm, IntakeSchema, [
    '你是 EasyInk Assistant 的 Intake Agent。判断任务类型，以及是否必须澄清。只输出 JSON。',
    `用户需求：${context.input.prompt}`,
    memorySummary ? `历史上下文：${memorySummary}` : '',
  ])
  return {
    requiresClarification: result.requiresClarification ?? fallback.requiresClarification,
    questions: result.questions?.length ? result.questions : fallback.questions,
    suggestedAnswers: result.suggestedAnswers?.length ? result.suggestedAnswers : fallback.suggestedAnswers,
    taskType: result.taskType ?? fallback.taskType,
  }
}

export async function runPlannerAgent(context: AssistantAgentContext, memorySummary?: string): Promise<PlannerAgentResult> {
  if (!context.llm)
    return { warnings: [] }
  const result = await completeJson(context.llm, PlannerSchema, [
    '你是 EasyInk Assistant 的 Planner Agent。判断领域、纸张方向、模板策略。只输出 JSON。',
    `用户需求：${context.input.prompt}`,
    memorySummary ? `历史上下文：${memorySummary}` : '',
  ])
  return { domain: result.domain, page: result.page, strategy: result.strategy, warnings: result.warnings ?? [] }
}

export async function runSourceAgent(context: AssistantAgentContext): Promise<SourceAgentResult> {
  if (!context.llm || !context.sourceData)
    return { fieldMeanings: {}, warnings: [] }
  const result = await completeJson(context.llm, SourceSchema, [
    '你是 EasyInk Assistant 的 Source Agent。解释数据源字段含义，指出字段风险。只输出 JSON。',
    `字段描述：${JSON.stringify(context.sourceData.descriptor.fields).slice(0, 6000)}`,
    `样例：${JSON.stringify(context.sourceData.sample).slice(0, 6000)}`,
  ])
  return { fieldMeanings: result.fieldMeanings ?? {}, warnings: result.warnings ?? [] }
}

export async function runComposerAgent(
  context: AssistantAgentContext,
  planner: PlannerAgentResult,
  source: SourceAgentResult,
  memorySummary?: string,
): Promise<TemplateGenerationIntent | undefined> {
  if (!context.llm)
    return undefined
  const result = await completeJson(context.llm, ComposerSchema, [
    '你是 EasyInk Assistant 的 Composer Agent。产出 TemplateGenerationIntent，不要输出 Designer schema。只输出 JSON。',
    '可用字段类型：string, number, boolean, array, object。sections.kind 可用 title,text,field-list,array-table,summary,footer,code。',
    context.input.materialManifest
      ? `当前 Designer 已注册物料：${context.input.materialManifest.materials.map(material => `${material.type}(${material.ai?.binding ?? 'none'})`).join(', ')}。只能规划可由这些物料表达的结构。`
      : '',
    `用户需求：${context.input.prompt}`,
    `规划：${JSON.stringify(planner)}`,
    `数据源解释：${JSON.stringify(source)}`,
    memorySummary ? `历史上下文：${memorySummary}` : '',
  ])
  return result
}

export async function runValidatorAgent(context: AssistantAgentContext): Promise<ValidatorAgentResult> {
  if (!context.llm)
    return {}
  return completeJson(context.llm, ValidatorSchema, [
    '你是 EasyInk Assistant 的 Validator Agent。解释可能的校验风险并给出 repair hint。只输出 JSON。',
    `用户需求：${context.input.prompt}`,
  ])
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
    options: { maxTokens: 160 },
  })
  return response.content.trim() || related.join('\n')
}

async function completeJson<T>(llm: LLMClient, schema: z.ZodType<T>, content: string[]): Promise<T> {
  const response = await llm.complete({
    messages: [
      { role: 'system', content: content[0] ?? '只输出 JSON。' },
      { role: 'user', content: content.slice(1).filter(Boolean).join('\n') },
    ],
    options: { responseFormat: 'json', temperature: 0.2, maxTokens: 1800 },
  })
  return schema.parse(JSON.parse(response.content))
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
