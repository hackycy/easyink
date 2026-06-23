/**
 * @vitest-environment happy-dom
 */
import type { DataSourceDescriptor } from '@easyink/datasource'
import type { RenderCondition } from '@easyink/schema'
import { afterEach, describe, expect, it } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import ConditionDialog from './ConditionDialog.vue'
import ConditionFieldPicker from './ConditionFieldPicker.vue'
import ConditionValueCell from './ConditionValueCell.vue'

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
  groups: [{ conditions: [{ source: { path: 'customer/name', fieldLabel: 'Name' }, operator: { compare: 'eq' }, valueType: 'string', value: { kind: 'literal', value: 'Ada' } }] }],
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('condition dialog', () => {
  it('does not create a default condition group or row until the user adds them', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const app = createApp({
      render: () => h(ConditionDialog, {
        open: true,
        condition: { whenMatched: 'show', groups: [] },
        capability: { scope: 'node', hiddenEffects: ['remove', 'reserve'] },
        sources,
        t: (key: string) => key.split('.').pop()!,
      }),
    })
    app.mount(host)
    await nextTick()

    expect(document.body.querySelectorAll('.condition-group')).toHaveLength(0)
    expect(document.body.querySelector('.condition-dialog__empty')).toBeTruthy()

    button('.condition-dialog__empty button').click()
    await nextTick()
    expect(document.body.querySelectorAll('.condition-group')).toHaveLength(1)
    expect(document.body.querySelectorAll('.condition-group tbody tr')).toHaveLength(1)
    expect(document.body.querySelector('.condition-group__empty')).toBeTruthy()
    expect(document.body.querySelector('.condition-group__empty-cell')?.getAttribute('colspan')).toBe('5')

    button('.condition-group__empty button').click()
    await nextTick()
    expect(document.body.querySelectorAll('.condition-group tbody tr')).toHaveLength(1)
    app.unmount()
  })

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
    expect(document.body.querySelector('.condition-group__add')).toBeFalsy()
    expect(document.body.querySelector('.condition-group__header-actions .condition-dialog__add-action')).toBeTruthy()

    button('.condition-group__actions button').click()
    await nextTick()
    expect(document.body.querySelectorAll('.condition-group tbody tr')).toHaveLength(2)

    button('.condition-dialog__add-group').click()
    await nextTick()
    expect(document.body.querySelectorAll('.condition-group')).toHaveLength(2)
    app.unmount()
  })

  it('keeps an empty condition group after deleting its last row', async () => {
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

    const deleteButtons = Array.from(document.body.querySelectorAll<HTMLButtonElement>('.condition-group__actions button'))
    deleteButtons[1]!.click()
    await nextTick()

    expect(document.body.querySelectorAll('.condition-group')).toHaveLength(1)
    expect(document.body.querySelector('.condition-dialog__empty')).toBeFalsy()
    expect(document.body.querySelector('.condition-group__empty')).toBeTruthy()
    expect(document.body.querySelector('.condition-dialog__add-group')).toBeTruthy()
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
    expect(document.body.textContent).not.toContain('collectionTag')
    expect(document.body.textContent).toContain('customer/name')
    const nodes = Array.from(document.body.querySelectorAll<HTMLElement>('.ei-field-node__row'))
    const customerNode = nodes.find(node => node.textContent?.includes('Customer'))
    expect(customerNode).toBeTruthy()
    customerNode!.click()
    await nextTick()
    expect(selected[0]).toMatchObject({ path: 'customer/name', fieldLabel: 'Customer' })
    app.unmount()
  })

  it('selects collection child fields as full paths', async () => {
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
    expect(document.body.textContent).toContain('items/price')
    const nodes = Array.from(document.body.querySelectorAll<HTMLElement>('.ei-field-node__row'))
    const priceNode = nodes.find(node => node.textContent?.includes('Price'))
    expect(priceNode).toBeTruthy()
    priceNode!.click()
    await nextTick()
    expect(selected[0]).toMatchObject({
      path: 'items/price',
      fieldLabel: 'Price',
    })
    app.unmount()
  })

  it('derives full paths for nested fields without explicit paths', async () => {
    const selected: unknown[] = []
    const host = document.createElement('div')
    document.body.appendChild(host)
    const nestedSources: DataSourceDescriptor[] = [{
      id: 'orders',
      name: 'Orders',
      fields: [{
        name: 'Customer',
        key: 'customer',
        fields: [{ name: 'Name', key: 'name' }],
      }],
    }]
    const app = createApp({
      render: () => h(ConditionFieldPicker, {
        sources: nestedSources,
        t: (key: string) => key.split('.').pop()!,
        onSelect: (value: unknown) => selected.push(value),
      }),
    })
    app.mount(host)
    button('.condition-field-picker__trigger').click()
    await nextTick()

    expect(document.body.textContent).toContain('customer/name')
    const nameNode = Array.from(document.body.querySelectorAll<HTMLElement>('.ei-field-node__row')).find(node => node.textContent?.includes('Name'))
    expect(nameNode).toBeTruthy()
    nameNode!.click()
    await nextTick()

    expect(selected[0]).toMatchObject({ path: 'customer/name', fieldLabel: 'Name' })
    app.unmount()
  })

  it('allows filtered tree nodes to be collapsed while searching', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const app = createApp({
      render: () => h(ConditionFieldPicker, {
        sources,
        t: (key: string) => key.split('.').pop()!,
      }),
    })
    app.mount(host)
    button('.condition-field-picker__trigger').click()
    await nextTick()

    const input = document.body.querySelector<HTMLInputElement>('.condition-field-picker__search input')
    expect(input).toBeTruthy()
    input!.value = 'price'
    input!.dispatchEvent(new Event('input'))
    await nextTick()

    expect(document.body.textContent).toContain('Price')
    const itemsNode = Array.from(document.body.querySelectorAll<HTMLElement>('.ei-field-node__row')).find(node => node.textContent?.includes('Items'))
    expect(itemsNode).toBeTruthy()
    itemsNode!.click()
    await nextTick()

    expect(document.body.textContent).not.toContain('Price')
    app.unmount()
  })
})

describe('condition value cell', () => {
  it('displays boolean string literals using the runtime cast semantics', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const app = createApp({
      render: () => h(ConditionValueCell, {
        row: {
          source: { path: 'enabled' },
          operator: { compare: 'eq' },
          valueType: 'boolean',
          value: { kind: 'literal', value: 'true' },
        },
        t: (key: string) => key.endsWith('booleanTrue') ? 'true' : key.endsWith('booleanFalse') ? 'false' : key.split('.').pop()!,
      }),
    })
    app.mount(host)
    await nextTick()

    expect(document.body.querySelector('.ei-select__value')?.textContent?.trim()).toBe('true')
    app.unmount()
  })
})

function button(selector: string): HTMLButtonElement {
  const element = document.body.querySelector<HTMLButtonElement>(selector)
  if (!element)
    throw new Error(`Missing button: ${selector}`)
  return element
}
