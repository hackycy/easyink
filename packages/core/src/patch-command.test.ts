import type { MaterialNode } from '@easyink/schema'
import { describe, expect, it } from 'vitest'
import { applyJsonPatches, PatchCommand } from './patch-command'

describe('applyJsonPatches', () => {
  it('replaces a nested value', () => {
    const obj = { a: { b: 1 } }
    applyJsonPatches(obj, [{ op: 'replace', path: ['a', 'b'], value: 2 }])
    expect(obj.a.b).toBe(2)
  })

  it('adds a new property', () => {
    const obj: Record<string, unknown> = { a: 1 }
    applyJsonPatches(obj, [{ op: 'add', path: ['b'], value: 2 }])
    expect(obj.b).toBe(2)
  })

  it('removes a property', () => {
    const obj: Record<string, unknown> = { a: 1, b: 2 }
    applyJsonPatches(obj, [{ op: 'remove', path: ['b'] }])
    expect(obj.b).toBeUndefined()
    expect('b' in obj).toBe(false)
  })

  it('handles array splice for add', () => {
    const obj = { arr: [1, 2, 3] }
    applyJsonPatches(obj, [{ op: 'add', path: ['arr', 1], value: 99 }])
    expect(obj.arr).toEqual([1, 99, 2, 3])
  })

  it('handles array splice for remove', () => {
    const obj = { arr: [1, 2, 3] }
    applyJsonPatches(obj, [{ op: 'remove', path: ['arr', 1] }])
    expect(obj.arr).toEqual([1, 3])
  })

  it('skips root replacement gracefully', () => {
    const obj = { a: 1 }
    applyJsonPatches(obj, [{ op: 'replace', path: [], value: { b: 2 } }])
    expect(obj.a).toBe(1)
  })

  it('skips if path navigates through null', () => {
    const obj = { a: null as unknown }
    applyJsonPatches(obj, [{ op: 'replace', path: ['a', 'b'], value: 2 }])
    expect(obj.a).toBeNull()
  })
})

describe('patchCommand', () => {
  function makeNode(): MaterialNode {
    return { id: 'n1', type: 'test', x: 0, y: 0, width: 100, height: 50, props: { color: 'red' } } as MaterialNode
  }

  it('executes patches forward', () => {
    const node = makeNode()
    const cmd = new PatchCommand(
      () => node,
      [{ op: 'replace', path: ['props', 'color'], value: 'blue' }],
      [{ op: 'replace', path: ['props', 'color'], value: 'red' }],
    )
    cmd.execute()
    expect(node.props.color).toBe('blue')
  })

  it('undoes patches', () => {
    const node = makeNode()
    const cmd = new PatchCommand(
      () => node,
      [{ op: 'replace', path: ['props', 'color'], value: 'blue' }],
      [{ op: 'replace', path: ['props', 'color'], value: 'red' }],
    )
    cmd.execute()
    cmd.undo()
    expect(node.props.color).toBe('red')
  })

  it('merges commands with same mergeKey within window', () => {
    const node = makeNode()
    const cmd1 = new PatchCommand(
      () => node,
      [{ op: 'replace', path: ['width'], value: 110 }],
      [{ op: 'replace', path: ['width'], value: 100 }],
      { mergeKey: 'resize' },
    )
    const cmd2 = new PatchCommand(
      () => node,
      [{ op: 'replace', path: ['width'], value: 120 }],
      [{ op: 'replace', path: ['width'], value: 110 }],
      { mergeKey: 'resize' },
    )
    // Same timestamp window
    cmd2.createdAt = cmd1.createdAt + 100

    const merged = cmd1.merge(cmd2)
    expect(merged).not.toBeNull()
  })

  it('does not merge commands with different mergeKeys', () => {
    const node = makeNode()
    const cmd1 = new PatchCommand(
      () => node,
      [{ op: 'replace', path: ['width'], value: 110 }],
      [{ op: 'replace', path: ['width'], value: 100 }],
      { mergeKey: 'resize-w' },
    )
    const cmd2 = new PatchCommand(
      () => node,
      [{ op: 'replace', path: ['height'], value: 60 }],
      [{ op: 'replace', path: ['height'], value: 50 }],
      { mergeKey: 'resize-h' },
    )
    expect(cmd1.merge(cmd2)).toBeNull()
  })

  it('does not merge when outside time window', () => {
    const node = makeNode()
    const cmd1 = new PatchCommand(
      () => node,
      [{ op: 'replace', path: ['width'], value: 110 }],
      [{ op: 'replace', path: ['width'], value: 100 }],
      { mergeKey: 'resize', mergeWindowMs: 200 },
    )
    const cmd2 = new PatchCommand(
      () => node,
      [{ op: 'replace', path: ['width'], value: 120 }],
      [{ op: 'replace', path: ['width'], value: 110 }],
      { mergeKey: 'resize' },
    )
    cmd2.createdAt = cmd1.createdAt + 500
    expect(cmd1.merge(cmd2)).toBeNull()
  })

  it('does not merge without mergeKey', () => {
    const node = makeNode()
    const cmd1 = new PatchCommand(
      () => node,
      [{ op: 'replace', path: ['width'], value: 110 }],
      [{ op: 'replace', path: ['width'], value: 100 }],
    )
    const cmd2 = new PatchCommand(
      () => node,
      [{ op: 'replace', path: ['width'], value: 120 }],
      [{ op: 'replace', path: ['width'], value: 110 }],
    )
    expect(cmd1.merge(cmd2)).toBeNull()
  })

  it('merged command executes all patches and undoes in reverse', () => {
    const node = makeNode()
    const cmd1 = new PatchCommand(
      () => node,
      [{ op: 'replace', path: ['width'], value: 110 }],
      [{ op: 'replace', path: ['width'], value: 100 }],
      { mergeKey: 'resize' },
    )
    const cmd2 = new PatchCommand(
      () => node,
      [{ op: 'replace', path: ['width'], value: 120 }],
      [{ op: 'replace', path: ['width'], value: 110 }],
      { mergeKey: 'resize' },
    )
    cmd2.createdAt = cmd1.createdAt

    const merged = cmd1.merge(cmd2)!
    merged.execute()
    expect(node.width).toBe(120)

    merged.undo()
    expect(node.width).toBe(100)
  })
})
