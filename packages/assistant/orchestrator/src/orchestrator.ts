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
  collectDeterministicErrors,
  createAssistantPreview,
  diffAssistantSchema,
  repairAssistantSchema,
  validateAssistantSchema,
} from '@easyink/assistant-capabilities'
import { createId, MemoryAssistantStore } from '@easyink/assistant-store'
import { isValidSchema } from '@easyink/schema'
import { buildDataSourceDescriptor } from '@easyink/schema-tools'
import pino from 'pino'
import {
  runAssistantAgents,
  runContractAgent,
  runIntakeAgent,
  runLayoutAgent,
  runMemoryAgent,
  runSchemaAgent,
  runSchemaRepairAgent,
} from './agents'
import { createAssistantWorkflowGraph } from './graph'

export interface AssistantOrchestratorOptions {
  store?: AssistantStore
  logger?: Logger
  llm?: LLMClient
}

const MAX_REPAIR_ITERATIONS = 2

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
      current = await this.startStep(current, 'intake')
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
      await this.completeStep(taskId, 'intake')

      let externalData: ParsedExternalData | undefined
      const source = current.input.source
      if (source && source.kind !== 'none') {
        current = await this.startStep(current, 'source')
        await this.store.appendEvent(taskId, { type: 'tool.started', taskId, toolId: 'source', title: '解析数据源' })
        externalData = await this.resolveSource(source)
        await this.store.appendEvent(taskId, {
          type: 'tool.completed',
          taskId,
          toolId: 'source',
          summary: `识别到 ${externalData.descriptor.fields.length} 个字段。`,
        })
        await this.store.saveSourceSample({
          taskId,
          sourceKind: source.kind,
          descriptor: externalData.descriptor,
          sample: externalData.sample,
          warnings: externalData.warnings,
          expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
        })
        await this.completeStep(taskId, 'source')
      }
      else {
        current = await this.updateTask(current, { step: 'source' })
        await this.store.appendEvent(taskId, { type: 'step.completed', taskId, step: 'source' })
      }

      current = await this.startStep(current, 'plan')
      await this.think(taskId, '正在规划页面结构与版式。')

      const agents = await runAssistantAgents({
        input: current.input,
        taskId,
        store: this.store,
        llm: this.llm,
        sourceData: externalData,
      })
      if (agents.planner.summary)
        await this.think(taskId, agents.planner.summary)
      await this.completeStep(taskId, 'plan')

      const agentContext = {
        input: current.input,
        taskId,
        store: this.store,
        llm: this.llm,
        sourceData: externalData,
      }

      current = await this.startStep(current, 'contract')
      await this.store.appendEvent(taskId, { type: 'tool.started', taskId, toolId: 'contract', title: '构建数据契约' })
      await this.think(taskId, '正在构建数据契约。')
      const contract = await runContractAgent(agentContext, agents.planner, agents.source, agents.memorySummary)
      await this.store.appendEvent(taskId, {
        type: 'tool.completed',
        taskId,
        toolId: 'contract',
        summary: contract.dataSource
          ? `定义 ${contract.dataSource.fields.length} 个数据字段。`
          : '未生成数据契约，交由 Schema Agent 推断。',
      })
      await this.completeStep(taskId, 'contract')

      current = await this.startStep(current, 'layout')
      await this.store.appendEvent(taskId, { type: 'tool.started', taskId, toolId: 'layout', title: '规划版式骨架' })
      await this.think(taskId, '正在规划版式骨架。')
      const layout = await runLayoutAgent(agentContext, agents.planner, contract, agents.memorySummary)
      await this.store.appendEvent(taskId, {
        type: 'tool.completed',
        taskId,
        toolId: 'layout',
        summary: layout.blocks.length
          ? `规划 ${layout.blocks.length} 个版式区块。`
          : '未生成版式骨架，交由 Schema Agent 推断。',
      })
      await this.completeStep(taskId, 'layout')

      current = await this.startStep(current, 'compose')
      await this.think(taskId, '正在生成 EasyInk 模板结构。')
      const schemaAgent = await runSchemaAgent(
        agentContext,
        agents.planner,
        agents.source,
        agents.memorySummary,
        { contract, layout },
      ).catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error)
        throw new Error(`Schema Agent 返回不可用。${message}`)
      })
      if (!schemaAgent)
        throw new Error('Schema Agent requires an LLM client and a Designer material manifest.')
      await this.completeStep(taskId, 'compose')

      const planningPage = schemaAgent.planningBrief.page
        ? {
            mode: schemaAgent.planningBrief.page.mode,
            width: schemaAgent.planningBrief.page.width,
            height: schemaAgent.planningBrief.page.height,
          }
        : undefined
      const warnings: string[] = [
        'Schema Agent used registered Designer materials; legacy presets were not used.',
        ...schemaAgent.warnings,
        ...contract.warnings,
        ...layout.warnings,
        ...agents.planner.warnings,
        ...agents.source.warnings,
        ...Object.entries(agents.source.fieldMeanings).map(([field, meaning]) => `${field}: ${meaning}`),
        ...(agents.validator.explanation ? [agents.validator.explanation] : []),
        ...(agents.memorySummary ? [`Memory: ${agents.memorySummary}`] : []),
      ]

      let schemaResult = schemaAgent

      current = await this.startStep(current, 'validate')
      await this.store.appendEvent(taskId, { type: 'tool.started', taskId, toolId: 'validate', title: '校验模板与数据绑定' })
      let validation = validateAssistantSchema(schemaResult.schema, { materialManifest: current.input.materialManifest })
      let deterministicErrors = collectDeterministicErrors(schemaResult.schema, {
        materialManifest: current.input.materialManifest,
        expectedDataSource: schemaResult.expectedDataSource,
        page: planningPage,
      })
      const initialErrorCount = validation.errors.length + deterministicErrors.length
      if (validation.valid && deterministicErrors.length === 0) {
        await this.store.appendEvent(taskId, { type: 'tool.completed', taskId, toolId: 'validate', summary: '模板结构与物料校验通过。' })
      }
      else {
        await this.store.appendEvent(taskId, {
          type: 'tool.failed',
          taskId,
          toolId: 'validate',
          error: (validation.errors[0] ?? deterministicErrors[0])?.message ?? '存在需修复的校验问题。',
        })
      }
      await this.completeStep(taskId, 'validate')

      if (initialErrorCount > 0) {
        current = await this.startStep(current, 'repair')
        await this.think(taskId, '校验发现问题，正在自动修复。')
        for (let attempt = 1; attempt <= MAX_REPAIR_ITERATIONS; attempt += 1) {
          await this.store.appendEvent(taskId, { type: 'tool.started', taskId, toolId: 'repair', title: `修复模板结构（第 ${attempt} 次）` })
          const repaired = await runSchemaRepairAgent(agentContext, {
            schemaResult,
            errors: [...validation.errors, ...deterministicErrors],
            upstream: { contract, layout },
            memorySummary: agents.memorySummary,
          }).catch(() => undefined)

          if (!repaired) {
            const fallback = repairAssistantSchema(schemaResult.schema, { materialManifest: current.input.materialManifest })
            schemaResult = { ...schemaResult, schema: fallback.schema }
            warnings.push(...fallback.repairs.map(issue => `Repair: ${issue.reason}`))
            validation = fallback.validation
            deterministicErrors = collectDeterministicErrors(schemaResult.schema, {
              materialManifest: current.input.materialManifest,
              expectedDataSource: schemaResult.expectedDataSource,
              page: planningPage,
            })
            await this.store.appendEvent(taskId, {
              type: 'tool.completed',
              taskId,
              toolId: 'repair',
              summary: `确定性修复后剩余 ${validation.errors.length + deterministicErrors.length} 个问题（重试 ${attempt}）。`,
            })
            break
          }

          schemaResult = repaired
          warnings.push(...repaired.warnings)
          validation = validateAssistantSchema(schemaResult.schema, { materialManifest: current.input.materialManifest })
          deterministicErrors = collectDeterministicErrors(schemaResult.schema, {
            materialManifest: current.input.materialManifest,
            expectedDataSource: schemaResult.expectedDataSource,
            page: planningPage,
          })
          const remaining = validation.errors.length + deterministicErrors.length
          await this.store.appendEvent(taskId, {
            type: 'tool.completed',
            taskId,
            toolId: 'repair',
            summary: `第 ${attempt} 次修复后剩余 ${remaining} 个问题。`,
          })
          if (validation.valid && deterministicErrors.length === 0)
            break
        }
        if (!validation.valid || deterministicErrors.length > 0)
          warnings.push('Schema Agent 在多次修复后仍存在校验问题，已返回当前最优结果。')
        await this.store.appendEvent(taskId, { type: 'step.completed', taskId, step: 'repair' })
      }

      const dataSource = buildDataSourceDescriptor(schemaResult.expectedDataSource, {
        id: schemaResult.expectedDataSource.name,
        generatedBy: 'easyink-assistant-orchestrator',
        prompt: current.input.prompt,
        titlePrefix: 'Assistant',
      })
      const alignment = alignAssistantDataSource(schemaResult.schema, dataSource)
      warnings.push(...alignment.warnings)

      const currentSchema = isValidSchema(current.input.currentSchema)
        ? current.input.currentSchema as DocumentSchema
        : undefined
      const diff = diffAssistantSchema(currentSchema, schemaResult.schema)
      const result: AssistantResult = {
        id: createId('result'),
        schema: schemaResult.schema,
        dataSource,
        patch: diff.operations,
        diff,
        validation,
        preview: createAssistantPreview(schemaResult.schema, dataSource, [
          ...warnings,
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
      current = await this.startStep(current, 'review')
      await this.completeStep(taskId, 'review')
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

  private async startStep(task: AssistantTaskRecord, step: AssistantWorkflowStep): Promise<AssistantTaskRecord> {
    await this.store.appendEvent(task.id, { type: 'step.started', taskId: task.id, step })
    return this.updateTask(task, { step })
  }

  private async completeStep(taskId: string, step: AssistantWorkflowStep): Promise<void> {
    await this.store.appendEvent(taskId, { type: 'step.completed', taskId, step })
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
