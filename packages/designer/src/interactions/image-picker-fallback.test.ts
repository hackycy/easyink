import { describe, expect, it, vi } from 'vitest'
import { pickImageWithFileInput, readImageFileAsDataUrl } from './image-picker-fallback'

describe('image picker fallback', () => {
  it('opens the native picker and resolves null on cancel', async () => {
    const original = HTMLInputElement.prototype.showPicker
    const showPicker = vi.fn(function (this: HTMLInputElement) {
      this.dispatchEvent(new Event('cancel'))
    })
    Object.defineProperty(HTMLInputElement.prototype, 'showPicker', {
      configurable: true,
      value: showPicker,
    })

    try {
      await expect(pickImageWithFileInput({
        id: 'designer.imageMaterial.pickImage',
        source: 'image-material',
      })).resolves.toBeNull()
      expect(showPicker).toHaveBeenCalledTimes(1)
      expect(document.querySelector('input[type="file"]')).toBeNull()
    }
    finally {
      if (original) {
        Object.defineProperty(HTMLInputElement.prototype, 'showPicker', {
          configurable: true,
          value: original,
        })
      }
      else {
        delete (HTMLInputElement.prototype as { showPicker?: () => void }).showPicker
      }
    }
  })

  it('reads selected image files as data URL results', async () => {
    const file = new File(['hello'], 'sample.png', { type: 'image/png' })
    let onload: null | ((event: Event) => void) = null
    const image = {
      naturalWidth: 320,
      naturalHeight: 180,
      get src() {
        return ''
      },
      set src(_value: string) {
        onload?.(new Event('load'))
      },
      get onload() {
        return onload
      },
      set onload(value: null | ((event: Event) => void)) {
        onload = value
      },
      onerror: null as null | ((event: Event) => void),
    } as unknown as HTMLImageElement

    const result = await readImageFileAsDataUrl(file, {
      createImage: () => image,
    })

    expect(result.name).toBe('sample.png')
    expect(result.width).toBe(320)
    expect(result.height).toBe(180)
    expect(result.src).toMatch(/^data:image\/png;base64,/)
  })

  it('still returns src when image size probing fails', async () => {
    const file = new File(['hello'], 'sample.png', { type: 'image/png' })
    let onerror: null | ((event: Event) => void) = null
    const image = {
      naturalWidth: 0,
      naturalHeight: 0,
      get src() {
        return ''
      },
      set src(_value: string) {
        onerror?.(new Event('error'))
      },
      onload: null as null | ((event: Event) => void),
      get onerror() {
        return onerror
      },
      set onerror(value: null | ((event: Event) => void)) {
        onerror = value
      },
    } as unknown as HTMLImageElement

    const result = await readImageFileAsDataUrl(file, {
      createImage: () => image,
    })

    expect(result.src).toMatch(/^data:image\/png;base64,/)
    expect(result.width).toBeUndefined()
    expect(result.height).toBeUndefined()
  })

  it('rejects file reader errors', async () => {
    const file = new File(['hello'], 'sample.png', { type: 'image/png' })
    const reader = {
      result: null,
      error: new Error('reader failed'),
      onload: null as null | (() => void),
      onerror: null as null | (() => void),
      readAsDataURL: vi.fn(function (this: { onerror: null | (() => void) }) {
        this.onerror?.()
      }),
    } as unknown as FileReader

    await expect(readImageFileAsDataUrl(file, {
      createFileReader: () => reader,
    })).rejects.toThrow('reader failed')
  })
})
