import type { MaterialNode } from '@easyink/schema'
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

  it('never follows inherited containers while reading or writing', () => {
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
  it('returns stable diagnostics for duplicate keys, unsafe paths, and duplicate paths', () => {
    const diagnostics = validatePropertyDescriptors([
      descriptor('font', '/model/typography/fontFamily'),
      descriptor('font', '/model/__proto__/polluted'),
      descriptor('alias', '/model/typography/fontFamily'),
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
      descriptor('placement', '/output/placement'),
    ])).toEqual([])
  })
})
