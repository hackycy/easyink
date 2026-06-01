import type {
  AssistantConversationRecord,
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
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { createId } from './id'
import { clone, normalizeSnapshot } from './snapshot'
import { EventSubscriptions } from './subscriptions'

export interface SQLiteAssistantStoreOptions {
  dir?: string
  fileName?: string
  path?: string
}

type SQLiteValue = string | number | null

export class SQLiteAssistantStore implements AssistantStore {
  private readonly databasePath: string
  private readonly subscriptions = new EventSubscriptions()
  private db?: DatabaseSync

  constructor(options: SQLiteAssistantStoreOptions | string) {
    const config = typeof options === 'string' ? { dir: options } : options
    if (config.path) {
      this.databasePath = config.path
    }
    else if (config.dir) {
      this.databasePath = join(config.dir, config.fileName ?? 'assistant-store.sqlite')
    }
    else {
      throw new Error('SQLiteAssistantStore requires either a database path or dir')
    }
  }

  async upsertConversation(record: Omit<AssistantConversationRecord, 'createdAt' | 'updatedAt'> & Partial<Pick<AssistantConversationRecord, 'createdAt' | 'updatedAt'>>): Promise<AssistantConversationRecord> {
    const now = Date.now()
    const existing = await this.getConversation(record.id)
    const conversation: AssistantConversationRecord = {
      ...existing,
      ...record,
      createdAt: existing?.createdAt ?? record.createdAt ?? now,
      updatedAt: now,
    }
    this.database().prepare(`
      INSERT INTO conversations (id, active_task_id, title, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        active_task_id = excluded.active_task_id,
        title = excluded.title,
        status = excluded.status,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at
    `).run(
      conversation.id,
      conversation.activeTaskId ?? null,
      conversation.title ?? null,
      conversation.status,
      conversation.createdAt,
      conversation.updatedAt,
    )
    return clone(conversation)
  }

  async getConversation(id: string): Promise<AssistantConversationRecord | undefined> {
    const row = this.database().prepare('SELECT * FROM conversations WHERE id = ?').get(id)
    return row ? conversationFromRow(row) : undefined
  }

  async listConversations(): Promise<AssistantConversationRecord[]> {
    return this.database()
      .prepare('SELECT * FROM conversations ORDER BY updated_at DESC')
      .all()
      .map(row => conversationFromRow(row))
  }

  async deleteConversation(id: string): Promise<void> {
    this.database().prepare('DELETE FROM conversations WHERE id = ?').run(id)
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
    this.putTask(task)
    await this.appendEvent(task.id, { type: 'task.created', taskId: task.id })
    return clone(task)
  }

  async updateTask(task: AssistantTaskRecord): Promise<void> {
    this.putTask({ ...task, updatedAt: Date.now() })
  }

  async getTask(id: string): Promise<AssistantTaskRecord | undefined> {
    const row = this.database().prepare('SELECT * FROM tasks WHERE id = ?').get(id)
    return row ? taskFromRow(row) : undefined
  }

  async listTasks(): Promise<AssistantTaskRecord[]> {
    return this.database()
      .prepare('SELECT * FROM tasks ORDER BY updated_at DESC')
      .all()
      .map(row => taskFromRow(row))
  }

  async createRun(taskId: string): Promise<AssistantRunRecord> {
    const run: AssistantRunRecord = {
      id: createId('run'),
      taskId,
      status: 'running',
      startedAt: Date.now(),
    }
    this.database().prepare(`
      INSERT INTO runs (id, task_id, status, started_at, finished_at, error)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(run.id, run.taskId, run.status, run.startedAt, run.finishedAt ?? null, run.error ?? null)
    return clone(run)
  }

  async updateRun(run: AssistantRunRecord): Promise<void> {
    this.database().prepare(`
      INSERT INTO runs (id, task_id, status, started_at, finished_at, error)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        task_id = excluded.task_id,
        status = excluded.status,
        started_at = excluded.started_at,
        finished_at = excluded.finished_at,
        error = excluded.error
    `).run(run.id, run.taskId, run.status, run.startedAt, run.finishedAt ?? null, run.error ?? null)
  }

  async saveResult(taskId: string, result: AssistantResult): Promise<void> {
    const db = this.database()
    transaction(db, () => {
      this.putResult(result)
      this.putVersion({
        taskId,
        resultId: result.id,
        action: 'generated',
        snapshot: result,
      })
    })
  }

  async saveResultRecord(result: AssistantResult): Promise<void> {
    this.putResult(result)
  }

  async getResult(id: string): Promise<AssistantResult | undefined> {
    const row = this.database().prepare('SELECT result_json FROM results WHERE id = ?').get(id)
    return row ? readJson<AssistantResult>(column(row, 'result_json')) : undefined
  }

  async appendVersion(record: Omit<AssistantVersionRecord, 'id' | 'createdAt'>): Promise<AssistantVersionRecord> {
    const version = this.putVersion(record)
    return clone(version)
  }

  async listVersions(taskId: string): Promise<AssistantVersionRecord[]> {
    return this.database()
      .prepare('SELECT * FROM versions WHERE task_id = ? ORDER BY created_at DESC')
      .all(taskId)
      .map(row => versionFromRow(row))
  }

  async saveProjectionSnapshot(record: Omit<AssistantProjectionSnapshotRecord, 'id' | 'createdAt'>): Promise<AssistantProjectionSnapshotRecord> {
    const snapshot: AssistantProjectionSnapshotRecord = { ...record, id: createId('proj'), createdAt: Date.now() }
    this.database().prepare(`
      INSERT INTO projection_snapshots (id, task_id, messages_json, created_at)
      VALUES (?, ?, ?, ?)
    `).run(snapshot.id, snapshot.taskId, JSON.stringify(snapshot.messages), snapshot.createdAt)
    return clone(snapshot)
  }

  async getLatestProjectionSnapshot(taskId: string): Promise<AssistantProjectionSnapshotRecord | undefined> {
    const row = this.database()
      .prepare('SELECT * FROM projection_snapshots WHERE task_id = ? ORDER BY created_at DESC LIMIT 1')
      .get(taskId)
    return row ? projectionSnapshotFromRow(row) : undefined
  }

  async saveSourceSample(record: Omit<AssistantSourceSampleRecord, 'id' | 'createdAt'>): Promise<AssistantSourceSampleRecord> {
    const sample: AssistantSourceSampleRecord = { ...record, id: createId('sample'), createdAt: Date.now() }
    this.database().prepare(`
      INSERT INTO source_samples (
        id, task_id, source_kind, descriptor_json, sample_json, warnings_json, created_at, expires_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      sample.id,
      sample.taskId,
      sample.sourceKind,
      optionalJson(sample.descriptor),
      JSON.stringify(sample.sample),
      JSON.stringify(sample.warnings),
      sample.createdAt,
      sample.expiresAt ?? null,
    )
    return clone(sample)
  }

  async getSourceSample(taskId: string): Promise<AssistantSourceSampleRecord | undefined> {
    const row = this.database()
      .prepare('SELECT * FROM source_samples WHERE task_id = ? ORDER BY created_at DESC LIMIT 1')
      .get(taskId)
    return row ? sourceSampleFromRow(row) : undefined
  }

  async saveEventRecord(record: AssistantEventRecord): Promise<void> {
    this.putEvent(record)
    this.subscriptions.emit(clone(record))
  }

  async appendEvent(taskId: string, event: AssistantEvent): Promise<AssistantEventRecord> {
    const record: AssistantEventRecord = { id: createId('evt'), taskId, event, createdAt: Date.now() }
    this.putEvent(record)
    this.subscriptions.emit(clone(record))
    return clone(record)
  }

  async listEvents(taskId: string): Promise<AssistantEventRecord[]> {
    return this.database()
      .prepare('SELECT * FROM events WHERE task_id = ? ORDER BY created_at ASC')
      .all(taskId)
      .map(row => eventFromRow(row))
  }

  subscribe(taskId: string, listener: (record: AssistantEventRecord) => void): () => void {
    return this.subscriptions.subscribe(taskId, listener)
  }

  async importSnapshot(snapshot: AssistantSnapshot): Promise<void> {
    const normalized = normalizeSnapshot(snapshot)
    const db = this.database()
    transaction(db, () => {
      for (const table of [
        'tasks',
        'runs',
        'results',
        'versions',
        'events',
        'projection_snapshots',
        'source_samples',
        'conversations',
      ]) {
        db.exec(`DELETE FROM ${table}`)
      }
      for (const task of normalized.tasks)
        this.putTask(task)
      for (const run of normalized.runs)
        this.putRun(run)
      for (const result of normalized.results)
        this.putResult(result)
      for (const version of normalized.versions)
        this.putVersionRecord(version)
      for (const event of normalized.events)
        this.putEvent(event)
      for (const projection of normalized.projectionSnapshots)
        this.putProjectionSnapshot(projection)
      for (const sample of normalized.sourceSamples)
        this.putSourceSample(sample)
      for (const conversation of normalized.conversations)
        this.putConversation(conversation)
    })
  }

  async exportSnapshot(): Promise<AssistantSnapshot> {
    const db = this.database()
    return {
      schemaVersion: 2,
      tasks: db.prepare('SELECT * FROM tasks').all().map(row => taskFromRow(row)),
      runs: db.prepare('SELECT * FROM runs').all().map(row => runFromRow(row)),
      results: db.prepare('SELECT result_json FROM results').all().map(row => readJson<AssistantResult>(column(row, 'result_json'))),
      versions: db.prepare('SELECT * FROM versions').all().map(row => versionFromRow(row)),
      events: db.prepare('SELECT * FROM events').all().map(row => eventFromRow(row)),
      projectionSnapshots: db.prepare('SELECT * FROM projection_snapshots').all().map(row => projectionSnapshotFromRow(row)),
      sourceSamples: db.prepare('SELECT * FROM source_samples').all().map(row => sourceSampleFromRow(row)),
      conversations: db.prepare('SELECT * FROM conversations').all().map(row => conversationFromRow(row)),
    }
  }

  async cleanupExpired(now = Date.now()): Promise<number> {
    const result = this.database().prepare('DELETE FROM source_samples WHERE expires_at IS NOT NULL AND expires_at <= ?').run(now)
    return Number(result.changes)
  }

  close(): void {
    this.db?.close()
    this.db = undefined
  }

  private database(): DatabaseSync {
    if (this.db)
      return this.db
    if (this.databasePath !== ':memory:')
      mkdirSync(dirname(this.databasePath), { recursive: true })
    this.db = new DatabaseSync(this.databasePath)
    this.db.exec('PRAGMA journal_mode = WAL')
    this.db.exec('PRAGMA synchronous = NORMAL')
    this.db.exec('PRAGMA busy_timeout = 5000')
    this.db.exec('PRAGMA foreign_keys = ON')
    this.migrate(this.db)
    return this.db
  }

  private migrate(db: DatabaseSync): void {
    db.exec(`
      CREATE TABLE IF NOT EXISTS assistant_store_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        active_task_id TEXT,
        title TEXT,
        status TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        input_json TEXT NOT NULL,
        status TEXT NOT NULL,
        step TEXT NOT NULL,
        result_id TEXT,
        error TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS runs (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        status TEXT NOT NULL,
        started_at INTEGER NOT NULL,
        finished_at INTEGER,
        error TEXT
      );

      CREATE TABLE IF NOT EXISTS results (
        id TEXT PRIMARY KEY,
        result_json TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS versions (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        result_id TEXT,
        action TEXT NOT NULL,
        label TEXT,
        snapshot_json TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS events (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        event_json TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS projection_snapshots (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        messages_json TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS source_samples (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        source_kind TEXT NOT NULL,
        descriptor_json TEXT,
        sample_json TEXT NOT NULL,
        warnings_json TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        expires_at INTEGER
      );

      CREATE INDEX IF NOT EXISTS idx_conversations_updated_at ON conversations(updated_at);
      CREATE INDEX IF NOT EXISTS idx_tasks_updated_at ON tasks(updated_at);
      CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
      CREATE INDEX IF NOT EXISTS idx_runs_task_id ON runs(task_id);
      CREATE INDEX IF NOT EXISTS idx_versions_task_id_created_at ON versions(task_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_events_task_id_created_at ON events(task_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_projection_snapshots_task_id_created_at ON projection_snapshots(task_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_source_samples_task_id_created_at ON source_samples(task_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_source_samples_expires_at ON source_samples(expires_at);
    `)
    db.prepare(`
      INSERT INTO assistant_store_meta (key, value)
      VALUES ('schema_version', '1')
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run()
  }

  private putTask(task: AssistantTaskRecord): void {
    this.database().prepare(`
      INSERT INTO tasks (id, input_json, status, step, result_id, error, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        input_json = excluded.input_json,
        status = excluded.status,
        step = excluded.step,
        result_id = excluded.result_id,
        error = excluded.error,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at
    `).run(task.id, JSON.stringify(task.input), task.status, task.step, task.resultId ?? null, task.error ?? null, task.createdAt, task.updatedAt)
  }

  private putRun(run: AssistantRunRecord): void {
    this.database().prepare(`
      INSERT INTO runs (id, task_id, status, started_at, finished_at, error)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        task_id = excluded.task_id,
        status = excluded.status,
        started_at = excluded.started_at,
        finished_at = excluded.finished_at,
        error = excluded.error
    `).run(run.id, run.taskId, run.status, run.startedAt, run.finishedAt ?? null, run.error ?? null)
  }

  private putResult(result: AssistantResult): void {
    this.database().prepare(`
      INSERT INTO results (id, result_json, created_at)
      VALUES (?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        result_json = excluded.result_json,
        created_at = excluded.created_at
    `).run(result.id, JSON.stringify(result), result.createdAt)
  }

  private putVersion(record: Omit<AssistantVersionRecord, 'id' | 'createdAt'>): AssistantVersionRecord {
    const version: AssistantVersionRecord = { ...record, id: createId('ver'), createdAt: Date.now() }
    this.putVersionRecord(version)
    return version
  }

  private putVersionRecord(version: AssistantVersionRecord): void {
    this.database().prepare(`
      INSERT INTO versions (id, task_id, result_id, action, label, snapshot_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        task_id = excluded.task_id,
        result_id = excluded.result_id,
        action = excluded.action,
        label = excluded.label,
        snapshot_json = excluded.snapshot_json,
        created_at = excluded.created_at
    `).run(version.id, version.taskId, version.resultId ?? null, version.action, version.label ?? null, JSON.stringify(version.snapshot), version.createdAt)
  }

  private putEvent(record: AssistantEventRecord): void {
    this.database().prepare(`
      INSERT INTO events (id, task_id, event_json, created_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        task_id = excluded.task_id,
        event_json = excluded.event_json,
        created_at = excluded.created_at
    `).run(record.id, record.taskId, JSON.stringify(record.event), record.createdAt)
  }

  private putProjectionSnapshot(snapshot: AssistantProjectionSnapshotRecord): void {
    this.database().prepare(`
      INSERT INTO projection_snapshots (id, task_id, messages_json, created_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        task_id = excluded.task_id,
        messages_json = excluded.messages_json,
        created_at = excluded.created_at
    `).run(snapshot.id, snapshot.taskId, JSON.stringify(snapshot.messages), snapshot.createdAt)
  }

  private putSourceSample(sample: AssistantSourceSampleRecord): void {
    this.database().prepare(`
      INSERT INTO source_samples (
        id, task_id, source_kind, descriptor_json, sample_json, warnings_json, created_at, expires_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        task_id = excluded.task_id,
        source_kind = excluded.source_kind,
        descriptor_json = excluded.descriptor_json,
        sample_json = excluded.sample_json,
        warnings_json = excluded.warnings_json,
        created_at = excluded.created_at,
        expires_at = excluded.expires_at
    `).run(
      sample.id,
      sample.taskId,
      sample.sourceKind,
      optionalJson(sample.descriptor),
      JSON.stringify(sample.sample),
      JSON.stringify(sample.warnings),
      sample.createdAt,
      sample.expiresAt ?? null,
    )
  }

  private putConversation(conversation: AssistantConversationRecord): void {
    this.database().prepare(`
      INSERT INTO conversations (id, active_task_id, title, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        active_task_id = excluded.active_task_id,
        title = excluded.title,
        status = excluded.status,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at
    `).run(
      conversation.id,
      conversation.activeTaskId ?? null,
      conversation.title ?? null,
      conversation.status,
      conversation.createdAt,
      conversation.updatedAt,
    )
  }
}

function transaction(db: DatabaseSync, run: () => void): void {
  db.exec('BEGIN IMMEDIATE')
  try {
    run()
    db.exec('COMMIT')
  }
  catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}

function taskFromRow(row: unknown): AssistantTaskRecord {
  return {
    id: stringColumn(row, 'id'),
    input: readJson<AssistantTaskInput>(column(row, 'input_json')),
    status: stringColumn(row, 'status') as AssistantTaskRecord['status'],
    step: stringColumn(row, 'step') as AssistantTaskRecord['step'],
    resultId: optionalStringColumn(row, 'result_id'),
    error: optionalStringColumn(row, 'error'),
    createdAt: numberColumn(row, 'created_at'),
    updatedAt: numberColumn(row, 'updated_at'),
  }
}

function runFromRow(row: unknown): AssistantRunRecord {
  return {
    id: stringColumn(row, 'id'),
    taskId: stringColumn(row, 'task_id'),
    status: stringColumn(row, 'status') as AssistantRunRecord['status'],
    startedAt: numberColumn(row, 'started_at'),
    finishedAt: optionalNumberColumn(row, 'finished_at'),
    error: optionalStringColumn(row, 'error'),
  }
}

function versionFromRow(row: unknown): AssistantVersionRecord {
  return {
    id: stringColumn(row, 'id'),
    taskId: stringColumn(row, 'task_id'),
    resultId: optionalStringColumn(row, 'result_id'),
    action: stringColumn(row, 'action') as AssistantVersionRecord['action'],
    label: optionalStringColumn(row, 'label'),
    snapshot: readJson<unknown>(column(row, 'snapshot_json')),
    createdAt: numberColumn(row, 'created_at'),
  }
}

function eventFromRow(row: unknown): AssistantEventRecord {
  return {
    id: stringColumn(row, 'id'),
    taskId: stringColumn(row, 'task_id'),
    event: readJson<AssistantEvent>(column(row, 'event_json')),
    createdAt: numberColumn(row, 'created_at'),
  }
}

function projectionSnapshotFromRow(row: unknown): AssistantProjectionSnapshotRecord {
  return {
    id: stringColumn(row, 'id'),
    taskId: stringColumn(row, 'task_id'),
    messages: readJson<unknown[]>(column(row, 'messages_json')),
    createdAt: numberColumn(row, 'created_at'),
  }
}

function sourceSampleFromRow(row: unknown): AssistantSourceSampleRecord {
  return {
    id: stringColumn(row, 'id'),
    taskId: stringColumn(row, 'task_id'),
    sourceKind: stringColumn(row, 'source_kind'),
    descriptor: optionalReadJson<unknown>(column(row, 'descriptor_json')),
    sample: readJson<unknown>(column(row, 'sample_json')),
    warnings: readJson<string[]>(column(row, 'warnings_json')),
    createdAt: numberColumn(row, 'created_at'),
    expiresAt: optionalNumberColumn(row, 'expires_at'),
  }
}

function conversationFromRow(row: unknown): AssistantConversationRecord {
  return {
    id: stringColumn(row, 'id'),
    activeTaskId: optionalStringColumn(row, 'active_task_id'),
    title: optionalStringColumn(row, 'title'),
    status: stringColumn(row, 'status') as AssistantConversationRecord['status'],
    createdAt: numberColumn(row, 'created_at'),
    updatedAt: numberColumn(row, 'updated_at'),
  }
}

function optionalJson(value: unknown): string | null {
  return value === undefined ? null : JSON.stringify(value)
}

function readJson<T>(value: unknown): T {
  if (typeof value !== 'string')
    throw new Error('Expected SQLite JSON column to be a string')
  return JSON.parse(value) as T
}

function optionalReadJson<T>(value: unknown): T | undefined {
  return value === null || value === undefined ? undefined : readJson<T>(value)
}

function column(row: unknown, key: string): SQLiteValue {
  if (!row || typeof row !== 'object' || !(key in row))
    throw new Error(`Missing SQLite column: ${key}`)
  const value = (row as Record<string, unknown>)[key]
  if (typeof value === 'string' || typeof value === 'number' || value === null)
    return value
  throw new Error(`Unsupported SQLite column type: ${key}`)
}

function stringColumn(row: unknown, key: string): string {
  const value = column(row, key)
  if (typeof value !== 'string')
    throw new Error(`Expected SQLite column to be a string: ${key}`)
  return value
}

function optionalStringColumn(row: unknown, key: string): string | undefined {
  const value = column(row, key)
  if (value === null)
    return undefined
  if (typeof value !== 'string')
    throw new Error(`Expected SQLite column to be a string: ${key}`)
  return value
}

function numberColumn(row: unknown, key: string): number {
  const value = column(row, key)
  if (typeof value !== 'number')
    throw new Error(`Expected SQLite column to be a number: ${key}`)
  return value
}

function optionalNumberColumn(row: unknown, key: string): number | undefined {
  const value = column(row, key)
  if (value === null)
    return undefined
  if (typeof value !== 'number')
    throw new Error(`Expected SQLite column to be a number: ${key}`)
  return value
}
