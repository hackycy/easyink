/**
 * @vitest-environment happy-dom
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import EiDialog from './EiDialog.vue'

afterEach(() => {
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

describe('ei dialog', () => {
  it('applies external attributes to the dialog panel without Vue inheritance warnings', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const host = document.createElement('div')
    document.body.appendChild(host)
    const app = createApp({
      render() {
        return h(EiDialog, {
          'open': true,
          'class': 'custom-dialog',
          'data-testid': 'dialog',
        }, () => 'Dialog body')
      },
    })

    app.mount(host)
    await nextTick()

    const dialog = document.body.querySelector<HTMLElement>('[data-testid="dialog"]')
    expect(dialog).not.toBeNull()
    expect(dialog?.classList.contains('ei-dialog')).toBe(true)
    expect(dialog?.classList.contains('custom-dialog')).toBe(true)
    expect(warn).not.toHaveBeenCalledWith(expect.stringContaining('Extraneous non-props attributes'))

    app.unmount()
  })
})
