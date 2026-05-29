import { describe, expect, it } from 'vitest'
import { applyAssistantPatch, diffAssistantSchema, selectAssistantPatchOperations, selectAssistantPatchOperationsForElements } from './patch'

describe('assistant patch capabilities', () => {
  it('applies object and array JSON patch operations without mutating input', () => {
    const schema = {
      version: '1',
      unit: 'mm',
      page: { mode: 'fixed', width: 80, height: 120 },
      elements: [{ id: 'title', type: 'text' }],
    }

    const next = applyAssistantPatch(schema, [
      { op: 'replace', path: '/page/height', value: 160 },
      { op: 'add', path: '/elements/1', value: { id: 'total', type: 'text' } },
    ])

    expect(next.page).toMatchObject({ height: 160 })
    expect(next.elements).toHaveLength(2)
    expect(schema.page.height).toBe(120)
  })

  it('diffs element additions as local patch operations', () => {
    const current = {
      version: '1',
      unit: 'mm',
      page: { mode: 'fixed', width: 80, height: 120 },
      elements: [{ id: 'title', type: 'text' }],
    }
    const next = {
      ...current,
      elements: [...current.elements, { id: 'total', type: 'text' }],
    }

    const diff = diffAssistantSchema(current as never, next as never)

    expect(diff.operations).toContainEqual({ op: 'add', path: '/elements/1', value: { id: 'total', type: 'text' } })
  })

  it('selects add-only and selected-element patch subsets', () => {
    const schema = {
      version: '1',
      unit: 'mm',
      page: { mode: 'fixed', width: 80, height: 120 },
      guides: { groups: [] },
      elements: [
        { id: 'title', type: 'text', x: 0, y: 0, width: 10, height: 4, props: {} },
        { id: 'total', type: 'text', x: 0, y: 8, width: 10, height: 4, props: {} },
      ],
    }
    const operations = [
      { op: 'replace' as const, path: '/elements/0', value: { ...schema.elements[0], props: { text: 'New' } } },
      { op: 'replace' as const, path: '/elements/1', value: { ...schema.elements[1], props: { text: 'Total' } } },
      { op: 'add' as const, path: '/elements/2', value: { id: 'footer', type: 'text' } },
    ]

    expect(selectAssistantPatchOperations(operations, 'new-elements')).toEqual([operations[2]])
    expect(selectAssistantPatchOperationsForElements(operations, schema as never, ['total'])).toEqual([operations[1]])
  })
})
