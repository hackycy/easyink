import type { ParsedExternalData } from '@easyink/assistant-adapters'
import type {
  AssistantResult,
  AssistantSourceInput,
  AssistantTaskInput,
  AssistantWorkflowStep,
} from '@easyink/assistant-capabilities'
import type { AssistantStore, AssistantTaskRecord } from '@easyink/assistant-store'
import type { DocumentSchema } from '@easyink/schema'
import type { Logger } from 'pino'
import { resolveExternalData } from '@easyink/assistant-adapters'
import {
  alignAssistantDataSource,
  createAssistantPreview,
  diffAssistantSchema,
  generateSchemaCandidate,
  validateAssistantSchema,
} from '@easyink/assistant-capabilities'
import { createId, MemoryAssistantStore } from '@easyink/assistant-store'
import { isValidSchema } from '@easyink/schema'
import pino from 'pino'
import { createAssistantWorkflowGraph } from './graph'

export interface AssistantOrchestratorOptions {
  store?: AssistantStore
  logger?: Logger
}

export class AssistantOrchestrator {
  readonly store: AssistantStore
  private readonly logger: Logger
  private readonly graph = createAssistantWorkflowGraph()

  constructor(options: AssistantOrchestratorOptions = {}) {
    this.store = options.store ?? new MemoryAssistantStore()
    this.logger = options.logger ?? pino({ name: 'easyink-assistant' })
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
      await this.runStep(current, 'plan')

      let externalData: ParsedExternalData | undefined
      if (current.input.source && current.input.source.kind !== 'none') {
        await this.runStep(current, 'source')
        externalData = await this.resolveSource(current.input.source)
      }
      else {
        current = await this.updateTask(current, { step: 'source' })
        await this.store.appendEvent(taskId, { type: 'step.completed', taskId, step: 'source' })
      }

      await this.runStep(current, 'compose')
      const candidate = generateSchemaCandidate(current.input, {
        sourceData: externalData?.sample,
        sourceDescriptor: externalData?.descriptor,
      })

      await this.runStep(current, 'validate')
      const validation = validateAssistantSchema(candidate.schema)
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
        preview: createAssistantPreview(candidate.schema, candidate.dataSource, [
          ...candidate.warnings,
          ...(externalData?.warnings ?? []),
        ]),
        createdAt: Date.now(),
      }

      await this.store.saveResult(taskId, result)
      await this.store.appendEvent(taskId, { type: 'result.ready', taskId, resultId: result.id })
      await this.runStep(current, 'review')
      current = await this.updateTask(current, { status: 'review', step: 'review', resultId: result.id })
      await this.store.updateRun({ ...run, status: 'review', finishedAt: Date.now() })
      return current
    }
    catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await this.store.appendEvent(taskId, { type: 'task.failed', taskId, error: message })
      current = await this.updateTask(current, { status: 'failed', step: 'failed', error: message })
      await this.store.updateRun({ ...run, status: 'failed', finishedAt: Date.now(), error: message })
      throw error
    }
  }

  async cancelTask(taskId: string): Promise<AssistantTaskRecord> {
    const task = await this.requireTask(taskId)
    const updated = await this.updateTask(task, { status: 'cancelled' })
    await this.store.appendEvent(taskId, { type: 'task.cancelled', taskId })
    return updated
  }

  async applyTaskResult(taskId: string): Promise<AssistantTaskRecord> {
    const task = await this.requireTask(taskId)
    if (!task.resultId)
      throw new Error(`Task "${taskId}" has no result to apply`)
    const result = await this.store.getResult(task.resultId)
    if (!result)
      throw new Error(`Result "${task.resultId}" was not found`)
    await this.store.appendVersion({
      taskId,
      resultId: result.id,
      action: 'applied',
      snapshot: result.schema,
    })
    await this.store.appendEvent(taskId, { type: 'task.applied', taskId, resultId: result.id })
    return this.updateTask(task, { status: 'done', step: 'done' })
  }

  private async runStep(task: AssistantTaskRecord, step: AssistantWorkflowStep): Promise<void> {
    await this.store.appendEvent(task.id, { type: 'step.started', taskId: task.id, step })
    await this.updateTask(task, { step })
    await this.store.appendEvent(task.id, { type: 'step.completed', taskId: task.id, step })
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
}
