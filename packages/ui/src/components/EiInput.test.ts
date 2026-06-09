/**
 * @vitest-environment happy-dom
 */
import { afterEach, describe, expect, it } from 'vitest'
import { createApp, h, nextTick, ref } from 'vue'
import EiInput from './EiInput.vue'

afterEach(() => {
  document.body.innerHTML = ''
})

describe('ei input', () => {
  it('handles single grapheme emoji input with component maxLength logic', async () => {
    const mounted = mountInput({ maxLength: 1 })
    const input = mounted.input
    const shootingStar = String.fromCodePoint(0x1F320)

    expect(input.hasAttribute('maxlength')).toBe(false)

    input.value = shootingStar
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await nextTick()

    expect(input.value).toBe(shootingStar)
    expect(mounted.value.value).toBe(shootingStar)

    mounted.unmount()
  })

  it('waits for composition to end before applying maxLength', async () => {
    const mounted = mountInput({ maxLength: 1 })
    const input = mounted.input

    input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }))
    input.value = 'ni'
    input.dispatchEvent(new InputEvent('input', { bubbles: true }))
    await nextTick()

    expect(input.value).toBe('ni')
    expect(mounted.value.value).toBe('')

    input.value = '\u4F60'
    input.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }))
    await nextTick()

    expect(input.value).toBe('\u4F60')
    expect(mounted.value.value).toBe('\u4F60')

    mounted.unmount()
  })

  it('truncates pasted text by user-perceived characters', async () => {
    const mounted = mountInput({ maxLength: 1 })
    const input = mounted.input

    input.value = `${String.fromCodePoint(0x1F320)}a`
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await nextTick()

    expect(input.value).toBe(String.fromCodePoint(0x1F320))
    expect(mounted.value.value).toBe(String.fromCodePoint(0x1F320))

    mounted.unmount()
  })
})

function mountInput(props: { maxLength?: number, minLength?: number } = {}) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const value = ref('')
  const app = createApp({
    render() {
      return h(EiInput, {
        ...props,
        'modelValue': value.value,
        'onUpdate:modelValue': (next: string | number) => {
          value.value = String(next)
        },
      })
    },
  })

  app.mount(host)

  const input = host.querySelector('input')
  if (!input)
    throw new Error('Input was not mounted')

  return {
    input,
    value,
    unmount() {
      app.unmount()
    },
  }
}
