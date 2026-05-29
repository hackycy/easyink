import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { FileAssistantStore } from './file-store'

describe('fileAssistantStore', () => {
  it('persists tasks, projections, source samples, and imports debug snapshots', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'easyink-assistant-store-'))
    try {
      const store = new FileAssistantStore(dir)
      const task = await store.createTask({ prompt: '生成小票' })
      await store.saveProjectionSnapshot({
        taskId: task.id,
        messages: [{ kind: 'text', text: task.input.prompt }],
      })
      await store.saveSourceSample({
        taskId: task.id,
        sourceKind: 'json',
        sample: { total: 10 },
        warnings: [],
        expiresAt: Date.now() - 1,
      })

      const reloaded = new FileAssistantStore(dir)
      expect(await reloaded.getTask(task.id)).toMatchObject({ id: task.id })
      expect(await reloaded.getLatestProjectionSnapshot(task.id)).toMatchObject({ taskId: task.id })
      expect(await reloaded.cleanupExpired()).toBe(1)

      const imported = new FileAssistantStore(join(dir, 'imported'))
      await imported.importSnapshot(await reloaded.exportSnapshot())
      expect(await imported.getTask(task.id)).toMatchObject({ id: task.id })
    }
    finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
