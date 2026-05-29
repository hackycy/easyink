import type { ParsedExternalData } from '@easyink/assistant-adapters'
import type {
  AssistantResult,
  AssistantSourceInput,
  AssistantTaskInput,
  AssistantWorkflowStep,
} from '@easyink/assistant-capabilities'
import type { LLMClient } from '@easyink/assistant-llm'
import type { AssistantStore, AssistantTaskRecord } from '@easyink/assistant-store'
import type { DocumentSchema } from '@easyink/schema'
import type { Logger } from 'pino'
import { resolveExternalData } from '@easyink/assistant-adapters'
import {
  alignAssistantDataSource,
  createAssistantPreview,
  diffAssistantSchema,
  generateSchemaCandidate,
  repairAssistantSchema,
  validateAssistantSchema,
} from '@easyink/assistant-capabilities'
import { createId, MemoryAssistantStore } from '@easyink/assistant-store'
import { isValidSchema } from '@easyink/schema'
import pino from 'pino'
import { runAssistantAgents, runIntakeAgent, runMemoryAgent } from './agents'
import { createAssistantWorkflowGraph } from './graph'

export interface AssistantOrchestratorOptions {
  store?: AssistantStore
  logger?: Logger
  llm?: LLMClient
}

export class AssistantOrchestrator {
  readonly store: AssistantStore
  private readonly logger: Logger
  private readonly llm?: LLMClient
  private readonly graph = createAssistantWorkflowGraph()

  constructor(options: AssistantOrchestratorOptions = {}) {
    this.store = options.store ?? new MemoryAssistantStore()
    this.logger = options.logger ?? pino({ name: 'easyink-assistant' })
    this.llm = options.llm
  }

  async createTask(input: AssistantTaskInput): Promise<AssistantTaskRecord> {
    const task = await this.store.createTask(input)
    void this.runTask(task.id).catch((error: unknown) => {
      this.logger.error({ err: error, taskId: task.id }, 'assistant task failed outside request lifecycle')
    })
    return task
  }

  async runTask(taskId: string): Promise<AssistantTaskRecord> {
    const task = await this.requireTask(taskId)
    const run = await this.store.createRun(taskId)
    let current = await this.updateTask(task, { status: 'running', step: 'intake' })

    try {
      await this.invokeGraph(current.input)
      await this.runStep(current, 'intake')
      await this.store.appendEvent(taskId, { type: 'thinking.started', taskId, title: '理解模板需求' })
      await this.think(taskId, '正在理解你的模板需求……')
      const memorySummary = await runMemoryAgent({ input: current.input, taskId, store: this.store, llm: this.llm })
      const intake = await runIntakeAgent({ input: current.input, taskId, store: this.store, llm: this.llm }, memorySummary)
      if (intake.requiresClarification) {
        await this.think(taskId, '需求信息还不够明确，需要先和你确认。')
        await this.store.appendEvent(taskId, {
          type: 'clarification.required',
          taskId,
          questions: intake.questions,
          suggestedAnswers: intake.suggestedAnswers,
        })
        current = await this.updateTask(current, { status: 'waiting', step: 'intake' })
        await this.store.updateRun({ ...run, status: 'waiting', finishedAt: Date.now() })
        await this.saveProjectionSnapshot(taskId)
        return current
      }
      await this.think(taskId, intake.taskType ? `识别为${describeTaskType(intake.taskType)}场景。` : '已理解模板类型与目标。')

      await this.runStep(current, 'plan')
      await this.think(taskId, '正在规划页面结构与版式。')

      let externalData: ParsedExternalData | undefined
      if (current.input.source && current.input.source.kind !== 'none') {
        await this.runStep(current, 'source')
        await this.store.appendEvent(taskId, { type: 'tool.started', taskId, toolId: 'source', title: '解析数据源' })
        externalData = await this.resolveSource(current.input.source)
        await this.store.appendEvent(taskId, {
          type: 'tool.completed',
          taskId,
          toolId: 'source',
          summary: `识别到 ${externalData.descriptor.fields.length} 个字段。`,
        })
        await this.store.saveSourceSample({
          taskId,
          sourceKind: current.input.source.kind,
          descriptor: externalData.descriptor,
          sample: externalData.sample,
          warnings: externalData.warnings,
          expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
        })
      }
      else {
        current = await this.updateTask(current, { step: 'source' })
        await this.store.appendEvent(taskId, { type: 'step.completed', taskId, step: 'source' })
      }

      const agents = await runAssistantAgents({
        input: current.input,
        taskId,
        store: this.store,
        llm: this.llm,
        sourceData: externalData,
      })
      if (agents.planner.strategy)
        await this.think(taskId, agents.planner.strategy)

      await this.runStep(current, 'compose')
      await this.think(taskId, '正在生成 EasyInk 模板结构。')
      const candidate = generateSchemaCandidate(current.input, {
        sourceData: externalData?.sample,
        sourceDescriptor: externalData?.descriptor,
        intent: agents.composer
          ? {
              ...agents.composer,
              domain: agents.composer.domain ?? agents.planner.domain,
              page: agents.composer.page ?? agents.planner.page,
            }
          : undefined,
      })
      candidate.warnings.push(
        ...agents.planner.warnings,
        ...agents.source.warnings,
        ...Object.entries(agents.source.fieldMeanings).map(([field, meaning]) => `${field}: ${meaning}`),
        ...(agents.validator.explanation ? [agents.validator.explanation] : []),
        ...(agents.memorySummary ? [`Memory: ${agents.memorySummary}`] : []),
      )

      await this.runStep(current, 'validate')
      await this.store.appendEvent(taskId, { type: 'tool.started', taskId, toolId: 'validate', title: '校验模板与数据绑定' })
      const validation = validateAssistantSchema(candidate.schema, { materialManifest: current.input.materialManifest })
      if (candidate.dataSource) {
        const alignment = alignAssistantDataSource(candidate.schema, candidate.dataSource)
        candidate.warnings.push(...alignment.warnings)
      }
      if (validation.valid) {
        await this.store.appendEvent(taskId, { type: 'tool.completed', taskId, toolId: 'validate', summary: '模板结构与物料校验通过。' })
      }
      else {
        await this.store.appendEvent(taskId, {
          type: 'tool.failed',
          taskId,
          toolId: 'validate',
          error: validation.errors[0]?.message ?? '存在需修复的校验问题。',
        })
      }

      const currentSchema = isValidSchema(current.input.currentSchema)
        ? current.input.currentSchema as DocumentSchema
        : undefined
      const diff = diffAssistantSchema(currentSchema, candidate.schema)
      const result: AssistantResult = {
        id: createId('result'),
        schema: candidate.schema,
        dataSource: candidate.dataSource,
        patch: diff.operations,
        diff,
        validation,
        preview: createAssistantPreview(candidate.schema, candidate.dataSource, [
          ...candidate.warnings,
          ...(externalData?.warnings ?? []),
        ]),
        createdAt: Date.now(),
      }

      await this.store.saveResult(taskId, result)
      await this.store.appendEvent(taskId, { type: 'result.ready', taskId, resultId: result.id })
      await this.store.appendEvent(taskId, {
        type: 'thinking.completed',
        taskId,
        summary: [
          intake.taskType ? `识别模板类型：${describeTaskType(intake.taskType)}` : '识别模板需求',
          `规划页面结构：${result.preview.elementCount} 个元素`,
          externalData ? `解析数据字段：${result.preview.dataFieldCount} 个` : '未使用外部数据源',
          validation.valid ? '校验通过' : '存在需修复项',
        ],
      })
      await this.runStep(current, 'review')
      current = await this.updateTask(current, { status: 'review', step: 'review', resultId: result.id })
      await this.store.updateRun({ ...run, status: 'review', finishedAt: Date.now() })
      await this.saveProjectionSnapshot(taskId)
      return current
    }
    catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await this.store.appendEvent(taskId, { type: 'task.failed', taskId, error: message })
      current = await this.updateTask(current, { status: 'failed', step: 'failed', error: message })
      await this.store.updateRun({ ...run, status: 'failed', finishedAt: Date.now(), error: message })
      await this.saveProjectionSnapshot(taskId)
      throw error
    }
  }

  async cancelTask(taskId: string): Promise<AssistantTaskRecord> {
    const task = await this.requireTask(taskId)
    const updated = await this.updateTask(task, { status: 'cancelled' })
    await this.store.appendEvent(taskId, { type: 'task.cancelled', taskId })
    await this.saveProjectionSnapshot(taskId)
    return updated
  }

  async appendMessage(taskId: string, message: string): Promise<AssistantTaskRecord> {
    const task = await this.requireTask(taskId)
    await this.store.appendEvent(taskId, { type: 'message.created', taskId, message })
    const next = await this.updateTask(task, {
      input: {
        ...task.input,
        prompt: `${task.input.prompt}\n${message}`.trim(),
      },
      status: 'queued',
      error: undefined,
    })
    void this.runTask(taskId).catch((error: unknown) => {
      this.logger.error({ err: error, taskId }, 'assistant message run failed')
    })
    return next
  }

  async answerClarification(taskId: string, answer: string): Promise<AssistantTaskRecord> {
    const task = await this.requireTask(taskId)
    await this.store.appendEvent(taskId, { type: 'clarification.answered', taskId, answer })
    const next = await this.updateTask(task, {
      input: {
        ...task.input,
        prompt: `${task.input.prompt}\n用户确认：${answer}`.trim(),
      },
      status: 'queued',
      error: undefined,
    })
    void this.runTask(taskId).catch((error: unknown) => {
      this.logger.error({ err: error, taskId }, 'assistant clarification run failed')
    })
    return next
  }

  async retryTask(taskId: string): Promise<AssistantTaskRecord> {
    const task = await this.requireTask(taskId)
    const next = await this.updateTask(task, { status: 'queued', error: undefined })
    void this.runTask(taskId).catch((error: unknown) => {
      this.logger.error({ err: error, taskId }, 'assistant retry failed')
    })
    return next
  }

  async repairTask(taskId: string): Promise<AssistantTaskRecord> {
    const task = await this.requireTask(taskId)
    await this.store.appendEvent(taskId, { type: 'step.started', taskId, step: 'repair' })
    if (task.resultId) {
      const result = await this.store.getResult(task.resultId)
      if (result && !result.validation.valid) {
        const repair = repairAssistantSchema(result.schema, { materialManifest: task.input.materialManifest })
        const diff = diffAssistantSchema(result.schema, repair.schema)
        const repairedResult: AssistantResult = {
          ...result,
          id: createId('result'),
          schema: repair.schema,
          patch: diff.operations,
          diff,
          validation: repair.validation,
          preview: createAssistantPreview(repair.schema, result.dataSource, [
            ...result.preview.warnings,
            ...repair.repairs.map(issue => `Repair: ${issue.reason}`),
          ]),
          createdAt: Date.now(),
        }
        await this.store.saveResult(taskId, repairedResult)
        await this.store.appendVersion({
          taskId,
          resultId: repairedResult.id,
          action: 'repaired',
          label: '确定性修复结果',
          snapshot: repairedResult,
        })
        await this.store.appendEvent(taskId, { type: 'result.ready', taskId, resultId: repairedResult.id })
        const updated = await this.updateTask(task, {
          status: 'review',
          step: 'review',
          resultId: repairedResult.id,
          error: undefined,
        })
        await this.store.appendEvent(taskId, { type: 'step.completed', taskId, step: 'repair' })
        await this.saveProjectionSnapshot(taskId)
        return updated
      }
    }
    await this.store.appendEvent(taskId, { type: 'step.completed', taskId, step: 'repair' })
    return this.retryTask(taskId)
  }

  async applyTaskResult(taskId: string): Promise<AssistantTaskRecord> {
    const task = await this.requireTask(taskId)
    if (!task.resultId)
      throw new Error(`Task "${taskId}" has no result to apply`)
    const result = await this.store.getResult(task.resultId)
    if (!result)
      throw new Error(`Result "${task.resultId}" was not found`)
    const currentSchema = isValidSchema(task.input.currentSchema)
      ? task.input.currentSchema as DocumentSchema
      : undefined
    if (currentSchema) {
      await this.store.appendVersion({
        taskId,
        resultId: result.id,
        action: 'before-apply',
        label: '应用前版本',
        snapshot: currentSchema,
      })
    }
    await this.store.appendVersion({
      taskId,
      resultId: result.id,
      action: 'applied',
      label: '应用 Assistant 结果',
      snapshot: result.schema,
    })
    await this.store.appendEvent(taskId, { type: 'task.applied', taskId, resultId: result.id })
    const updated = await this.updateTask(task, { status: 'done', step: 'done' })
    await this.saveProjectionSnapshot(taskId)
    return updated
  }

  async rollbackTask(taskId: string): Promise<AssistantTaskRecord> {
    const task = await this.requireTask(taskId)
    const versions = await this.store.listVersions(taskId)
    const target = versions.find(version => version.action === 'before-apply') ?? versions.find(version => version.action === 'applied') ?? versions[0]
    if (!target)
      throw new Error(`Task "${taskId}" has no version to rollback`)
    const rollback = await this.store.appendVersion({
      taskId,
      resultId: task.resultId,
      action: 'rolled-back',
      label: '回滚到应用前版本',
      snapshot: target.snapshot,
    })
    await this.store.appendEvent(taskId, { type: 'task.rolled-back', taskId, versionId: rollback.id })
    const updated = await this.updateTask(task, { status: 'done', step: 'done' })
    await this.saveProjectionSnapshot(taskId)
    return updated
  }

  private async runStep(task: AssistantTaskRecord, step: AssistantWorkflowStep): Promise<void> {
    await this.store.appendEvent(task.id, { type: 'step.started', taskId: task.id, step })
    await this.updateTask(task, { step })
    await this.store.appendEvent(task.id, { type: 'step.completed', taskId: task.id, step })
  }

  private async think(taskId: string, text: string): Promise<void> {
    await this.store.appendEvent(taskId, { type: 'thinking.delta', taskId, text })
  }

  private async resolveSource(source: AssistantSourceInput): Promise<ParsedExternalData> {
    if (source.kind === 'json') {
      if (!source.content)
        throw new Error('JSON source requires content')
      return resolveExternalData({ kind: 'json', content: source.content })
    }
    if (source.kind === 'file') {
      if (!source.content)
        throw new Error('File source requires content')
      return resolveExternalData({ kind: 'file', content: source.content, fileName: source.fileName })
    }
    if (source.kind === 'http') {
      if (!source.url)
        throw new Error('HTTP source requires url')
      return resolveExternalData({
        kind: 'http',
        url: source.url,
        method: source.method,
        headers: source.headers,
      })
    }
    if (source.kind === 'curl') {
      if (!source.content)
        throw new Error('Curl source requires content')
      return resolveExternalData({ kind: 'curl', content: source.content })
    }
    throw new Error(`Unsupported source kind: ${source.kind}`)
  }

  private async requireTask(taskId: string): Promise<AssistantTaskRecord> {
    const task = await this.store.getTask(taskId)
    if (!task)
      throw new Error(`Task "${taskId}" was not found`)
    return task
  }

  private async updateTask(task: AssistantTaskRecord, patch: Partial<AssistantTaskRecord>): Promise<AssistantTaskRecord> {
    const updated = { ...task, ...patch, updatedAt: Date.now() }
    await this.store.updateTask(updated)
    return updated
  }

  private async invokeGraph(input: AssistantTaskInput): Promise<void> {
    await this.graph.invoke({ input, steps: [] })
  }

  private async saveProjectionSnapshot(taskId: string): Promise<void> {
    const task = await this.store.getTask(taskId)
    if (!task)
      return
    const events = await this.store.listEvents(taskId)
    const result = task.resultId ? await this.store.getResult(task.resultId) : undefined
    await this.store.saveProjectionSnapshot({
      taskId,
      messages: [
        { role: 'user', kind: 'text', text: task.input.prompt, createdAt: task.createdAt },
        ...events.map(record => ({ kind: 'event', event: record.event, createdAt: record.createdAt })),
        ...(result ? [{ role: 'assistant', kind: 'result', resultId: result.id, createdAt: result.createdAt }] : []),
      ],
    })
  }
}

const TASK_TYPE_LABELS: Record<string, string> = {
  'quote': '报价单',
  'receipt': '收据',
  'invoice': '发票',
  'label': '标签',
  'retail-receipt': '零售小票',
  'delivery': '送货单',
  'purchase': '采购单',
  'generic-document': '通用单据',
}

function describeTaskType(taskType: string): string {
  return TASK_TYPE_LABELS[taskType] ?? taskType
}
