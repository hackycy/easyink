import type {
  AssistantEvent,
  AssistantEventRecord,
  AssistantProjectionSnapshotRecord,
  AssistantResult,
  AssistantRunRecord,
  AssistantSnapshot,
  AssistantSourceSampleRecord,
  AssistantStore,
  AssistantTaskInput,
  AssistantTaskRecord,
  AssistantVersionRecord,
} from './types'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { createId } from './id'
import { EventSubscriptions } from './subscriptions'

export interface FileAssistantStoreOptions {
  dir: string
  fileName?: string
}

interface FileAssistantState extends AssistantSnapshot {}

export class FileAssistantStore implements AssistantStore {
  private readonly filePath: string
  private readonly subscriptions = new EventSubscriptions()
  private state?: FileAssistantState
  private pending = Promise.resolve()

  constructor(options: FileAssistantStoreOptions | string) {
    const config = typeof options === 'string' ? { dir: options } : options
    this.filePath = join(config.dir, config.fileName ?? 'assistant-store.json')
  }

  async createTask(input: AssistantTaskInput): Promise<AssistantTaskRecord> {
    const now = Date.now()
    const task: AssistantTaskRecord = {
      id: createId('task'),
      input,
      status: 'queued',
      step: 'idle',
      createdAt: now,
      updatedAt: now,
    }
    const state = await this.load()
    state.tasks.push(clone(task))
    await this.persist(state)
    await this.appendEvent(task.id, { type: 'task.created', taskId: task.id })
    return clone(task)
  }

  async updateTask(task: AssistantTaskRecord): Promise<void> {
    const state = await this.load()
    const updated = clone({ ...task, updatedAt: Date.now() })
    upsert(state.tasks, updated)
    await this.persist(state)
  }

  async getTask(id: string): Promise<AssistantTaskRecord | undefined> {
    const task = (await this.load()).tasks.find(task => task.id === id)
    return task ? clone(task) : undefined
  }

  async listTasks(): Promise<AssistantTaskRecord[]> {
    return [...(await this.load()).tasks]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map(task => clone(task))
  }

  async createRun(taskId: string): Promise<AssistantRunRecord> {
    const run: AssistantRunRecord = {
      id: createId('run'),
      taskId,
      status: 'running',
      startedAt: Date.now(),
    }
    const state = await this.load()
    state.runs.push(clone(run))
    await this.persist(state)
    return clone(run)
  }

  async updateRun(run: AssistantRunRecord): Promise<void> {
    const state = await this.load()
    upsert(state.runs, clone(run))
    await this.persist(state)
  }

  async saveResult(taskId: string, result: AssistantResult): Promise<void> {
    const state = await this.load()
    upsert(state.results, clone(result))
    await this.persist(state)
    await this.appendVersion({
      taskId,
      resultId: result.id,
      action: 'generated',
      snapshot: result,
    })
  }

  async getResult(id: string): Promise<AssistantResult | undefined> {
    const result = (await this.load()).results.find(result => result.id === id)
    return result ? clone(result) : undefined
  }

  async appendVersion(record: Omit<AssistantVersionRecord, 'id' | 'createdAt'>): Promise<AssistantVersionRecord> {
    const version: AssistantVersionRecord = { ...record, id: createId('ver'), createdAt: Date.now() }
    const state = await this.load()
    state.versions.push(clone(version))
    await this.persist(state)
    return clone(version)
  }

  async listVersions(taskId: string): Promise<AssistantVersionRecord[]> {
    return [...(await this.load()).versions]
      .filter(version => version.taskId === taskId)
      .sort((a, b) => b.createdAt - a.createdAt)
      .map(version => clone(version))
  }

  async saveProjectionSnapshot(record: Omit<AssistantProjectionSnapshotRecord, 'id' | 'createdAt'>): Promise<AssistantProjectionSnapshotRecord> {
    const snapshot: AssistantProjectionSnapshotRecord = { ...record, id: createId('proj'), createdAt: Date.now() }
    const state = await this.load()
    state.projectionSnapshots.push(clone(snapshot))
    await this.persist(state)
    return clone(snapshot)
  }

  async getLatestProjectionSnapshot(taskId: string): Promise<AssistantProjectionSnapshotRecord | undefined> {
    const snapshot = [...(await this.load()).projectionSnapshots]
      .filter(record => record.taskId === taskId)
      .sort((a, b) => b.createdAt - a.createdAt)[0]
    return snapshot ? clone(snapshot) : undefined
  }

  async saveSourceSample(record: Omit<AssistantSourceSampleRecord, 'id' | 'createdAt'>): Promise<AssistantSourceSampleRecord> {
    const sample: AssistantSourceSampleRecord = { ...record, id: createId('sample'), createdAt: Date.now() }
    const state = await this.load()
    state.sourceSamples.push(clone(sample))
    await this.persist(state)
    return clone(sample)
  }

  async getSourceSample(taskId: string): Promise<AssistantSourceSampleRecord | undefined> {
    const sample = [...(await this.load()).sourceSamples]
      .filter(record => record.taskId === taskId)
      .sort((a, b) => b.createdAt - a.createdAt)[0]
    return sample ? clone(sample) : undefined
  }

  async appendEvent(taskId: string, event: AssistantEvent): Promise<AssistantEventRecord> {
    const record: AssistantEventRecord = { id: createId('evt'), taskId, event, createdAt: Date.now() }
    const state = await this.load()
    state.events.push(clone(record))
    await this.persist(state)
    this.subscriptions.emit(clone(record))
    return clone(record)
  }

  subscribe(taskId: string, listener: (record: AssistantEventRecord) => void): () => void {
    return this.subscriptions.subscribe(taskId, listener)
  }

  async listEvents(taskId: string): Promise<AssistantEventRecord[]> {
    return [...(await this.load()).events]
      .filter(record => record.taskId === taskId)
      .sort((a, b) => a.createdAt - b.createdAt)
      .map(record => clone(record))
  }

  async exportSnapshot(): Promise<AssistantSnapshot> {
    return clone(await this.load())
  }

  async importSnapshot(snapshot: AssistantSnapshot): Promise<void> {
    this.state = normalizeSnapshot(snapshot)
    await this.persist(this.state)
  }

  async cleanupExpired(now = Date.now()): Promise<number> {
    const state = await this.load()
    const before = state.sourceSamples.length
    state.sourceSamples = state.sourceSamples.filter(sample => !sample.expiresAt || sample.expiresAt > now)
    const removed = before - state.sourceSamples.length
    if (removed)
      await this.persist(state)
    return removed
  }

  private async load(): Promise<FileAssistantState> {
    if (this.state)
      return this.state
    try {
      const raw = await readFile(this.filePath, 'utf8')
      this.state = normalizeSnapshot(JSON.parse(raw) as AssistantSnapshot)
    }
    catch (error) {
      if (!isNotFoundError(error))
        throw error
      this.state = createEmptySnapshot()
      await this.persist(this.state)
    }
    return this.state
  }

  private async persist(state: FileAssistantState): Promise<void> {
    this.pending = this.pending.then(async () => {
      await mkdir(dirname(this.filePath), { recursive: true })
      const tempPath = `${this.filePath}.tmp`
      await writeFile(tempPath, `${JSON.stringify(state, null, 2)}\n`, 'utf8')
      await rename(tempPath, this.filePath)
    })
    await this.pending
  }
}

function createEmptySnapshot(): FileAssistantState {
  return {
    schemaVersion: 1,
    tasks: [],
    runs: [],
    results: [],
    versions: [],
    events: [],
    projectionSnapshots: [],
    sourceSamples: [],
  }
}

function normalizeSnapshot(snapshot: AssistantSnapshot): FileAssistantState {
  return {
    schemaVersion: 1,
    tasks: clone(snapshot.tasks ?? []),
    runs: clone(snapshot.runs ?? []),
    results: clone(snapshot.results ?? []),
    versions: clone(snapshot.versions ?? []),
    events: clone(snapshot.events ?? []),
    projectionSnapshots: clone(snapshot.projectionSnapshots ?? []),
    sourceSamples: clone(snapshot.sourceSamples ?? []),
  }
}

function upsert<T extends { id: string }>(records: T[], record: T): void {
  const index = records.findIndex(item => item.id === record.id)
  if (index >= 0)
    records[index] = record
  else
    records.push(record)
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function isNotFoundError(error: unknown): boolean {
  return !!error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT'
}
