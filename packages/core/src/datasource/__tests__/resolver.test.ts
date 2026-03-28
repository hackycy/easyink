import type { RepeatContext } from '../types'
import { describe, expect, it, vi } from 'vitest'
import { DataResolver } from '../resolver'

const sampleData = {
  order: {
    orderNo: 'ORD-001',
    customer: {
      name: '张三',
      phone: '13800138000',
    },
    items: [
      { name: '商品A', quantity: 2, price: 100 },
      { name: '商品B', quantity: 1, price: 50 },
    ],
    total: 250,
  },
  company: {
    name: 'ACME 公司',
    address: '北京市朝阳区',
  },
}

describe('dataResolver', () => {
  describe('resolve', () => {
    it('should resolve simple namespace path', () => {
      const resolver = new DataResolver()
      expect(resolver.resolve('order.orderNo', sampleData)).toBe('ORD-001')
    })

    it('should resolve nested path', () => {
      const resolver = new DataResolver()
      expect(resolver.resolve('order.customer.name', sampleData)).toBe('张三')
    })

    it('should resolve cross-namespace path', () => {
      const resolver = new DataResolver()
      expect(resolver.resolve('company.name', sampleData)).toBe('ACME 公司')
    })

    it('should resolve array by index', () => {
      const resolver = new DataResolver()
      expect(resolver.resolve('order.items[0].name', sampleData)).toBe('商品A')
      expect(resolver.resolve('order.items[1].price', sampleData)).toBe(50)
    })

    it('should return undefined for missing path', () => {
      const resolver = new DataResolver()
      expect(resolver.resolve('order.nonexistent', sampleData)).toBeUndefined()
    })

    it('should return undefined for empty path', () => {
      const resolver = new DataResolver()
      expect(resolver.resolve('', sampleData)).toBeUndefined()
    })

    it('should return undefined for null/undefined in path chain', () => {
      const resolver = new DataResolver()
      expect(resolver.resolve('order.customer.email.domain', sampleData)).toBeUndefined()
    })

    it('should return the whole namespace object', () => {
      const resolver = new DataResolver()
      expect(resolver.resolve('order', sampleData)).toBe(sampleData.order)
    })
  })

  describe('resolve with repeat context', () => {
    const repeatCtx: RepeatContext = {
      item: { name: '商品A', quantity: 2, price: 100 },
      index: 0,
      itemAlias: 'item',
      indexAlias: 'index',
    }

    it('should resolve item alias to current item', () => {
      const resolver = new DataResolver()
      expect(resolver.resolve('item', sampleData, repeatCtx)).toEqual({
        name: '商品A',
        quantity: 2,
        price: 100,
      })
    })

    it('should resolve index alias to current index', () => {
      const resolver = new DataResolver()
      expect(resolver.resolve('index', sampleData, repeatCtx)).toBe(0)
    })

    it('should resolve relative path from item alias', () => {
      const resolver = new DataResolver()
      expect(resolver.resolve('item.name', sampleData, repeatCtx)).toBe('商品A')
      expect(resolver.resolve('item.price', sampleData, repeatCtx)).toBe(100)
    })

    it('should still resolve global paths in repeat context', () => {
      const resolver = new DataResolver()
      expect(resolver.resolve('company.name', sampleData, repeatCtx)).toBe('ACME 公司')
    })

    it('should support custom alias names', () => {
      const resolver = new DataResolver()
      const ctx: RepeatContext = {
        item: { name: 'Test' },
        index: 5,
        itemAlias: 'row',
        indexAlias: 'rowIndex',
      }
      expect(resolver.resolve('row.name', sampleData, ctx)).toBe('Test')
      expect(resolver.resolve('rowIndex', sampleData, ctx)).toBe(5)
    })
  })

  describe('security — prototype pollution prevention', () => {
    it('should block __proto__ access', () => {
      const resolver = new DataResolver()
      const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      expect(resolver.resolve('order.__proto__', sampleData)).toBeUndefined()
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('__proto__'))
      spy.mockRestore()
    })

    it('should block constructor access', () => {
      const resolver = new DataResolver()
      const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      expect(resolver.resolve('order.constructor', sampleData)).toBeUndefined()
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('constructor'))
      spy.mockRestore()
    })

    it('should block prototype access', () => {
      const resolver = new DataResolver()
      const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      expect(resolver.resolve('order.prototype', sampleData)).toBeUndefined()
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('prototype'))
      spy.mockRestore()
    })

    it('should block __proto__ in nested path', () => {
      const resolver = new DataResolver()
      const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      expect(resolver.resolve('order.customer.__proto__.polluted', sampleData)).toBeUndefined()
      spy.mockRestore()
    })
  })

  describe('format', () => {
    it('should format value with registered formatter', () => {
      const resolver = new DataResolver()
      resolver.registerFormatter('uppercase', value => String(value ?? '').toUpperCase())
      expect(resolver.format('hello', { type: 'uppercase' })).toBe('HELLO')
    })

    it('should return string value if formatter not found', () => {
      const resolver = new DataResolver()
      const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      expect(resolver.format(42, { type: 'unknown' })).toBe('42')
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('Unknown formatter'))
      spy.mockRestore()
    })

    it('should return empty string for null value if formatter not found', () => {
      const resolver = new DataResolver()
      const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      expect(resolver.format(null, { type: 'unknown' })).toBe('')
      spy.mockRestore()
    })
  })

  describe('resolveAndFormat', () => {
    it('should resolve and format in one call', () => {
      const resolver = new DataResolver()
      resolver.registerFormatter('uppercase', value => String(value ?? '').toUpperCase())
      const result = resolver.resolveAndFormat('order.orderNo', sampleData, { type: 'uppercase' })
      expect(result).toBe('ORD-001')
    })

    it('should return string value without formatter', () => {
      const resolver = new DataResolver()
      expect(resolver.resolveAndFormat('order.total', sampleData)).toBe('250')
    })

    it('should return empty string for undefined without formatter', () => {
      const resolver = new DataResolver()
      expect(resolver.resolveAndFormat('order.nonexistent', sampleData)).toBe('')
    })
  })

  describe('formatter registration', () => {
    it('should register and unregister formatters', () => {
      const resolver = new DataResolver()
      const fn = (v: unknown) => String(v)
      resolver.registerFormatter('test', fn)
      expect(resolver.hasFormatter('test')).toBe(true)
      resolver.unregisterFormatter('test')
      expect(resolver.hasFormatter('test')).toBe(false)
    })

    it('should clear all formatters', () => {
      const resolver = new DataResolver()
      resolver.registerFormatter('a', v => String(v))
      resolver.registerFormatter('b', v => String(v))
      resolver.clear()
      expect(resolver.hasFormatter('a')).toBe(false)
      expect(resolver.hasFormatter('b')).toBe(false)
    })
  })
})
