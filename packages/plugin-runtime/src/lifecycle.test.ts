import { describe, expect, it, vi } from 'vitest'
import { createHost } from './index'
import { viewerMaterial } from './test-fixtures/material'

describe('owned lifetimes', () => {
  it('invalidates synchronously, clears the registry, waits for acquired resources and reuses the disposal Promise', async () => {
    const blocked = Promise.withResolvers<void>()
    const host = await createHost({ kind: 'viewer', materials: [viewerMaterial('a')] })
    const resources = host.resources('a')
    const clean = vi.fn(async () => blocked.promise)
    resources.onDispose(clean)
    let reentrant: Promise<unknown> | undefined
    resources.signal.addEventListener('abort', () => {
      reentrant = host.destroy()
    })
    const disposal = host.destroy()
    expect(reentrant).toBe(disposal)
    expect(host.destroy()).toBe(disposal)
    expect(host.state).toBe('disposing')
    expect(host.generation).toBe(1)
    expect(resources.signal.aborted).toBe(true)
    expect(host.registry.materials).toEqual([])
    expect(() => host.resources('a')).toThrow(/disposing/)
    await expect(host.runTask('a', async () => 1)).rejects.toThrow(/disposing/)
    let complete = false
    void disposal.then(() => {
      complete = true
    })
    await Promise.resolve()
    expect(complete).toBe(false)
    blocked.resolve()
    expect(await disposal).toEqual({ errors: [] })
    expect(clean).toHaveBeenCalledOnce()
    expect(host.state).toBe('disposed')
    expect(host.destroy()).toBe(disposal)
  })

  it('stops consumers first, then disposes tasks, scopes and callbacks in reverse order despite errors', async () => {
    const order: string[] = []
    const cause = new Error('a resource')
    const host = await createHost({ kind: 'viewer', materials: [viewerMaterial('a'), viewerMaterial('b')] }, (_registry, context) => {
      context.onDispose(() => {
        order.push('consumer')
      })
    })
    host.resources('a').onDispose(() => {
      order.push('a:first')
    })
    host.resources('a').onDispose(() => {
      order.push('a:last')
      throw cause
    })
    host.resources('b').onDispose(() => {
      order.push('b:first')
    })
    host.resources('b').onDispose(() => {
      order.push('b:last')
    })
    await host.runTask('b', async () => 'resource', () => {
      order.push('b:task')
    })
    const result = await host.destroy()
    expect(order).toEqual(['consumer', 'b:task', 'b:last', 'b:first', 'a:last', 'a:first'])
    expect(result.errors).toMatchObject([{ owner: { pluginId: 'material:a' }, phase: 'scope', cause }])
    expect(host.state).toBe('disposed')
  })

  it('owns runtime resources separately when two Hosts reuse the same declaration', async () => {
    const declaration = Object.freeze(viewerMaterial('shared'))
    const a = await createHost({ kind: 'viewer', materials: [declaration] })
    const b = await createHost({ kind: 'viewer', materials: [declaration] })
    const cleanA = vi.fn()
    const cleanB = vi.fn()
    a.resources('shared').onDispose(cleanA)
    b.resources('shared').onDispose(cleanB)
    expect(a.resources('shared').signal).not.toBe(b.resources('shared').signal)
    expect(() => b.resources(a.registry.getMaterial('shared')!.owner)).toThrow(/not installed/)
    await a.destroy()
    expect(cleanA).toHaveBeenCalledOnce()
    expect(cleanB).not.toHaveBeenCalled()
    expect(b.state).toBe('active')
    expect(b.registry.getMaterial('shared')!.value).toBe(declaration)
    await b.destroy()
    expect(cleanB).toHaveBeenCalledOnce()
  })

  it('does not wait forever for external tasks and releases their late result without publishing it', async () => {
    const external = Promise.withResolvers<{ close: () => void }>()
    const host = await createHost({ kind: 'viewer', materials: [viewerMaterial('lazy')] })
    const close = vi.fn()
    const publish = vi.fn()
    let taskSignal: AbortSignal | undefined
    const task = host.runTask('lazy', async (context) => {
      taskSignal = context.signal
      return external.promise
    }, value => value.close()).then((value) => {
      if (value)
        publish(value)
      return value
    })
    const result = await host.destroy()
    expect(result.errors).toEqual([])
    expect(taskSignal!.aborted).toBe(true)
    expect(close).not.toHaveBeenCalled()
    external.resolve({ close })
    expect(await task).toBeUndefined()
    expect(close).toHaveBeenCalledOnce()
    expect(publish).not.toHaveBeenCalled()
  })

  it('suppresses stale task failures and reports late cleanup errors separately', async () => {
    const external = Promise.withResolvers<void>()
    const acquired = Promise.withResolvers<string>()
    const host = await createHost({ kind: 'viewer', materials: [viewerMaterial('lazy')] })
    const lateCause = new Error('late close')
    const failed = host.runTask('lazy', () => external.promise)
    const late = host.runTask('lazy', () => acquired.promise, () => {
      throw lateCause
    })
    const destruction = await host.destroy()
    external.reject(new Error('late task failure'))
    acquired.resolve('late')
    expect(await failed).toBeUndefined()
    expect(await late).toBeUndefined()
    expect(destruction.errors).toEqual([])
    expect(host.lateCleanupErrors).toMatchObject([{ owner: { pluginId: 'material:lazy', contributionId: 'task:2' }, phase: 'late', cause: lateCause }])
  })

  it('keeps errors from acquired resources in disposal rather than duplicating them as late errors', async () => {
    const pending = Promise.withResolvers<void>()
    const cause = new Error('acquired cleanup')
    const host = await createHost({ kind: 'viewer', materials: [viewerMaterial('lazy')] })
    const task = host.runTask('lazy', async (context) => {
      context.onDispose(() => {
        throw cause
      })
      return pending.promise
    })
    expect((await host.destroy()).errors).toMatchObject([{ cause, phase: 'scope' }])
    pending.reject(new Error('stale'))
    expect(await task).toBeUndefined()
    expect(host.lateCleanupErrors).toEqual([])
  })

  it('cleans resources acquired before a task fails and propagates an active task failure', async () => {
    const host = await createHost({ kind: 'viewer', materials: [viewerMaterial('lazy')] })
    const clean = vi.fn()
    const cause = new Error('load')
    await expect(host.runTask('lazy', async (context) => {
      context.onDispose(clean)
      throw cause
    })).rejects.toBe(cause)
    expect(clean).toHaveBeenCalledOnce()
    expect(host.state).toBe('active')
    await host.destroy()
    expect(clean).toHaveBeenCalledOnce()
  })

  it('releases acquired task resources when disposal happens while acquisition is pending', async () => {
    const host = await createHost({ kind: 'viewer', materials: [viewerMaterial('lazy')] })
    const pending = Promise.withResolvers<string>()
    const early = vi.fn()
    const late = vi.fn()
    const task = host.runTask('lazy', async (context) => {
      context.onDispose(early)
      const result = await pending.promise
      context.onDispose(late)
      return result
    })
    await host.destroy()
    expect(early).toHaveBeenCalledOnce()
    pending.resolve('value')
    expect(await task).toBeUndefined()
    expect(late).toHaveBeenCalledOnce()
    expect(early).toHaveBeenCalledOnce()
  })

  it('preserves task and cleanup causes when releasing a failed task also fails', async () => {
    const host = await createHost({ kind: 'viewer', materials: [viewerMaterial('lazy')] })
    const cause = new Error('load')
    const cleanupCause = new Error('task cleanup')
    await expect(host.runTask('lazy', async (context) => {
      context.onDispose(() => {
        throw cleanupCause
      })
      throw cause
    })).rejects.toMatchObject({ cause, cleanup: { errors: [{ cause: cleanupCause }] } })
    expect(host.lateCleanupErrors).toEqual([])
    await host.destroy()
  })

  it('immediately releases registrations arriving after disposal, including their errors', async () => {
    const host = await createHost({ kind: 'viewer', materials: [viewerMaterial('a')] })
    const context = host.resources('a')
    await host.destroy()
    const clean = vi.fn()
    const cause = new Error('late registration')
    context.onDispose(clean)
    context.onDispose(() => {
      throw cause
    })
    await Promise.resolve()
    expect(clean).toHaveBeenCalledOnce()
    expect(host.lateCleanupErrors).toMatchObject([{ phase: 'late', cause }])
  })
})
