import { describe, expect, it, vi } from 'vitest'
import { projectBindings } from './binding-projector'

const mocks = vi.hoisted(() => ({
  formatBindingDisplayValue: vi.fn((value: unknown, _binding: unknown, context: { data?: Record<string, unknown> }) => ({
    value: `${String(value)} / ${String(context.data?.invoiceNo)}`,
    diagnostics: [],
  })),
}))

vi.mock('@easyink/core', () => ({
  formatBindingDisplayValue: mocks.formatBindingDisplayValue,
  hasBindingFormat: () => true,
  resolveBindingValue: (_binding: unknown, data: Record<string, unknown>) => (data.customer as { name: string }).name,
}))

describe('projectBindings', () => {
  it('passes the current runtime data to custom binding formatters', () => {
    mocks.formatBindingDisplayValue.mockClear()
    const data = {
      invoiceNo: 'INV-001',
      customer: { name: 'Ada' },
    }
    const projected = projectBindings({
      id: 'txt-customer',
      type: 'text',
      x: 0,
      y: 0,
      width: 40,
      height: 10,
      modelVersion: 1,
      model: {},
      slots: {},
      bindings: { value: {
        sourceId: 'invoice',
        fieldPath: 'customer/name',
        format: {
          mode: 'custom',
          custom: { source: '(value, data) => value + " / " + data.invoiceNo' },
        },
      } },
      output: { visibility: 'include' },
    }, data)

    expect(projected).toEqual([{
      bindIndex: 0,
      value: 'Ada / INV-001',
      diagnostics: [],
    }])
    expect(mocks.formatBindingDisplayValue).toHaveBeenCalledWith(
      'Ada',
      expect.objectContaining({ fieldPath: 'customer/name' }),
      { data },
    )
  })
})
