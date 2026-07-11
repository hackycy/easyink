import type { MaterialNode } from '@easyink/schema'
import { create } from 'mutative'
import { describe, expect, it } from 'vitest'
import {
  createModelPropertyAccessor,
  resolvePropertyAccessor,
  validatePropertyDescriptors,
} from './material-properties'

function nodeWithModel(model: Record<string, unknown>): MaterialNode {
  return {
    id: 'node-1',
    type: 'text',
    x: 0,
    y: 0,
    width: 100,
    height: 20,
    modelVersion: 1,
    model,
    slots: {},
    bindings: {},
    output: { visibility: 'include' },
  }
}

function descriptor(key: string, path: `/${string}`) {
  return {
    key,
    label: key,
    type: 'string' as const,
    accessor: {
      paths: Object.freeze([path]),
      read: () => undefined,
      write: () => undefined,
    },
  }
}

describe('property accessor', () => {
  it('reads and writes a nested model path without owning transaction behavior', () => {
    const accessor = createModelPropertyAccessor<string>('/typography/fontFamily')
    const node = nodeWithModel({ typography: { fontFamily: 'Inter' } })

    expect(accessor.read(node)).toBe('Inter')
    accessor.write(node, 'Noto Sans')

    expect(node.model).toEqual({ typography: { fontFamily: 'Noto Sans' } })
    expect(accessor.paths).toEqual(['/model/typography/fontFamily'])
    expect(Object.isFrozen(accessor.paths)).toBe(true)
  })

  it('creates missing model containers and returns undefined for a missing value', () => {
    const accessor = createModelPropertyAccessor<number>('/typography/size')
    const node = nodeWithModel({})

    expect(accessor.read(node)).toBeUndefined()
    accessor.write(node, 12)

    expect(node.model).toEqual({ typography: { size: 12 } })
  })

  it('writes existing paths through a Mutative draft and emits a nested patch', () => {
    const accessor = createModelPropertyAccessor<string>('/typography/fontFamily')
    const original = nodeWithModel({ typography: { fontFamily: 'Inter', fontSize: 12 } })

    const [next, patches] = create(original, (draft) => {
      accessor.write(draft, 'Noto Sans')
    }, { enablePatches: true })

    expect(original.model).toEqual({ typography: { fontFamily: 'Inter', fontSize: 12 } })
    expect(next.model).toEqual({ typography: { fontFamily: 'Noto Sans', fontSize: 12 } })
    expect(patches).toEqual([
      { op: 'replace', path: ['model', 'typography', 'fontFamily'], value: 'Noto Sans' },
    ])
  })

  it('creates missing paths through a Mutative draft without mutating the original', () => {
    const accessor = createModelPropertyAccessor<number>('/typography/fontSize')
    const original = nodeWithModel({ text: 'Label' })

    const [next, patches] = create(original, (draft) => {
      accessor.write(draft, 12)
    }, { enablePatches: true })

    expect(original.model).toEqual({ text: 'Label' })
    expect(next.model).toEqual({ text: 'Label', typography: { fontSize: 12 } })
    expect(patches).toEqual([
      { op: 'add', path: ['model', 'typography'], value: { fontSize: 12 } },
    ])
  })

  it('uses RFC 6901 escaping for model keys and default descriptor accessors', () => {
    const explicit = createModelPropertyAccessor<string>('/a~1b/~0value')
    const fallback = resolvePropertyAccessor({ key: 'a/b', label: 'Value', type: 'string' })
    const node = nodeWithModel({ 'a/b': { '~value': 'nested' } })

    expect(explicit.read(node)).toBe('nested')
    expect(fallback.paths).toEqual(['/model/a~1b'])
    fallback.write(node, 'flat')
    expect(node.model['a/b']).toBe('flat')
  })

  it.each(['', '/', '/__proto__/polluted', '/constructor/value', '/bad~2token'])(
    'rejects malformed, root, or unsafe model path %j',
    (path) => {
      expect(() => createModelPropertyAccessor(path as `/${string}`)).toThrowError(
        path.includes('__proto__') || path.includes('constructor')
          ? 'PROPERTY_ACCESSOR_PATH_UNSAFE'
          : 'PROPERTY_ACCESSOR_PATH_INVALID',
      )
    },
  )

  it('never follows inherited containers and rejects non-plain writable roots', () => {
    const accessor = createModelPropertyAccessor<string>('/typography/fontFamily')
    const node = nodeWithModel(Object.create({ typography: { fontFamily: 'inherited' } }) as Record<string, unknown>)

    expect(accessor.read(node)).toBeUndefined()
    expect(() => accessor.write(node, 'owned')).toThrowError('PROPERTY_ACCESSOR_CONTAINER_INVALID')

    expect(Object.hasOwn(node.model, 'typography')).toBe(false)
    expect(accessor.read(node)).toBeUndefined()
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })
})

describe('validatePropertyDescriptors', () => {
  it('returns stable diagnostics for duplicate keys, unsafe paths, and repeated paths in one accessor', () => {
    const diagnostics = validatePropertyDescriptors([
      descriptor('font', '/model/typography/fontFamily'),
      descriptor('font', '/model/__proto__/polluted'),
      {
        ...descriptor('alias', '/model/typography/fontFamily'),
        accessor: {
          ...descriptor('alias', '/model/typography/fontFamily').accessor,
          paths: Object.freeze(['/model/typography/fontFamily', '/model/typography/fontFamily'] as const),
        },
      },
    ])

    expect(diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'PROPERTY_KEY_DUPLICATE', descriptorKey: 'font' }),
      expect.objectContaining({ code: 'PROPERTY_ACCESSOR_PATH_UNSAFE', descriptorKey: 'font' }),
      expect.objectContaining({ code: 'PROPERTY_ACCESSOR_PATH_DUPLICATE', descriptorKey: 'alias' }),
    ]))
  })

  it('validates descriptor metadata, accessor functions, and frozen canonical path declarations', () => {
    const diagnostics = validatePropertyDescriptors([
      { key: '', label: '', type: 'invalid' as never, editor: '', editorOptions: [] as never },
      {
        key: 'broken',
        label: 'Broken',
        type: 'string',
        accessor: {
          paths: ['/model/value', '/model/value'] as `/${string}`[],
          read: undefined as never,
          write: 'side effect' as never,
        },
      },
      descriptor('malformed', '/model/bad~2token'),
    ])

    expect(diagnostics.map(item => item.code)).toEqual(expect.arrayContaining([
      'PROPERTY_DESCRIPTOR_INVALID',
      'PROPERTY_EDITOR_METADATA_INVALID',
      'PROPERTY_ACCESSOR_INVALID',
      'PROPERTY_ACCESSOR_PATHS_NOT_FROZEN',
      'PROPERTY_ACCESSOR_PATH_DUPLICATE',
      'PROPERTY_ACCESSOR_PATH_INVALID',
    ]))
  })

  it('accepts nonempty canonical frozen path declarations', () => {
    expect(validatePropertyDescriptors([
      descriptor('font', '/model/typography/fontFamily'),
      descriptor('break.before', '/output/break'),
      descriptor('break.after', '/output/break'),
    ])).toEqual([])
  })

  it.each(['constructor', '__proto__', 'prototype'])(
    'diagnoses an unsafe implicit accessor for default key %s',
    (key) => {
      expect(validatePropertyDescriptors([{ key, label: key, type: 'string' }])).toContainEqual(
        expect.objectContaining({ code: 'PROPERTY_ACCESSOR_PATH_UNSAFE', descriptorKey: key }),
      )
    },
  )

  it('rejects an implicit scalar accessor colliding with an explicit path', () => {
    expect(validatePropertyDescriptors([
      { key: 'title', label: 'Title', type: 'string' },
      descriptor('title-alias', '/model/title'),
    ])).toContainEqual(expect.objectContaining({
      code: 'PROPERTY_ACCESSOR_PATH_DUPLICATE',
      descriptorKey: 'title-alias',
      path: '/model/title',
    }))
  })

  it('rejects an explicit descendant of an implicit scalar accessor', () => {
    expect(validatePropertyDescriptors([
      { key: 'typography', label: 'Typography', type: 'object' },
      descriptor('font', '/model/typography/fontFamily'),
    ])).toContainEqual(expect.objectContaining({
      code: 'PROPERTY_ACCESSOR_PATH_CONFLICT',
      descriptorKey: 'font',
      path: '/model/typography/fontFamily',
    }))
  })

  it('tracks duplicate implicit paths as accessor collisions', () => {
    expect(validatePropertyDescriptors([
      { key: 'title', label: 'Title', type: 'string' },
      { key: 'title', label: 'Duplicate title', type: 'string' },
    ])).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'PROPERTY_KEY_DUPLICATE', descriptorKey: 'title' }),
      expect.objectContaining({ code: 'PROPERTY_ACCESSOR_PATH_DUPLICATE', descriptorKey: 'title', path: '/model/title' }),
    ]))
  })
})
