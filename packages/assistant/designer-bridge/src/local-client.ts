import type { AssistantResult, AssistantTaskInput, AssistantWorkflowStep } from '@easyink/assistant-capabilities'
import type { AssistantRunRecord, AssistantTaskRecord } from '@easyink/assistant-store'
import type { AssistantApiClient, AssistantTaskResponse } from '@easyink/assistant-ui'
import type { DocumentSchema } from '@easyink/schema'
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

export function createLocalAssistantApiClient(): AssistantApiClient {
  const store = new MemoryAssistantStore()

  async function runTask(taskId: string): Promise<AssistantTaskRecord> {
    const task = await requireTask(taskId)
    const run = await store.createRun(taskId)
    let current = await updateTask(task, { status: 'running', step: 'intake' })

    try {
      await runStep(current, 'intake')
      const clarification = createClarificationRequest(current.input.prompt)
      if (clarification) {
        await store.appendEvent(taskId, {
          type: 'clarification.required',
          taskId,
          questions: clarification.questions,
          suggestedAnswers: clarification.suggestedAnswers,
        })
        current = await updateTask(current, { status: 'waiting', step: 'intake' })
        await finishRun(run, 'waiting')
        return current
      }

      await runStep(current, 'plan')
      await runStep(current, 'source')
      await runStep(current, 'compose')
      const candidate = generateSchemaCandidate(current.input, {
        sourceData: parseLocalJsonSource(current.input),
      })

      await runStep(current, 'validate')
      const validation = validateAssistantSchema(candidate.schema, { materialManifest: current.input.materialManifest })
      if (candidate.dataSource) {
        const alignment = alignAssistantDataSource(candidate.schema, candidate.dataSource)
        candidate.warnings.push(...alignment.warnings)
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
        preview: createAssistantPreview(candidate.schema, candidate.dataSource, candidate.warnings),
        createdAt: Date.now(),
      }

      await store.saveResult(taskId, result)
      await store.appendEvent(taskId, { type: 'result.ready', taskId, resultId: result.id })
      await runStep(current, 'review')
      current = await updateTask(current, { status: 'review', step: 'review', resultId: result.id })
      await finishRun(run, 'review')
      return current
    }
    catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await store.appendEvent(taskId, { type: 'task.failed', taskId, error: message })
      current = await updateTask(current, { status: 'failed', step: 'failed', error: message })
      await finishRun(run, 'failed', message)
      return current
    }
  }

  async function runStep(task: AssistantTaskRecord, step: AssistantWorkflowStep): Promise<void> {
    await store.appendEvent(task.id, { type: 'step.started', taskId: task.id, step })
    await updateTask(task, { step })
    await store.appendEvent(task.id, { type: 'step.completed', taskId: task.id, step })
  }

  async function requireTask(taskId: string): Promise<AssistantTaskRecord> {
    const task = await store.getTask(taskId)
    if (!task)
      throw new Error(`Task "${taskId}" was not found`)
    return task
  }

  async function updateTask(task: AssistantTaskRecord, patch: Partial<AssistantTaskRecord>): Promise<AssistantTaskRecord> {
    const updated = { ...task, ...patch, updatedAt: Date.now() }
    await store.updateTask(updated)
    return updated
  }

  async function finishRun(run: AssistantRunRecord, status: AssistantRunRecord['status'], error?: string): Promise<void> {
    await store.updateRun({ ...run, status, finishedAt: Date.now(), error })
  }

  return {
    async createTask(input: AssistantTaskInput) {
      const task = await store.createTask(input)
      void runTask(task.id)
      return task
    },
    async getTask(taskId: string): Promise<AssistantTaskResponse> {
      const task = await requireTask(taskId)
      const result = task.resultId ? await store.getResult(task.resultId) : undefined
      return { task, result }
    },
    async listEvents(taskId: string) {
      return store.listEvents(taskId)
    },
    async sendMessage(taskId, payload) {
      const task = await requireTask(taskId)
      await store.appendEvent(taskId, { type: 'message.created', taskId, message: payload.message })
      const next = await updateTask(task, {
        input: { ...task.input, prompt: `${task.input.prompt}\n${payload.message}`.trim() },
        status: 'queued',
      })
      void runTask(taskId)
      return next
    },
    async submitClarification(taskId, payload) {
      const task = await requireTask(taskId)
      await store.appendEvent(taskId, { type: 'clarification.answered', taskId, answer: payload.answer })
      const next = await updateTask(task, {
        input: { ...task.input, prompt: `${task.input.prompt}\n用户确认：${payload.answer}`.trim() },
        status: 'queued',
      })
      void runTask(taskId)
      return next
    },
    async retryTask(taskId) {
      const task = await requireTask(taskId)
      const next = await updateTask(task, { status: 'queued', error: undefined })
      void runTask(taskId)
      return next
    },
    async repairTask(taskId) {
      await store.appendEvent(taskId, { type: 'step.started', taskId, step: 'repair' })
      const task = await requireTask(taskId)
      if (task.resultId) {
        const result = await store.getResult(task.resultId)
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
          await store.saveResult(taskId, repairedResult)
          await store.appendVersion({
            taskId,
            resultId: repairedResult.id,
            action: 'repaired',
            label: '确定性修复结果',
            snapshot: repairedResult,
          })
          await store.appendEvent(taskId, { type: 'result.ready', taskId, resultId: repairedResult.id })
          await store.appendEvent(taskId, { type: 'step.completed', taskId, step: 'repair' })
          return updateTask(task, { status: 'review', step: 'review', resultId: repairedResult.id, error: undefined })
        }
      }
      await store.appendEvent(taskId, { type: 'step.completed', taskId, step: 'repair' })
      const next = await updateTask(task, { status: 'queued', error: undefined })
      void runTask(taskId)
      return next
    },
    async rollbackTask(taskId) {
      const task = await requireTask(taskId)
      const versions = await store.listVersions(taskId)
      const target = versions.find(version => version.action === 'before-apply') ?? versions.find(version => version.action === 'applied') ?? versions[0]
      if (!target)
        throw new Error(`Task "${taskId}" has no version to rollback`)
      const rollback = await store.appendVersion({
        taskId,
        resultId: task.resultId,
        action: 'rolled-back',
        label: '回滚到应用前版本',
        snapshot: target.snapshot,
      })
      await store.appendEvent(taskId, { type: 'task.rolled-back', taskId, versionId: rollback.id })
      return updateTask(task, { status: 'done', step: 'done' })
    },
    async getResult(_taskId, resultId) {
      const result = await store.getResult(resultId)
      if (!result)
        throw new Error(`Result "${resultId}" was not found`)
      return result
    },
    async listVersions(taskId) {
      return store.listVersions(taskId)
    },
    async getProjectionSnapshot(taskId) {
      return store.getLatestProjectionSnapshot(taskId)
    },
    async getSourceSample(taskId) {
      return store.getSourceSample(taskId)
    },
    async exportSnapshot() {
      return store.exportSnapshot()
    },
    async importSnapshot(snapshot) {
      await store.importSnapshot(snapshot)
    },
    async cleanupExpired() {
      return store.cleanupExpired()
    },
    async cancelTask(taskId) {
      const task = await requireTask(taskId)
      await store.appendEvent(taskId, { type: 'task.cancelled', taskId })
      return updateTask(task, { status: 'cancelled' })
    },
    async applyTask(taskId) {
      const task = await requireTask(taskId)
      if (!task.resultId)
        throw new Error(`Task "${taskId}" has no result to apply`)
      const result = await store.getResult(task.resultId)
      if (!result)
        throw new Error(`Result "${task.resultId}" was not found`)
      const currentSchema = isValidSchema(task.input.currentSchema)
        ? task.input.currentSchema as DocumentSchema
        : undefined
      if (currentSchema) {
        await store.appendVersion({
          taskId,
          resultId: result.id,
          action: 'before-apply',
          label: '应用前版本',
          snapshot: currentSchema,
        })
      }
      await store.appendVersion({
        taskId,
        resultId: result.id,
        action: 'applied',
        label: '应用 Assistant 结果',
        snapshot: result.schema,
      })
      await store.appendEvent(taskId, { type: 'task.applied', taskId, resultId: result.id })
      return updateTask(task, { status: 'done', step: 'done' })
    },
  }
}

function parseLocalJsonSource(input: AssistantTaskInput): unknown {
  if (input.source?.kind !== 'json' || !input.source.content)
    return undefined
  try {
    return JSON.parse(input.source.content) as unknown
  }
  catch {
    return undefined
  }
}

function createClarificationRequest(prompt: string): { questions: string[], suggestedAnswers: string[][] } | undefined {
  const normalized = prompt.replace(/\s+/g, '')
  const genericDocument = /单据|单子|表单/.test(normalized)
    && !/报价单|出库单|入库单|收据|小票|发票|送货单|采购单|标签/.test(normalized)
  if (!genericDocument)
    return undefined
  return {
    questions: ['这是报价单、出库单、收据，还是其他类型的单据？'],
    suggestedAnswers: [['报价单', '出库单', '收据']],
  }
}
