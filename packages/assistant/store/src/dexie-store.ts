import type { Table } from 'dexie'
import type {
  AssistantEvent,
  AssistantEventRecord,
  AssistantResult,
  AssistantRunRecord,
  AssistantSnapshot,
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

  constructor(name: string) {
    super(name)
    this.version(1).stores({
      tasks: 'id, status, updatedAt',
      runs: 'id, taskId, status, startedAt',
      results: 'id, createdAt',
      versions: 'id, taskId, resultId, createdAt',
      events: 'id, taskId, createdAt',
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

  async appendEvent(taskId: string, event: AssistantEvent): Promise<AssistantEventRecord> {
    const record: AssistantEventRecord = { id: createId('evt'), taskId, event, createdAt: Date.now() }
    await this.db.events.put(record)
    return record
  }

  async listEvents(taskId: string): Promise<AssistantEventRecord[]> {
    return this.db.events.where('taskId').equals(taskId).sortBy('createdAt')
  }

  async exportSnapshot(): Promise<AssistantSnapshot> {
    const [tasks, runs, results, versions, events] = await Promise.all([
      this.db.tasks.toArray(),
      this.db.runs.toArray(),
      this.db.results.toArray(),
      this.db.versions.toArray(),
      this.db.events.toArray(),
    ])
    return { tasks, runs, results, versions, events }
  }
}
