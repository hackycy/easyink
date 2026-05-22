import { describe, expect, it, vi } from 'vitest'
import { pickImageWithFileInput, readImageFileAsDataUrl } from './image-picker-fallback'

describe('image picker fallback', () => {
  it('opens the native picker and resolves null on cancel', async () => {
    const original = HTMLInputElement.prototype.click
    const click = vi.fn(function (this: HTMLInputElement) {
      this.dispatchEvent(new Event('cancel'))
    })
    Object.defineProperty(HTMLInputElement.prototype, 'click', {
      configurable: true,
      value: click,
    })

    try {
      await expect(pickImageWithFileInput({
        id: 'designer.imageMaterial.pickImage',
        source: 'image-material',
      })).resolves.toBeNull()
      expect(click).toHaveBeenCalledTimes(1)
      expect(document.querySelector('input[type="file"]')).toBeNull()
    }
    finally {
      Object.defineProperty(HTMLInputElement.prototype, 'click', {
        configurable: true,
        value: original,
      })
    }
  })

  it('uses a provided shell input without removing it', async () => {
    const input = document.createElement('input')
    document.body.appendChild(input)
    const click = vi.fn(function (this: HTMLInputElement) {
      this.dispatchEvent(new Event('cancel'))
    })
    Object.defineProperty(input, 'click', {
      configurable: true,
      value: click,
    })

    await expect(pickImageWithFileInput({
      id: 'designer.imageMaterial.pickImage',
      source: 'image-material',
      accept: ['image/png'],
    }, {
      input,
    })).resolves.toBeNull()

    expect(click).toHaveBeenCalledTimes(1)
    expect(input.isConnected).toBe(true)
    expect(input.type).toBe('file')
    expect(input.accept).toBe('image/png')
  })

  it('waits for change when the browser focuses before the selected file is assigned', async () => {
    const input = document.createElement('input')
    document.body.appendChild(input)
    Object.defineProperty(input, 'oncancel', {
      configurable: true,
      value: null,
    })
    const file = new File(['hello'], 'sample.png', { type: 'image/png' })
    const click = vi.fn(function (this: HTMLInputElement) {
      window.dispatchEvent(new Event('focus'))
      setTimeout(() => {
        Object.defineProperty(this, 'files', {
          configurable: true,
          value: [file],
        })
        this.dispatchEvent(new Event('change'))
      }, 300)
    })
    Object.defineProperty(input, 'click', {
      configurable: true,
      value: click,
    })

    const result = await pickImageWithFileInput({
      id: 'designer.imageMaterial.pickImage',
      source: 'image-material',
      accept: ['image/*'],
    }, {
      input,
      createImage: () => delayedImage(),
    })

    expect(result).toEqual(expect.objectContaining({
      name: 'sample.png',
      width: 320,
      height: 180,
    }))
    expect(result?.src).toMatch(/^data:image\/png;base64,/)
    expect(click).toHaveBeenCalledTimes(1)
  })

  it('reads selected image files as data URL results', async () => {
    const file = new File(['hello'], 'sample.png', { type: 'image/png' })

    const result = await readImageFileAsDataUrl(file, {
      createImage: () => delayedImage(),
    })

    expect(result.name).toBe('sample.png')
    expect(result.width).toBe(320)
    expect(result.height).toBe(180)
    expect(result.src).toMatch(/^data:image\/png;base64,/)
  })

  it('rejects files that do not match the requested accept list', async () => {
    const original = HTMLInputElement.prototype.click
    const diagnostics: Array<{ severity: string, message: string, detail?: Record<string, unknown> }> = []
    const file = new File(['not an image'], 'sample.jpg', { type: 'image/jpeg' })
    const click = vi.fn(function (this: HTMLInputElement) {
      Object.defineProperty(this, 'files', {
        configurable: true,
        value: [file],
      })
      this.dispatchEvent(new Event('change'))
    })
    Object.defineProperty(HTMLInputElement.prototype, 'click', {
      configurable: true,
      value: click,
    })

    try {
      await expect(pickImageWithFileInput({
        id: 'designer.imageMaterial.pickImage',
        source: 'image-material',
        accept: ['image/png'],
      }, {
        onDiagnostic: diagnostic => diagnostics.push(diagnostic),
      })).resolves.toBeNull()

      expect(click).toHaveBeenCalledTimes(1)
      expect(diagnostics).toEqual([
        expect.objectContaining({
          severity: 'warn',
          detail: expect.objectContaining({
            fileName: 'sample.jpg',
            fileType: 'image/jpeg',
            accept: ['image/png'],
          }),
        }),
      ])
    }
    finally {
      Object.defineProperty(HTMLInputElement.prototype, 'click', {
        configurable: true,
        value: original,
      })
    }
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

  it('does not block selected images when size probing never settles', async () => {
    const file = new File(['hello'], 'sample.png', { type: 'image/png' })
    const image = {
      naturalWidth: 0,
      naturalHeight: 0,
      onload: null as null | ((event: Event) => void),
      onerror: null as null | ((event: Event) => void),
      get src() {
        return ''
      },
      set src(_value: string) {},
    } as unknown as HTMLImageElement

    const result = await readImageFileAsDataUrl(file, {
      createImage: () => image,
      imageProbeTimeoutMs: 1,
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

function delayedImage(): HTMLImageElement {
  let onload: null | ((event: Event) => void) = null
  return {
    naturalWidth: 320,
    naturalHeight: 180,
    get src() {
      return ''
    },
    set src(_value: string) {
      setTimeout(() => onload?.(new Event('load')))
    },
    get onload() {
      return onload
    },
    set onload(value: null | ((event: Event) => void)) {
      onload = value
    },
    onerror: null as null | ((event: Event) => void),
  } as unknown as HTMLImageElement
}
