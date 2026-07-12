import type { ViewerElementTree, ViewerRenderTree } from '@easyink/core'
import type { MaterialNode, TableTopologySchema } from '@easyink/schema'
import type { TableModel } from './model'
import { describe, expect, it } from 'vitest'
import { TABLE_BASE_DEFAULTS } from './types'
import { renderTableTree } from './viewer-tree'

describe('table viewer DOM identities', () => {
  it('encodes canonical and repeated source identities injectively and stably', () => {
    const node = createNode()
    const topology: TableTopologySchema = {
      columns: [{ ratio: 1 }, { ratio: 1 }],
      rows: [
        { role: 'header', height: 5, cells: [{ content: { text: 'A' } }, { content: { text: 'B' } }] },
        { role: 'normal', height: 5, cells: [{ content: { text: '1' } }, { content: { text: '2' } }] },
        { role: 'normal', height: 5, cells: [{ content: { text: '3' } }, { content: { text: '4' } }] },
      ],
    }
    const options = {
      node,
      topology,
      props: TABLE_BASE_DEFAULTS,
      unit: 'mm',
      elementHeight: 15,
      canonicalRowIds: ['row:a:b', 'row:a_b', 'row:a_b'],
      canonicalColumnIds: ['column:a:b', 'column:a_b'],
      sourceRowKeys: ['row:a:b', 'source:a/b~中', 'source_a_b__'],
      cellText: () => '',
    } as const

    const first = renderTableTree(options)
    const second = renderTableTree(options)
    expect(second).toEqual(first)

    const elements = findElements(first, ['tr', 'th', 'td'])
    const ids = elements.map(element => String(element.attributes.id))
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids.every(id => /^[a-z][a-z0-9-]*$/i.test(id))).toBe(true)

    const headerIds = findElements(first, ['th']).map(element => String(element.attributes.id))
    expect(headerIds).toHaveLength(2)
    const bodyCells = findElements(first, ['td'])
    expect(bodyCells).toHaveLength(4)
    bodyCells.forEach((cell, index) => {
      expect(cell.attributes.headers).toBe(headerIds[index % headerIds.length])
    })
  })

  it.each(['', 'x'.repeat(257)])('rejects invalid DOM identity component %j', (sourceRowKey) => {
    const node = createNode()
    expect(() => renderTableTree({
      node,
      topology: { columns: [{ ratio: 1 }, { ratio: 1 }], rows: [{ role: 'header', height: 5, cells: [{}, {}] }] },
      props: TABLE_BASE_DEFAULTS,
      unit: 'mm',
      elementHeight: 5,
      canonicalRowIds: ['row:a:b'],
      canonicalColumnIds: ['column:a:b', 'column:a_b'],
      sourceRowKeys: [sourceRowKey],
      cellText: () => '',
    })).toThrowError('TABLE_VIEWER_DOM_ID_COMPONENT_INVALID')
  })

  it.each(['\uD800', '\uD801', '\uDC00'])('rejects unpaired UTF-16 surrogate %j', (sourceRowKey) => {
    expect(() => renderWithSourceKeys(['row:a:b', sourceRowKey, 'valid']))
      .toThrowError('TABLE_VIEWER_DOM_ID_COMPONENT_INVALID')
  })

  it('keeps U+FFFD and a valid surrogate pair distinct and stable', () => {
    const first = renderWithSourceKeys(['row:a:b', '\uFFFD', '\u{1F600}'])
    const second = renderWithSourceKeys(['row:a:b', '\uFFFD', '\u{1F600}'])
    expect(second).toEqual(first)
    const rowIds = findElements(first, ['tr']).map(row => row.attributes.id)
    expect(rowIds).toHaveLength(3)
    expect(new Set(rowIds).size).toBe(3)
  })
})

function renderWithSourceKeys(sourceRowKeys: readonly [string, string, string]): ViewerRenderTree {
  return renderTableTree({
    node: createNode(),
    topology: {
      columns: [{ ratio: 1 }, { ratio: 1 }],
      rows: [
        { role: 'header', height: 5, cells: [{}, {}] },
        { role: 'normal', height: 5, cells: [{}, {}] },
        { role: 'normal', height: 5, cells: [{}, {}] },
      ],
    },
    props: TABLE_BASE_DEFAULTS,
    unit: 'mm',
    elementHeight: 15,
    canonicalRowIds: ['row:a:b', 'row:a_b', 'row:a_b'],
    canonicalColumnIds: ['column:a:b', 'column:a_b'],
    sourceRowKeys,
    cellText: () => '',
  })
}

function createNode(): MaterialNode<unknown> {
  const model: TableModel = {
    kind: 'static',
    columns: [
      { id: 'column:a:b' as never, track: { kind: 'fr', weight: 1 } },
      { id: 'column:a_b' as never, track: { kind: 'fr', weight: 1 } },
    ],
    bands: [
      {
        id: 'band:header' as never,
        role: 'header',
        rows: [{
          id: 'row:a:b' as never,
          minHeight: 5,
          cells: [
            { id: 'cell:a:b' as never, columnId: 'column:a:b' as never, content: { kind: 'text', text: 'A' } },
            { id: 'cell:a_b' as never, columnId: 'column:a_b' as never, content: { kind: 'text', text: 'B' } },
          ],
        }],
      },
      {
        id: 'band:body' as never,
        role: 'body',
        rows: [{
          id: 'row:a_b' as never,
          minHeight: 5,
          cells: [
            { id: 'detail:a:b' as never, columnId: 'column:a:b' as never, content: { kind: 'text', text: '' } },
            { id: 'detail:a_b' as never, columnId: 'column:a_b' as never, content: { kind: 'text', text: '' } },
          ],
        }],
      },
    ],
    merges: [],
    style: {},
  }
  return {
    id: 'table:a_b',
    type: 'table-static',
    x: 0,
    y: 0,
    width: 100,
    height: 15,
    modelVersion: 1,
    model,
    slots: {},
    bindings: {},
    output: { visibility: 'include' },
  }
}

function findElements(tree: ViewerRenderTree, tags: readonly string[]): ViewerElementTree[] {
  if (tree.kind !== 'element')
    return []
  return [
    ...(tags.includes(tree.tag) ? [tree] : []),
    ...tree.children.flatMap(child => findElements(child, tags)),
  ]
}
