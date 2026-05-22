import { describe, expect, it, vi } from 'vitest'
import { pickAssetWithFileInput, readAcceptedAssetFile, uploadAssetAsDataUrl } from './asset-file-picker'

describe('asset file picker', () => {
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
      await expect(pickAssetWithFileInput({
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

    await expect(pickAssetWithFileInput({
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

    const result = await pickAssetWithFileInput({
      id: 'designer.imageMaterial.pickImage',
      source: 'image-material',
      accept: ['image/*'],
    }, {
      input,
      createImage: () => delayedImage(),
    })

    expect(result).toEqual(expect.objectContaining({
      file,
      name: 'sample.png',
      width: 320,
      height: 180,
    }))
    expect(click).toHaveBeenCalledTimes(1)
  })

  it('returns selected image files as local asset picks', async () => {
    const file = new File(['hello'], 'sample.png', { type: 'image/png' })

    const result = await readAcceptedAssetFile(file, {
      id: 'designer.imageMaterial.pickImage',
      source: 'image-material',
    }, {
      createImage: () => delayedImage(),
    })

    expect(result?.file).toBe(file)
    expect(result?.name).toBe('sample.png')
    expect(result?.width).toBe(320)
    expect(result?.height).toBe(180)
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
      await expect(pickAssetWithFileInput({
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

  it('still returns the file when image size probing fails', async () => {
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

    const result = await readAcceptedAssetFile(file, {
      id: 'designer.imageMaterial.pickImage',
      source: 'image-material',
    }, {
      createImage: () => image,
    })

    expect(result?.file).toBe(file)
    expect(result?.width).toBeUndefined()
    expect(result?.height).toBeUndefined()
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

    const result = await readAcceptedAssetFile(file, {
      id: 'designer.imageMaterial.pickImage',
      source: 'image-material',
    }, {
      createImage: () => image,
      imageProbeTimeoutMs: 1,
    })

    expect(result?.file).toBe(file)
    expect(result?.width).toBeUndefined()
    expect(result?.height).toBeUndefined()
  })

  it('uploads local files as data URLs by default', async () => {
    const file = new File(['hello'], 'sample.png', { type: 'image/png' })
    const result = await uploadAssetAsDataUrl({
      id: 'designer.imageMaterial.pickImage',
      source: 'image-material',
      file,
      picked: {
        file,
        name: 'sample.png',
        width: 320,
        height: 180,
        metadata: { source: 'local' },
      },
    })

    expect(result.url).toMatch(/^data:image\/png;base64,/)
    expect(result.name).toBe('sample.png')
    expect(result.width).toBe(320)
    expect(result.height).toBe(180)
    expect(result.metadata).toEqual({ source: 'local' })
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
