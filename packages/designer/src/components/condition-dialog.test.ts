/**
 * @vitest-environment happy-dom
 */
import type { DataSourceDescriptor } from '@easyink/datasource'
import type { RenderCondition } from '@easyink/schema'
import { afterEach, describe, expect, it } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import ConditionDialog from './ConditionDialog.vue'
import ConditionFieldPicker from './ConditionFieldPicker.vue'

const sources: DataSourceDescriptor[] = [{
  id: 'orders',
  name: 'Orders',
  fields: [
    { name: 'Customer', path: 'customer/name' },
    {
      name: 'Items',
      path: 'items',
      tag: 'collection',
      fields: [
        { name: 'Price', path: 'items/price', meta: { type: 'number' } },
        { name: 'Stock', path: 'items/stock', meta: { type: 'number' } },
      ],
    },
  ],
}, {
  id: 'catalog',
  name: 'Catalog',
  fields: [{
    name: 'Items',
    path: 'items',
    tag: 'collection',
    fields: [{ name: 'Name', path: 'items/name' }],
  }],
}]

const condition: RenderCondition = {
  whenMatched: 'show',
  whenHidden: 'remove',
  onUnknown: 'show',
  groups: [{ conditions: [{ source: { path: 'customer/name', fieldLabel: 'Name' }, operator: 'eq', valueType: 'string', value: { kind: 'literal', value: 'Ada' } }] }],
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('condition dialog', () => {
  it('renders the table workflow and supports adding groups and copying rows', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const app = createApp({
      render: () => h(ConditionDialog, {
        open: true,
        condition,
        capability: { scope: 'node', hiddenEffects: ['remove', 'reserve'] },
        sources,
        t: (key: string) => key.split('.').pop()!,
      }),
    })
    app.mount(host)
    await nextTick()

    expect(document.body.querySelectorAll('.condition-group')).toHaveLength(1)
    expect(document.body.querySelectorAll('.condition-group__table th')).toHaveLength(5)

    button('.condition-group__actions button').click()
    await nextTick()
    expect(document.body.querySelectorAll('.condition-group tbody tr')).toHaveLength(2)

    button('.condition-dialog__add-group').click()
    await nextTick()
    expect(document.body.querySelectorAll('.condition-group')).toHaveLength(2)
    app.unmount()
  })
})

describe('condition field picker', () => {
  it('selects a root field by click', async () => {
    const selected: unknown[] = []
    const host = document.createElement('div')
    document.body.appendChild(host)
    const app = createApp({
      render: () => h(ConditionFieldPicker, {
        sources,
        t: (key: string) => key.split('.').pop()!,
        onSelect: (value: unknown) => selected.push(value),
      }),
    })
    app.mount(host)
    button('.condition-field-picker__trigger').click()
    await nextTick()
    const nodes = Array.from(document.body.querySelectorAll<HTMLElement>('.ei-tree__node'))
    const customerNode = nodes.find(node => node.textContent?.includes('Customer'))
    expect(customerNode).toBeTruthy()
    customerNode!.click()
    await nextTick()
    expect(selected[0]).toMatchObject({ scope: 'root', path: 'customer/name', fieldLabel: 'Customer' })
    app.unmount()
  })

  it('selects collection child fields as item paths with inferred collection scope', async () => {
    const selected: unknown[] = []
    const host = document.createElement('div')
    document.body.appendChild(host)
    const app = createApp({
      render: () => h(ConditionFieldPicker, {
        sources,
        t: (key: string) => key.split('.').pop()!,
        onSelect: (value: unknown) => selected.push(value),
      }),
    })
    app.mount(host)
    button('.condition-field-picker__trigger').click()
    await nextTick()
    const nodes = Array.from(document.body.querySelectorAll<HTMLElement>('.ei-tree__node'))
    const priceNode = nodes.find(node => node.textContent?.includes('Price'))
    expect(priceNode).toBeTruthy()
    priceNode!.click()
    await nextTick()
    expect(selected[0]).toMatchObject({
      scope: 'item',
      path: 'price',
      fieldLabel: 'Price',
      collectionScope: { kind: 'collection', path: 'items', quantifier: 'any', sourceId: 'orders', fieldLabel: 'Items' },
    })
    app.unmount()
  })
})

function button(selector: string): HTMLButtonElement {
  const element = document.body.querySelector<HTMLButtonElement>(selector)
  if (!element)
    throw new Error(`Missing button: ${selector}`)
  return element
}
