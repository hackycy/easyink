import type { DocumentSchema, MaterialNode } from './types'
import { describe, expect, it } from 'vitest'
import { countNodes, findNodeById, traverseNodes } from './traversal'

function makeNode(id: string, children?: MaterialNode[]): MaterialNode {
  return {
    id,
    type: 'test',
    x: 0,
    y: 0,
    width: 100,
    height: 50,
    modelVersion: 1,
    model: {},
    slots: children ? { content: children } : {},
    bindings: {},
    output: { visibility: 'include' },
  }
}

function makeSchema(elements: MaterialNode[]): DocumentSchema {
  return {
    version: '1.0.0',
    unit: 'mm',
    page: { mode: 'fixed', width: 210, height: 297 },
    guides: { x: [], y: [] },
    elements,
  }
}

describe('traverseNodes', () => {
  it('iterates all top-level nodes', () => {
    const schema = makeSchema([makeNode('a'), makeNode('b'), makeNode('c')])
    const visited: string[] = []
    traverseNodes(schema, (node) => {
      visited.push(node.id)
    })
    expect(visited).toEqual(['a', 'b', 'c'])
  })

  it('visits nested children depth-first', () => {
    const schema = makeSchema([
      makeNode('a', [makeNode('a1'), makeNode('a2')]),
      makeNode('b'),
    ])
    const visited: string[] = []
    traverseNodes(schema, (node) => {
      visited.push(node.id)
    })
    expect(visited).toEqual(['a', 'a1', 'a2', 'b'])
  })

  it('stops early when callback returns false', () => {
    const schema = makeSchema([makeNode('a'), makeNode('b'), makeNode('c')])
    const visited: string[] = []
    traverseNodes(schema, (node) => {
      visited.push(node.id)
      if (node.id === 'b')
        return false
    })
    expect(visited).toEqual(['a', 'b'])
  })

  it('walks deeply nested canonical slots without call-stack recursion', () => {
    const root = makeNode('0')
    let owner = root
    for (let index = 1; index <= 5_000; index += 1) {
      const child = makeNode(String(index))
      owner.slots.content = [child]
      owner = child
    }

    expect(countNodes(makeSchema([root]))).toBe(5_001)
  })
})

describe('findNodeById', () => {
  it('finds a top-level node', () => {
    const schema = makeSchema([makeNode('x'), makeNode('y')])
    const found = findNodeById(schema, 'y')
    expect(found).toBeDefined()
    expect(found!.id).toBe('y')
  })

  it('finds a nested node', () => {
    const schema = makeSchema([makeNode('a', [makeNode('deep')])])
    const found = findNodeById(schema, 'deep')
    expect(found).toBeDefined()
    expect(found!.id).toBe('deep')
  })

  it('returns undefined when not found', () => {
    const schema = makeSchema([makeNode('a')])
    expect(findNodeById(schema, 'missing')).toBeUndefined()
  })
})

describe('countNodes', () => {
  it('counts flat elements', () => {
    const schema = makeSchema([makeNode('a'), makeNode('b')])
    expect(countNodes(schema)).toBe(2)
  })

  it('counts nested elements', () => {
    const schema = makeSchema([
      makeNode('a', [makeNode('a1'), makeNode('a2', [makeNode('a2x')])]),
      makeNode('b'),
    ])
    expect(countNodes(schema)).toBe(5)
  })

  it('returns 0 for empty schema', () => {
    const schema = makeSchema([])
    expect(countNodes(schema)).toBe(0)
  })
})
