import type { MaterialNode } from '@easyink/schema'
import { create } from 'mutative'
import { describe, expect, it, vi } from 'vitest'
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

function sharedDescriptor(key: string, path: `/${string}`, pathSharingGroup: string) {
  const value = descriptor(key, path)
  return {
    ...value,
    accessor: { ...value.accessor, pathSharingGroup },
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

  it('composes sibling missing-path writes in one Mutative transaction', () => {
    const original = nodeWithModel({})

    const [next] = create(original, (draft) => {
      createModelPropertyAccessor<string>('/typography/fontFamily').write(draft, 'Inter')
      createModelPropertyAccessor<number>('/typography/fontSize').write(draft, 12)
    }, { enablePatches: true })

    expect(next.model).toEqual({ typography: { fontFamily: 'Inter', fontSize: 12 } })
    expect(original.model).toEqual({})
  })

  it('never executes own or inherited accessors while writing', () => {
    let getterCalls = 0
    let setterCalls = 0
    const ownAccessorModel: Record<string, unknown> = {}
    Object.defineProperty(ownAccessorModel, 'value', {
      configurable: true,
      get: () => {
        getterCalls++
        return 'unsafe'
      },
    })
    const inheritedAccessorModel = Object.create({
      get value() { return undefined },
      set value(_value: unknown) {
        setterCalls++
      },
    }) as Record<string, unknown>
    const accessor = createModelPropertyAccessor<string>('/value')

    expect(accessor.read(nodeWithModel(ownAccessorModel))).toBeUndefined()
    expect(() => accessor.write(nodeWithModel(ownAccessorModel), 'next'))
      .toThrowError('PROPERTY_ACCESSOR_ACCESSOR_FORBIDDEN')
    expect(() => accessor.write(nodeWithModel(inheritedAccessorModel), 'next'))
      .toThrowError('PROPERTY_ACCESSOR_ACCESSOR_FORBIDDEN')
    expect({ getterCalls, setterCalls }).toEqual({ getterCalls: 0, setterCalls: 0 })
  })

  it('rejects non-writable, frozen, and non-extensible write targets', () => {
    const nonWritable: Record<string, unknown> = {}
    Object.defineProperty(nonWritable, 'value', { enumerable: true, value: 'fixed', writable: false })
    const valueAccessor = createModelPropertyAccessor<string>('/value')
    expect(() => valueAccessor.write(nodeWithModel(nonWritable), 'next'))
      .toThrowError('PROPERTY_ACCESSOR_WRITE_FORBIDDEN')

    const frozen = Object.freeze({ nested: { value: 'fixed' } })
    expect(() => createModelPropertyAccessor<string>('/nested/value').write(nodeWithModel(frozen), 'next'))
      .toThrowError('PROPERTY_ACCESSOR_CONTAINER_FROZEN')

    const sealed = Object.preventExtensions<Record<string, unknown>>({ existing: true })
    expect(() => valueAccessor.write(nodeWithModel(sealed), 'next'))
      .toThrowError('PROPERTY_ACCESSOR_CONTAINER_NOT_EXTENSIBLE')
  })

  it('rejects accessors on Mutative drafts without triggering side effects', () => {
    let setterCalls = 0
    const model: Record<string, unknown> = {}
    Object.defineProperty(model, 'value', {
      configurable: true,
      enumerable: true,
      get: () => undefined,
      set: () => { setterCalls++ },
    })
    const node = nodeWithModel(model)

    expect(() => create(node, (draft) => {
      createModelPropertyAccessor<string>('/value').write(draft, 'next')
    }, { enablePatches: true })).toThrowError('PROPERTY_ACCESSOR_ACCESSOR_FORBIDDEN')

    const inherited = nodeWithModel(Object.create({
      get value() { return undefined },
      set value(_value: unknown) { setterCalls++ },
    }) as Record<string, unknown>)
    expect(() => create(inherited, (draft) => {
      createModelPropertyAccessor<string>('/value').write(draft, 'next')
    }, { enablePatches: true })).toThrowError('PROPERTY_ACCESSOR_ACCESSOR_FORBIDDEN')
    expect(setterCalls).toBe(0)
  })

  it('reads, writes, and appends canonical array indices', () => {
    const existing = createModelPropertyAccessor<string>('/rows/0/name')
    const append = createModelPropertyAccessor<string>('/rows/1/name')
    const original = nodeWithModel({ rows: [{ name: 'first' }] })

    const [next, patches] = create(original, (draft) => {
      existing.write(draft, 'updated')
      append.write(draft, 'second')
    }, { enablePatches: true })

    expect(original.model).toEqual({ rows: [{ name: 'first' }] })
    expect(next.model).toEqual({ rows: [{ name: 'updated' }, { name: 'second' }] })
    expect(patches.every(patch => patch.path[0] === 'model' && patch.path[1] === 'rows')).toBe(true)
  })

  it('infers nested arrays from following numeric tokens', () => {
    const accessor = createModelPropertyAccessor<string>('/matrix/0/0')
    const original = nodeWithModel({})

    const [next, patches] = create(original, (draft) => {
      accessor.write(draft, 'cell')
    }, { enablePatches: true })

    expect(original.model).toEqual({})
    expect(next.model).toEqual({ matrix: [['cell']] })
    expect(patches).toEqual([{ op: 'add', path: ['model', 'matrix'], value: [['cell']] }])
  })

  it.each(['/rows/01/name', '/rows/-/name', '/rows/name', '/rows/2/name'])(
    'rejects invalid or sparse contextual array path %s',
    (path) => {
      const node = nodeWithModel({ rows: [{ name: 'first' }] })
      expect(() => createModelPropertyAccessor(path as `/${string}`).write(node, 'next')).toThrowError(
        path === '/rows/2/name' ? 'PROPERTY_ACCESSOR_ARRAY_GAP_FORBIDDEN' : 'PROPERTY_ACCESSOR_ARRAY_INDEX_INVALID',
      )
      expect(node.model).toEqual({ rows: [{ name: 'first' }] })
    },
  )

  it('rejects sparse array writes on a Mutative draft without changing the original', () => {
    const original = nodeWithModel({ rows: [{ name: 'first' }] })

    expect(() => create(original, (draft) => {
      createModelPropertyAccessor<string>('/rows/2/name').write(draft, 'third')
    }, { enablePatches: true })).toThrowError('PROPERTY_ACCESSOR_ARRAY_GAP_FORBIDDEN')
    expect(original.model).toEqual({ rows: [{ name: 'first' }] })
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

  it.each(['', '/__proto__/polluted', '/constructor/value', '/bad~2token'])(
    'rejects malformed, root, or unsafe model path %j',
    (path) => {
      expect(() => createModelPropertyAccessor(path as `/${string}`)).toThrowError(
        path.includes('__proto__') || path.includes('constructor')
          ? 'PROPERTY_ACCESSOR_PATH_UNSAFE'
          : 'PROPERTY_ACCESSOR_PATH_INVALID',
      )
    },
  )

  it('treats slash as the empty model member rather than the document root', () => {
    const accessor = createModelPropertyAccessor<string>('/')
    const node = nodeWithModel({ '': 'before' })

    expect(accessor.paths).toEqual(['/model/'])
    accessor.write(node, 'after')
    expect(node.model).toEqual({ '': 'after' })
  })

  it('never follows inherited containers while reading', () => {
    const accessor = createModelPropertyAccessor<string>('/typography/fontFamily')
    const node = nodeWithModel(Object.create({ typography: { fontFamily: 'inherited' } }) as Record<string, unknown>)

    expect(accessor.read(node)).toBeUndefined()
    accessor.write(node, 'owned')
    expect(Object.hasOwn(node.model, 'typography')).toBe(true)
    expect(accessor.read(node)).toBe('owned')
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
      sharedDescriptor('break.before', '/output/break', 'output.break'),
      sharedDescriptor('break.after', '/output/break', 'output.break'),
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

  it('rejects unequal explicit ancestor and descendant paths', () => {
    expect(validatePropertyDescriptors([
      descriptor('typography', '/model/typography'),
      descriptor('font', '/model/typography/fontFamily'),
    ])).toContainEqual(expect.objectContaining({
      code: 'PROPERTY_ACCESSOR_PATH_CONFLICT',
      descriptorKey: 'font',
    }))
  })

  it('requires matching sharing groups for exact explicit composite paths', () => {
    expect(validatePropertyDescriptors([
      descriptor('break.before', '/output/break'),
      descriptor('break.after', '/output/break'),
    ])).toContainEqual(expect.objectContaining({ code: 'PROPERTY_ACCESSOR_PATH_DUPLICATE' }))
  })

  it('validates numeric ranges and property value input metadata', () => {
    const diagnostics = validatePropertyDescriptors([
      { key: 'size', label: 'Size', type: 'number', min: 10, max: 1, step: 0 },
      {
        key: 'asset',
        label: 'Asset',
        type: 'string',
        editorOptions: { valueInput: { kind: 'asset-url', id: '', source: 'picker', accept: [1] } },
      },
      {
        key: 'file',
        label: 'File',
        type: 'string',
        editorOptions: { valueInput: { kind: 'text-file', id: 'file', source: 'picker', maxBytes: 0 } },
      },
    ])

    expect(diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'PROPERTY_DESCRIPTOR_INVALID', descriptorKey: 'size' }),
      expect.objectContaining({ code: 'PROPERTY_EDITOR_METADATA_INVALID', descriptorKey: 'asset' }),
      expect.objectContaining({ code: 'PROPERTY_EDITOR_METADATA_INVALID', descriptorKey: 'file' }),
    ]))
  })

  it('accepts complete property value input variants', () => {
    expect(validatePropertyDescriptors([
      {
        key: 'asset',
        label: 'Asset',
        type: 'string',
        editorOptions: { valueInput: { kind: 'asset-url', id: 'asset', source: 'picker', accept: ['image/png'] } },
      },
      {
        key: 'file',
        label: 'File',
        type: 'string',
        editorOptions: { valueInput: { kind: 'text-file', id: 'file', source: 'picker', encoding: 'utf-8', maxBytes: 1024 } },
      },
    ])).toEqual([])
  })

  it('keeps path collision comparisons sub-quadratic for 32k descriptors', () => {
    const compare = vi.spyOn(String.prototype, 'localeCompare')
    const descriptors = Array.from({ length: 32_768 }, (_, index) =>
      descriptor(`field-${index}`, `/model/fields/${index}`))
    try {
      expect(validatePropertyDescriptors(descriptors)).toEqual([])
      expect(compare.mock.calls.length).toBeGreaterThan(0)
      expect(compare.mock.calls.length).toBeLessThan(32_768 * 20)
    }
    finally {
      compare.mockRestore()
    }
  })
})
