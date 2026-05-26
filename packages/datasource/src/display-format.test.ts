import { describe, expect, it } from 'vitest'
import { findDataFieldNode, getDataFieldCustomFormatTemplates, getDefaultDataFieldCustomFormatTemplate } from './display-format'

describe('data field display format helpers', () => {
  it('finds nested fields by binding metadata', () => {
    const source = {
      id: 'invoice',
      name: 'Invoice',
      fields: [
        {
          name: 'invoice',
          fields: [
            { name: 'date', key: 'invoice.date', path: 'invoice/date', title: 'Date' },
          ],
        },
      ],
    }

    expect(findDataFieldNode(source, { fieldPath: 'invoice/date' })?.name).toBe('date')
    expect(findDataFieldNode(source, { fieldKey: 'invoice.date' })?.name).toBe('date')
  })

  it('filters unusable custom format templates', () => {
    const templates = getDataFieldCustomFormatTemplates({
      name: 'amount',
      path: 'amount',
      displayFormat: {
        customTemplates: [
          { id: 'money', label: 'Money', source: '(value) => String(value)' },
          { id: '', label: 'Missing id', source: '(value) => String(value)' },
          { id: 'empty-source', label: 'Empty source', source: ' ' },
        ],
      },
    })

    expect(templates).toEqual([
      { id: 'money', label: 'Money', source: '(value) => String(value)' },
    ])
  })

  it('prefers the configured default template and falls back to the first usable one', () => {
    const field = {
      name: 'amount',
      path: 'amount',
      displayFormat: {
        defaultCustomTemplateId: 'date',
        customTemplates: [
          { id: 'money', label: 'Money', source: '(value) => String(value)' },
          { id: 'date', label: 'Date', source: '(value) => String(value).slice(0, 10)' },
        ],
      },
    }

    expect(getDefaultDataFieldCustomFormatTemplate(field)?.id).toBe('date')
    expect(getDefaultDataFieldCustomFormatTemplate({
      ...field,
      displayFormat: {
        ...field.displayFormat,
        defaultCustomTemplateId: 'missing',
      },
    })?.id).toBe('money')
  })
})
