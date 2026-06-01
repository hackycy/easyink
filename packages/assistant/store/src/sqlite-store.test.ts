// @vitest-environment node

import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SQLiteAssistantStore } from './sqlite-store'

describe('sqliteAssistantStore', () => {
  it('persists normalized records, events, conversations, and debug snapshots', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'easyink-assistant-sqlite-store-'))
    try {
      const store = new SQLiteAssistantStore(dir)
      const task = await store.createTask({ prompt: '生成小票' })
      await store.upsertConversation({
        id: 'assistant.panel',
        activeTaskId: task.id,
        title: task.input.prompt,
        status: 'running',
      })
      await store.appendEvent(task.id, { type: 'step.started', taskId: task.id, step: 'intake' })
      await store.saveProjectionSnapshot({
        taskId: task.id,
        messages: [{ kind: 'text', text: task.input.prompt }],
      })
      await store.saveSourceSample({
        taskId: task.id,
        sourceKind: 'json',
        descriptor: { fields: ['total'] },
        sample: { total: 10 },
        warnings: [],
        expiresAt: Date.now() - 1,
      })
      store.close()

      const reloaded = new SQLiteAssistantStore(dir)
      expect(await reloaded.getTask(task.id)).toMatchObject({ id: task.id })
      expect(await reloaded.getConversation('assistant.panel')).toMatchObject({ activeTaskId: task.id })
      expect((await reloaded.listEvents(task.id)).map(record => record.event.type)).toEqual(['task.created', 'step.started'])
      expect(await reloaded.getLatestProjectionSnapshot(task.id)).toMatchObject({ taskId: task.id })
      expect(await reloaded.cleanupExpired()).toBe(1)

      const imported = new SQLiteAssistantStore(join(dir, 'imported'))
      await imported.importSnapshot(await reloaded.exportSnapshot())
      expect(await imported.getTask(task.id)).toMatchObject({ id: task.id })
      expect(await imported.getConversation('assistant.panel')).toMatchObject({ activeTaskId: task.id })
      reloaded.close()
      imported.close()
    }
    finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
