import type { PropSchema } from '@easyink/core'
import { describe, expect, it } from 'vitest'
import { createApp, h } from 'vue'
import { EiColorPicker } from '../components/EiColorPicker'
import { EiInput } from '../components/EiInput'
import { EiNumberInput } from '../components/EiNumberInput'
import { EiPropForm } from '../components/EiPropForm'
import { EiSelect } from '../components/EiSelect'
import { EiSlider } from '../components/EiSlider'
import { EiSwitch } from '../components/EiSwitch'

function mount(component: any, props: Record<string, any> = {}) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const app = createApp({ render: () => h(component, props) })
  app.mount(container)
  return {
    app,
    container,
    unmount: () => {
      app.unmount()
      container.remove()
    },
  }
}

describe('eiInput', () => {
  it('renders text input', () => {
    const { container, unmount } = mount(EiInput, { modelValue: 'hello' })
    const input = container.querySelector('input') as HTMLInputElement
    expect(input).toBeTruthy()
    expect(input.type).toBe('text')
    expect(input.value).toBe('hello')
    unmount()
  })

  it('applies maxLength', () => {
    const { container, unmount } = mount(EiInput, { maxLength: 10, modelValue: '' })
    const input = container.querySelector('input') as HTMLInputElement
    expect(input.maxLength).toBe(10)
    unmount()
  })

  it('applies disabled state', () => {
    const { container, unmount } = mount(EiInput, { disabled: true, modelValue: '' })
    const input = container.querySelector('input') as HTMLInputElement
    expect(input.disabled).toBe(true)
    unmount()
  })

  it('shows error class for invalid pattern', () => {
    const { container, unmount } = mount(EiInput, { modelValue: 'abc', pattern: '^\\d+$' })
    const input = container.querySelector('input') as HTMLInputElement
    expect(input.classList.contains('ei-input--error')).toBe(true)
    unmount()
  })

  it('no error class for valid pattern', () => {
    const { container, unmount } = mount(EiInput, { modelValue: '123', pattern: '^\\d+$' })
    const input = container.querySelector('input') as HTMLInputElement
    expect(input.classList.contains('ei-input--error')).toBe(false)
    unmount()
  })
})

describe('eiNumberInput', () => {
  it('renders number input with value', () => {
    const { container, unmount } = mount(EiNumberInput, { modelValue: 42 })
    const input = container.querySelector('input[type="number"]') as HTMLInputElement
    expect(input).toBeTruthy()
    expect(input.value).toBe('42')
    unmount()
  })

  it('renders up/down buttons', () => {
    const { container, unmount } = mount(EiNumberInput, { modelValue: 5 })
    const buttons = container.querySelectorAll('.ei-number-input__btn')
    expect(buttons.length).toBe(2)
    unmount()
  })

  it('applies min/max/step', () => {
    const { container, unmount } = mount(EiNumberInput, { max: 10, min: 0, modelValue: 5, step: 2 })
    const input = container.querySelector('input[type="number"]') as HTMLInputElement
    expect(input.min).toBe('0')
    expect(input.max).toBe('10')
    expect(input.step).toBe('2')
    unmount()
  })
})

describe('eiSelect', () => {
  it('renders select with options', () => {
    const options = [
      { label: 'Red', value: 'red' },
      { label: 'Blue', value: 'blue' },
    ]
    const { container, unmount } = mount(EiSelect, { modelValue: 'red', options })
    const select = container.querySelector('select') as HTMLSelectElement
    expect(select).toBeTruthy()
    const optionEls = select.querySelectorAll('option')
    expect(optionEls.length).toBe(2)
    expect(optionEls[0].textContent).toBe('Red')
    expect(optionEls[1].textContent).toBe('Blue')
    unmount()
  })

  it('renders placeholder option', () => {
    const options = [{ label: 'A', value: 'a' }]
    const { container, unmount } = mount(EiSelect, { modelValue: '', options, placeholder: 'Choose...' })
    const optionEls = container.querySelectorAll('option')
    expect(optionEls[0].textContent).toBe('Choose...')
    expect(optionEls[0].disabled).toBe(true)
    unmount()
  })
})

describe('eiSwitch', () => {
  it('renders checkbox for switch', () => {
    const { container, unmount } = mount(EiSwitch, { modelValue: true })
    const input = container.querySelector('.ei-switch__input') as HTMLInputElement
    expect(input).toBeTruthy()
    expect(input.checked).toBe(true)
    unmount()
  })

  it('renders unchecked state', () => {
    const { container, unmount } = mount(EiSwitch, { modelValue: false })
    const input = container.querySelector('.ei-switch__input') as HTMLInputElement
    expect(input.checked).toBe(false)
    unmount()
  })
})

describe('eiColorPicker', () => {
  it('renders color swatch and text input', () => {
    const { container, unmount } = mount(EiColorPicker, { modelValue: '#ff0000' })
    const swatch = container.querySelector('.ei-color-picker__swatch') as HTMLInputElement
    const text = container.querySelector('.ei-color-picker__text') as HTMLInputElement
    expect(swatch).toBeTruthy()
    expect(swatch.type).toBe('color')
    expect(swatch.value).toBe('#ff0000')
    expect(text).toBeTruthy()
    expect(text.value).toBe('#ff0000')
    unmount()
  })
})

describe('eiSlider', () => {
  it('renders range input with value display', () => {
    const { container, unmount } = mount(EiSlider, { max: 100, min: 0, modelValue: 50 })
    const input = container.querySelector('input[type="range"]') as HTMLInputElement
    const value = container.querySelector('.ei-slider__value')
    expect(input).toBeTruthy()
    expect(input.value).toBe('50')
    expect(value?.textContent).toBe('50')
    unmount()
  })

  it('shows decimal values for fractional steps', () => {
    const { container, unmount } = mount(EiSlider, { max: 1, min: 0, modelValue: 0.5, step: 0.1 })
    const value = container.querySelector('.ei-slider__value')
    expect(value?.textContent).toBe('0.5')
    unmount()
  })
})

describe('eiPropForm', () => {
  it('renders form fields from schemas', () => {
    const schemas: PropSchema[] = [
      { key: 'name', label: 'Name', type: 'string' },
      { key: 'age', label: 'Age', type: 'number' },
    ]
    const { container, unmount } = mount(EiPropForm, {
      modelValue: { age: 25, name: 'Test' },
      schemas,
    })
    const rows = container.querySelectorAll('.ei-prop-form__row')
    expect(rows.length).toBe(2)
    const labels = container.querySelectorAll('.ei-prop-form__label')
    expect(labels[0].textContent).toBe('Name')
    expect(labels[1].textContent).toBe('Age')
    unmount()
  })

  it('hides fields where visible returns false', () => {
    const schemas: PropSchema[] = [
      { key: 'show', label: 'Show', type: 'boolean' },
      { key: 'detail', label: 'Detail', type: 'string', visible: (props: Record<string, unknown>) => props.show === true },
    ]
    const { container, unmount } = mount(EiPropForm, {
      modelValue: { detail: 'hidden', show: false },
      schemas,
    })
    const rows = container.querySelectorAll('.ei-prop-form__row')
    expect(rows.length).toBe(1)
    unmount()
  })

  it('renders groups with headers', () => {
    const schemas: PropSchema[] = [
      { group: 'Basic', key: 'name', label: 'Name', type: 'string' },
      { group: 'Advanced', key: 'id', label: 'ID', type: 'string' },
    ]
    const { container, unmount } = mount(EiPropForm, {
      modelValue: { id: '1', name: 'Test' },
      schemas,
    })
    const headers = container.querySelectorAll('.ei-prop-form__group-header')
    expect(headers.length).toBe(2)
    expect(headers[0].textContent?.trim()).toContain('Basic')
    expect(headers[1].textContent?.trim()).toContain('Advanced')
    unmount()
  })

  it('renders boolean fields as switch', () => {
    const schemas: PropSchema[] = [
      { key: 'enabled', label: 'Enabled', type: 'boolean' },
    ]
    const { container, unmount } = mount(EiPropForm, {
      modelValue: { enabled: true },
      schemas,
    })
    const switchEl = container.querySelector('.ei-switch')
    expect(switchEl).toBeTruthy()
    unmount()
  })

  it('renders color fields as color picker', () => {
    const schemas: PropSchema[] = [
      { key: 'color', label: 'Color', type: 'color' },
    ]
    const { container, unmount } = mount(EiPropForm, {
      modelValue: { color: '#ff0000' },
      schemas,
    })
    const picker = container.querySelector('.ei-color-picker')
    expect(picker).toBeTruthy()
    unmount()
  })

  it('renders select fields with enum options', () => {
    const schemas: PropSchema[] = [
      {
        enum: [{ label: 'Left', value: 'left' }, { label: 'Right', value: 'right' }],
        key: 'align',
        label: 'Align',
        type: 'select',
      },
    ]
    const { container, unmount } = mount(EiPropForm, {
      modelValue: { align: 'left' },
      schemas,
    })
    const select = container.querySelector('select')
    expect(select).toBeTruthy()
    const options = select?.querySelectorAll('option')
    expect(options?.length).toBe(2)
    unmount()
  })

  it('single default group renders without header', () => {
    const schemas: PropSchema[] = [
      { key: 'name', label: 'Name', type: 'string' },
    ]
    const { container, unmount } = mount(EiPropForm, {
      modelValue: { name: 'Test' },
      schemas,
    })
    const headers = container.querySelectorAll('.ei-prop-form__group-header')
    expect(headers.length).toBe(0)
    unmount()
  })
})
