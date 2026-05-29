import type { Table } from 'dexie'
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
import Dexie from 'dexie'
import { createId } from './id'

class AssistantDexieDatabase extends Dexie {
  tasks!: Table<AssistantTaskRecord, string>
  runs!: Table<AssistantRunRecord, string>
  results!: Table<AssistantResult, string>
  versions!: Table<AssistantVersionRecord, string>
  events!: Table<AssistantEventRecord, string>
  projectionSnapshots!: Table<AssistantProjectionSnapshotRecord, string>
  sourceSamples!: Table<AssistantSourceSampleRecord, string>

  constructor(name: string) {
    super(name)
    this.version(1).stores({
      tasks: 'id, status, updatedAt',
      runs: 'id, taskId, status, startedAt',
      results: 'id, createdAt',
      versions: 'id, taskId, resultId, createdAt',
      events: 'id, taskId, createdAt',
    })
    this.version(2).stores({
      tasks: 'id, status, updatedAt',
      runs: 'id, taskId, status, startedAt',
      results: 'id, createdAt',
      versions: 'id, taskId, resultId, createdAt',
      events: 'id, taskId, createdAt',
      projectionSnapshots: 'id, taskId, createdAt',
      sourceSamples: 'id, taskId, sourceKind, createdAt, expiresAt',
    })
  }
}

export class DexieAssistantStore implements AssistantStore {
  private readonly db: AssistantDexieDatabase

  constructor(name = 'easyink-assistant') {
    this.db = new AssistantDexieDatabase(name)
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
    await this.db.tasks.put(task)
    await this.appendEvent(task.id, { type: 'task.created', taskId: task.id })
    return task
  }

  async updateTask(task: AssistantTaskRecord): Promise<void> {
    await this.db.tasks.put({ ...task, updatedAt: Date.now() })
  }

  async getTask(id: string): Promise<AssistantTaskRecord | undefined> {
    return this.db.tasks.get(id)
  }

  async listTasks(): Promise<AssistantTaskRecord[]> {
    return this.db.tasks.orderBy('updatedAt').reverse().toArray()
  }

  async createRun(taskId: string): Promise<AssistantRunRecord> {
    const run: AssistantRunRecord = {
      id: createId('run'),
      taskId,
      status: 'running',
      startedAt: Date.now(),
    }
    await this.db.runs.put(run)
    return run
  }

  async updateRun(run: AssistantRunRecord): Promise<void> {
    await this.db.runs.put(run)
  }

  async saveResult(taskId: string, result: AssistantResult): Promise<void> {
    await this.db.results.put(result)
    await this.appendVersion({
      taskId,
      resultId: result.id,
      action: 'generated',
      snapshot: result,
    })
  }

  async getResult(id: string): Promise<AssistantResult | undefined> {
    return this.db.results.get(id)
  }

  async appendVersion(record: Omit<AssistantVersionRecord, 'id' | 'createdAt'>): Promise<AssistantVersionRecord> {
    const version: AssistantVersionRecord = { ...record, id: createId('ver'), createdAt: Date.now() }
    await this.db.versions.put(version)
    return version
  }

  async listVersions(taskId: string): Promise<AssistantVersionRecord[]> {
    const versions = await this.db.versions.where('taskId').equals(taskId).sortBy('createdAt')
    return versions.reverse()
  }

  async saveProjectionSnapshot(record: Omit<AssistantProjectionSnapshotRecord, 'id' | 'createdAt'>): Promise<AssistantProjectionSnapshotRecord> {
    const snapshot: AssistantProjectionSnapshotRecord = { ...record, id: createId('proj'), createdAt: Date.now() }
    await this.db.projectionSnapshots.put(snapshot)
    return snapshot
  }

  async getLatestProjectionSnapshot(taskId: string): Promise<AssistantProjectionSnapshotRecord | undefined> {
    const snapshots = await this.db.projectionSnapshots.where('taskId').equals(taskId).sortBy('createdAt')
    return snapshots.reverse()[0]
  }

  async saveSourceSample(record: Omit<AssistantSourceSampleRecord, 'id' | 'createdAt'>): Promise<AssistantSourceSampleRecord> {
    const sample: AssistantSourceSampleRecord = { ...record, id: createId('sample'), createdAt: Date.now() }
    await this.db.sourceSamples.put(sample)
    return sample
  }

  async getSourceSample(taskId: string): Promise<AssistantSourceSampleRecord | undefined> {
    const samples = await this.db.sourceSamples.where('taskId').equals(taskId).sortBy('createdAt')
    return samples.reverse()[0]
  }

  async appendEvent(taskId: string, event: AssistantEvent): Promise<AssistantEventRecord> {
    const record: AssistantEventRecord = { id: createId('evt'), taskId, event, createdAt: Date.now() }
    await this.db.events.put(record)
    return record
  }

  async listEvents(taskId: string): Promise<AssistantEventRecord[]> {
    return this.db.events.where('taskId').equals(taskId).sortBy('createdAt')
  }

  async exportSnapshot(): Promise<AssistantSnapshot> {
    const [tasks, runs, results, versions, events, projectionSnapshots, sourceSamples] = await Promise.all([
      this.db.tasks.toArray(),
      this.db.runs.toArray(),
      this.db.results.toArray(),
      this.db.versions.toArray(),
      this.db.events.toArray(),
      this.db.projectionSnapshots.toArray(),
      this.db.sourceSamples.toArray(),
    ])
    return { schemaVersion: 1, tasks, runs, results, versions, events, projectionSnapshots, sourceSamples }
  }

  async importSnapshot(snapshot: AssistantSnapshot): Promise<void> {
    await this.db.transaction('rw', [
      this.db.tasks,
      this.db.runs,
      this.db.results,
      this.db.versions,
      this.db.events,
      this.db.projectionSnapshots,
      this.db.sourceSamples,
    ], async () => {
      await Promise.all([
        this.db.tasks.clear(),
        this.db.runs.clear(),
        this.db.results.clear(),
        this.db.versions.clear(),
        this.db.events.clear(),
        this.db.projectionSnapshots.clear(),
        this.db.sourceSamples.clear(),
      ])
      await Promise.all([
        this.db.tasks.bulkPut(snapshot.tasks),
        this.db.runs.bulkPut(snapshot.runs),
        this.db.results.bulkPut(snapshot.results),
        this.db.versions.bulkPut(snapshot.versions),
        this.db.events.bulkPut(snapshot.events),
        this.db.projectionSnapshots.bulkPut(snapshot.projectionSnapshots ?? []),
        this.db.sourceSamples.bulkPut(snapshot.sourceSamples ?? []),
      ])
    })
  }

  async cleanupExpired(now = Date.now()): Promise<number> {
    const expired = await this.db.sourceSamples.where('expiresAt').belowOrEqual(now).primaryKeys()
    if (expired.length)
      await this.db.sourceSamples.bulkDelete(expired as string[])
    return expired.length
  }
}
