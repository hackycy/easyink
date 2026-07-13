import { describe, expect, it } from 'vitest'
import { RenderTaskCoordinator } from './render-task'

describe('renderTaskCoordinator', () => {
  it('begins with a positive current generation', () => {
    const tasks = new RenderTaskCoordinator()

    const task = tasks.begin()

    expect(task.generation).toBe(1)
    expect(Number.isSafeInteger(task.generation)).toBe(true)
    expect(tasks.isCurrent(task.generation)).toBe(true)
    expect(task.signal.aborted).toBe(false)
  })

  it('supersedes the previous generation exactly once', () => {
    const tasks = new RenderTaskCoordinator()
    const first = tasks.begin()
    let firstAbortEvents = 0
    first.signal.addEventListener('abort', () => firstAbortEvents++)

    const second = tasks.begin()
    const third = tasks.begin()

    expect(first.signal.aborted).toBe(true)
    expect(first.signal.reason).toBe('superseded')
    expect(firstAbortEvents).toBe(1)
    expect(second.generation).toBe(2)
    expect(third.generation).toBe(3)
    expect(tasks.isCurrent(first.generation)).toBe(false)
    expect(tasks.isCurrent(second.generation)).toBe(false)
    expect(tasks.isCurrent(third.generation)).toBe(true)
  })

  it('returns a frozen token without freezing or exposing control of its signal', () => {
    const tasks = new RenderTaskCoordinator()

    const task = tasks.begin()

    expect(Object.isFrozen(task)).toBe(true)
    expect(Object.isFrozen(task.signal)).toBe(false)
    expect('abort' in task.signal).toBe(false)
    expect(Reflect.set(task, 'generation', 99)).toBe(false)
    expect(task.generation).toBe(1)
  })

  it('disposes the current generation once and rejects every later begin', () => {
    const tasks = new RenderTaskCoordinator()
    const staleTask = tasks.begin()
    const task = tasks.begin()
    let abortEvents = 0
    task.signal.addEventListener('abort', () => abortEvents++)

    tasks.dispose()
    tasks.dispose()

    expect(task.signal.aborted).toBe(true)
    expect(task.signal.reason).toBe('disposed')
    expect(abortEvents).toBe(1)
    expect(tasks.isCurrent(staleTask.generation)).toBe(false)
    expect(tasks.isCurrent(task.generation)).toBe(false)
    expect(tasks.isCurrent(0)).toBe(false)
    expect(tasks.isCurrent(Number.MAX_SAFE_INTEGER)).toBe(false)
    expect(() => tasks.begin()).toThrowError('RenderTaskCoordinator is disposed')
    expect(() => tasks.begin()).toThrowError('RenderTaskCoordinator is disposed')
  })

  it('preserves the final current token after generation exhaustion', () => {
    const tasks = new RenderTaskCoordinator()
    expect(Reflect.set(tasks, 'generation', Number.MAX_SAFE_INTEGER - 1)).toBe(true)
    const finalTask = tasks.begin()
    let abortEvents = 0
    finalTask.signal.addEventListener('abort', () => abortEvents++)

    expect(finalTask.generation).toBe(Number.MAX_SAFE_INTEGER)
    expect(tasks.isCurrent(finalTask.generation)).toBe(true)
    expect(() => tasks.begin()).toThrowError('RENDER_TASK_GENERATION_EXHAUSTED')
    expect(() => tasks.begin()).toThrowError('RENDER_TASK_GENERATION_EXHAUSTED')
    expect(finalTask.signal.aborted).toBe(false)
    expect(abortEvents).toBe(0)
    expect(tasks.isCurrent(finalTask.generation)).toBe(true)
    expect(tasks.isCurrent(Number.MAX_SAFE_INTEGER + 1)).toBe(false)
  })
})
