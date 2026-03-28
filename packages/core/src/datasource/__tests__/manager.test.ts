import type { DataSourceRegistration } from '../types'
import { describe, expect, it } from 'vitest'
import { DataSourceManager } from '../manager'

const orderSource: DataSourceRegistration = {
  name: 'order',
  displayName: '订单数据',
  fields: {
    type: 'object',
    properties: {
      orderNo: { type: 'string', title: '订单号' },
      customer: {
        type: 'object',
        title: '客户信息',
        properties: {
          name: { type: 'string', title: '客户名称' },
          phone: { type: 'string', title: '联系电话' },
        },
      },
      items: {
        type: 'array',
        title: '订单明细',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', title: '商品名称' },
            quantity: { type: 'number', title: '数量' },
            price: { type: 'number', title: '单价' },
          },
        },
      },
    },
  },
}

const companySource: DataSourceRegistration = {
  name: 'company',
  displayName: '公司信息',
  group: 'system',
  fields: {
    type: 'object',
    properties: {
      name: { type: 'string', title: '公司名称' },
      address: { type: 'string', title: '公司地址' },
    },
  },
}

describe('dataSourceManager', () => {
  describe('register', () => {
    it('should register a data source', () => {
      const manager = new DataSourceManager()
      manager.register(orderSource)
      expect(manager.has('order')).toBe(true)
      expect(manager.get('order')).toBe(orderSource)
    })

    it('should throw on duplicate registration', () => {
      const manager = new DataSourceManager()
      manager.register(orderSource)
      expect(() => manager.register(orderSource)).toThrow('already registered')
    })

    it('should emit registered event', () => {
      const manager = new DataSourceManager()
      const events: DataSourceRegistration[] = []
      manager.on('registered', reg => events.push(reg))
      manager.register(orderSource)
      expect(events).toEqual([orderSource])
    })
  })

  describe('unregister', () => {
    it('should unregister a data source', () => {
      const manager = new DataSourceManager()
      manager.register(orderSource)
      manager.unregister('order')
      expect(manager.has('order')).toBe(false)
    })

    it('should throw if not found', () => {
      const manager = new DataSourceManager()
      expect(() => manager.unregister('nonexistent')).toThrow('not registered')
    })

    it('should emit unregistered event', () => {
      const manager = new DataSourceManager()
      manager.register(orderSource)
      const events: string[] = []
      manager.on('unregistered', name => events.push(name))
      manager.unregister('order')
      expect(events).toEqual(['order'])
    })
  })

  describe('list', () => {
    it('should return all registered sources', () => {
      const manager = new DataSourceManager()
      manager.register(orderSource)
      manager.register(companySource)
      expect(manager.list()).toEqual([orderSource, companySource])
    })

    it('should return empty array when none registered', () => {
      const manager = new DataSourceManager()
      expect(manager.list()).toEqual([])
    })
  })

  describe('getFields', () => {
    it('should return flattened fields with paths', () => {
      const manager = new DataSourceManager()
      manager.register(orderSource)
      const fields = manager.getFields('order')

      const paths = fields.map(f => f.path)
      expect(paths).toContain('order')
      expect(paths).toContain('order.orderNo')
      expect(paths).toContain('order.customer')
      expect(paths).toContain('order.customer.name')
      expect(paths).toContain('order.customer.phone')
      expect(paths).toContain('order.items')
      // Array items' properties are also walked
      expect(paths).toContain('order.items.name')
      expect(paths).toContain('order.items.quantity')
      expect(paths).toContain('order.items.price')
    })

    it('should include correct depth levels', () => {
      const manager = new DataSourceManager()
      manager.register(orderSource)
      const fields = manager.getFields('order')

      const orderField = fields.find(f => f.path === 'order')
      expect(orderField?.depth).toBe(0)

      const nameField = fields.find(f => f.path === 'order.customer.name')
      expect(nameField?.depth).toBe(2)
    })

    it('should throw if source not found', () => {
      const manager = new DataSourceManager()
      expect(() => manager.getFields('nonexistent')).toThrow('not registered')
    })
  })

  describe('getAllFields', () => {
    it('should return fields for all sources', () => {
      const manager = new DataSourceManager()
      manager.register(orderSource)
      manager.register(companySource)
      const fields = manager.getAllFields()

      const paths = fields.map(f => f.path)
      expect(paths).toContain('order')
      expect(paths).toContain('order.orderNo')
      expect(paths).toContain('company')
      expect(paths).toContain('company.name')
    })
  })

  describe('resolveFieldSchema', () => {
    it('should resolve a simple field path', () => {
      const manager = new DataSourceManager()
      manager.register(orderSource)

      const schema = manager.resolveFieldSchema('order.orderNo')
      expect(schema?.type).toBe('string')
      expect(schema?.title).toBe('订单号')
    })

    it('should resolve nested object path', () => {
      const manager = new DataSourceManager()
      manager.register(orderSource)

      const schema = manager.resolveFieldSchema('order.customer.name')
      expect(schema?.type).toBe('string')
      expect(schema?.title).toBe('客户名称')
    })

    it('should resolve array item field path', () => {
      const manager = new DataSourceManager()
      manager.register(orderSource)

      const schema = manager.resolveFieldSchema('order.items.name')
      expect(schema?.type).toBe('string')
      expect(schema?.title).toBe('商品名称')
    })

    it('should return undefined for unknown namespace', () => {
      const manager = new DataSourceManager()
      expect(manager.resolveFieldSchema('unknown.field')).toBeUndefined()
    })

    it('should return undefined for invalid path', () => {
      const manager = new DataSourceManager()
      manager.register(orderSource)
      expect(manager.resolveFieldSchema('order.nonexistent')).toBeUndefined()
    })
  })

  describe('off', () => {
    it('should remove event listener', () => {
      const manager = new DataSourceManager()
      const events: string[] = []
      const listener = (reg: DataSourceRegistration) => events.push(reg.name)
      manager.on('registered', listener)
      manager.register(orderSource)
      manager.off('registered', listener)
      manager.register(companySource)
      expect(events).toEqual(['order'])
    })
  })

  describe('clear', () => {
    it('should clear all sources and listeners', () => {
      const manager = new DataSourceManager()
      manager.register(orderSource)
      const events: string[] = []
      manager.on('registered', reg => events.push(reg.name))
      manager.clear()

      expect(manager.list()).toEqual([])
      // Listener was cleared too — registering again should not fire
      manager.register(orderSource)
      expect(events).toEqual([])
    })
  })
})
