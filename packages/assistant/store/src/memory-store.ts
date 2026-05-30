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
import { createId } from './id'
import { EventSubscriptions } from './subscriptions'

export class MemoryAssistantStore implements AssistantStore {
  private readonly subscriptions = new EventSubscriptions()
  private readonly tasks = new Map<string, AssistantTaskRecord>()
  private readonly runs = new Map<string, AssistantRunRecord>()
  private readonly results = new Map<string, AssistantResult>()
  private readonly versions = new Map<string, AssistantVersionRecord>()
  private readonly events = new Map<string, AssistantEventRecord>()
  private readonly projectionSnapshots = new Map<string, AssistantProjectionSnapshotRecord>()
  private readonly sourceSamples = new Map<string, AssistantSourceSampleRecord>()

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
    this.tasks.set(task.id, task)
    await this.appendEvent(task.id, { type: 'task.created', taskId: task.id })
    return clone(task)
  }

  async updateTask(task: AssistantTaskRecord): Promise<void> {
    this.tasks.set(task.id, clone({ ...task, updatedAt: Date.now() }))
  }

  async getTask(id: string): Promise<AssistantTaskRecord | undefined> {
    const task = this.tasks.get(id)
    return task ? clone(task) : undefined
  }

  async listTasks(): Promise<AssistantTaskRecord[]> {
    return [...this.tasks.values()].sort((a, b) => b.updatedAt - a.updatedAt).map(task => clone(task))
  }

  async createRun(taskId: string): Promise<AssistantRunRecord> {
    const run: AssistantRunRecord = {
      id: createId('run'),
      taskId,
      status: 'running',
      startedAt: Date.now(),
    }
    this.runs.set(run.id, run)
    return clone(run)
  }

  async updateRun(run: AssistantRunRecord): Promise<void> {
    this.runs.set(run.id, clone(run))
  }

  async saveResult(taskId: string, result: AssistantResult): Promise<void> {
    this.results.set(result.id, clone(result))
    await this.appendVersion({
      taskId,
      resultId: result.id,
      action: 'generated',
      snapshot: result,
    })
  }

  async getResult(id: string): Promise<AssistantResult | undefined> {
    const result = this.results.get(id)
    return result ? clone(result) : undefined
  }

  async appendVersion(record: Omit<AssistantVersionRecord, 'id' | 'createdAt'>): Promise<AssistantVersionRecord> {
    const version: AssistantVersionRecord = {
      ...record,
      id: createId('ver'),
      createdAt: Date.now(),
    }
    this.versions.set(version.id, clone(version))
    return clone(version)
  }

  async listVersions(taskId: string): Promise<AssistantVersionRecord[]> {
    return [...this.versions.values()]
      .filter(version => version.taskId === taskId)
      .sort((a, b) => b.createdAt - a.createdAt)
      .map(version => clone(version))
  }

  async saveProjectionSnapshot(record: Omit<AssistantProjectionSnapshotRecord, 'id' | 'createdAt'>): Promise<AssistantProjectionSnapshotRecord> {
    const snapshot: AssistantProjectionSnapshotRecord = {
      ...record,
      id: createId('proj'),
      createdAt: Date.now(),
    }
    this.projectionSnapshots.set(snapshot.id, clone(snapshot))
    return clone(snapshot)
  }

  async getLatestProjectionSnapshot(taskId: string): Promise<AssistantProjectionSnapshotRecord | undefined> {
    const snapshot = [...this.projectionSnapshots.values()]
      .filter(record => record.taskId === taskId)
      .sort((a, b) => b.createdAt - a.createdAt)[0]
    return snapshot ? clone(snapshot) : undefined
  }

  async saveSourceSample(record: Omit<AssistantSourceSampleRecord, 'id' | 'createdAt'>): Promise<AssistantSourceSampleRecord> {
    const sample: AssistantSourceSampleRecord = {
      ...record,
      id: createId('sample'),
      createdAt: Date.now(),
    }
    this.sourceSamples.set(sample.id, clone(sample))
    return clone(sample)
  }

  async getSourceSample(taskId: string): Promise<AssistantSourceSampleRecord | undefined> {
    const sample = [...this.sourceSamples.values()]
      .filter(record => record.taskId === taskId)
      .sort((a, b) => b.createdAt - a.createdAt)[0]
    return sample ? clone(sample) : undefined
  }

  async appendEvent(taskId: string, event: AssistantEvent): Promise<AssistantEventRecord> {
    const record: AssistantEventRecord = {
      id: createId('evt'),
      taskId,
      event,
      createdAt: Date.now(),
    }
    this.events.set(record.id, clone(record))
    this.subscriptions.emit(clone(record))
    return clone(record)
  }

  subscribe(taskId: string, listener: (record: AssistantEventRecord) => void): () => void {
    return this.subscriptions.subscribe(taskId, listener)
  }

  async listEvents(taskId: string): Promise<AssistantEventRecord[]> {
    return [...this.events.values()]
      .filter(record => record.taskId === taskId)
      .sort((a, b) => a.createdAt - b.createdAt)
      .map(record => clone(record))
  }

  async exportSnapshot(): Promise<AssistantSnapshot> {
    return {
      schemaVersion: 1,
      tasks: [...this.tasks.values()].map(task => clone(task)),
      runs: [...this.runs.values()].map(run => clone(run)),
      results: [...this.results.values()].map(result => clone(result)),
      versions: [...this.versions.values()].map(version => clone(version)),
      events: [...this.events.values()].map(event => clone(event)),
      projectionSnapshots: [...this.projectionSnapshots.values()].map(snapshot => clone(snapshot)),
      sourceSamples: [...this.sourceSamples.values()].map(sample => clone(sample)),
    }
  }

  async importSnapshot(snapshot: AssistantSnapshot): Promise<void> {
    this.tasks.clear()
    this.runs.clear()
    this.results.clear()
    this.versions.clear()
    this.events.clear()
    this.projectionSnapshots.clear()
    this.sourceSamples.clear()
    for (const task of snapshot.tasks)
      this.tasks.set(task.id, clone(task))
    for (const run of snapshot.runs)
      this.runs.set(run.id, clone(run))
    for (const result of snapshot.results)
      this.results.set(result.id, clone(result))
    for (const version of snapshot.versions)
      this.versions.set(version.id, clone(version))
    for (const event of snapshot.events)
      this.events.set(event.id, clone(event))
    for (const projection of snapshot.projectionSnapshots ?? [])
      this.projectionSnapshots.set(projection.id, clone(projection))
    for (const sample of snapshot.sourceSamples ?? [])
      this.sourceSamples.set(sample.id, clone(sample))
  }

  async cleanupExpired(now = Date.now()): Promise<number> {
    let removed = 0
    for (const [id, sample] of this.sourceSamples) {
      if (sample.expiresAt && sample.expiresAt <= now) {
        this.sourceSamples.delete(id)
        removed += 1
      }
    }
    return removed
  }
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}
