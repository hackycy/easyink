import type { DataFieldNode } from '@easyink/datasource'
import { describe, expect, it } from 'vitest'
import { dataFieldTreeKey, resolveDataFieldPath } from './field-path'

describe('datasource field path helpers', () => {
  it('derives nested paths and keys when fields do not provide explicit paths', () => {
    const parent: DataFieldNode = { name: 'Customer', key: 'customer' }
    const child: DataFieldNode = { name: 'Name', key: 'name' }

    const parentPath = resolveDataFieldPath(parent)
    expect(parentPath).toBe('customer')
    expect(resolveDataFieldPath(child, parentPath)).toBe('customer/name')
    expect(dataFieldTreeKey('orders', child, parentPath)).toBe('orders:customer/name')
  })

  it('keeps explicit paths authoritative', () => {
    const field: DataFieldNode = { name: 'Name', key: 'name', path: 'buyer/displayName' }

    expect(resolveDataFieldPath(field, 'customer')).toBe('buyer/displayName')
    expect(dataFieldTreeKey('orders', field, 'customer')).toBe('orders:buyer/displayName')
  })
})
