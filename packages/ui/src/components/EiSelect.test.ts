/**
 * @vitest-environment happy-dom
 */
import { afterEach, describe, expect, it } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import EiSelect from './EiSelect.vue'

afterEach(() => {
  document.body.innerHTML = ''
})

describe('ei select', () => {
  it('expands the dropdown to its single-line content within the viewport', async () => {
    const mounted = mountSelect()
    mounted.anchor.getBoundingClientRect = () => ({
      width: 120,
      height: 27,
      top: 10,
      right: 130,
      bottom: 37,
      left: 10,
      x: 10,
      y: 10,
      toJSON: () => ({}),
    })

    mounted.trigger.click()
    await nextTick()
    await nextTick()
    await nextTick()

    const dropdown = document.body.querySelector<HTMLElement>('.ei-select__dropdown')
    expect(dropdown?.style.width).toBe('max-content')
    expect(dropdown?.style.minWidth).toBe('120px')
    expect(dropdown?.style.maxWidth).toBe('calc(100vw - 16px)')
    expect(dropdown?.querySelectorAll('.ei-select__option')[1]?.getAttribute('title')).toBe('A long single-line option label')

    mounted.unmount()
  })

  it('keeps an explicit dropdown width override', async () => {
    const mounted = mountSelect(240)
    mounted.trigger.click()
    await nextTick()

    const dropdown = document.body.querySelector<HTMLElement>('.ei-select__dropdown')
    expect(dropdown?.style.width).toBe('240px')

    mounted.unmount()
  })
})

function mountSelect(dropdownWidth?: number) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const app = createApp({
    render() {
      return h(EiSelect, {
        modelValue: 'short',
        dropdownWidth,
        options: [
          { label: 'Short', value: 'short' },
          { label: 'A long single-line option label', value: 'long' },
        ],
      })
    },
  })
  app.mount(host)

  const trigger = host.querySelector<HTMLElement>('.ei-select__trigger')
  const anchor = host.querySelector<HTMLElement>('.ei-select-wrapper')
  if (!trigger || !anchor)
    throw new Error('Select trigger was not mounted')

  return {
    anchor,
    trigger,
    unmount() {
      app.unmount()
    },
  }
}
