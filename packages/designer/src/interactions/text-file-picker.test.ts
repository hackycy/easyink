import { afterEach, describe, expect, it, vi } from 'vitest'
import { pickTextFileWithFileInput, readAcceptedTextFile, readFileAsText } from './text-file-picker'

afterEach(() => {
  document.body.innerHTML = ''
})

describe('text file picker', () => {
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
      await expect(pickTextFileWithFileInput({
        id: 'designer.svgCustom.importFile',
        source: 'svg-custom-content',
        accept: ['.svg', 'image/svg+xml'],
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

    await expect(pickTextFileWithFileInput({
      id: 'designer.svgCustom.importFile',
      source: 'svg-custom-content',
      accept: ['.svg', 'image/svg+xml'],
    }, {
      input,
    })).resolves.toBeNull()

    expect(click).toHaveBeenCalledTimes(1)
    expect(input.isConnected).toBe(true)
    expect(input.type).toBe('file')
    expect(input.accept).toBe('.svg,image/svg+xml')
  })

  it('returns selected SVG file text', async () => {
    const file = new File(['<svg viewBox="0 0 1 1"></svg>'], 'logo.svg', { type: 'image/svg+xml' })

    const result = await readAcceptedTextFile(file, {
      id: 'designer.svgCustom.importFile',
      source: 'svg-custom-content',
      accept: ['.svg', 'image/svg+xml'],
    })

    expect(result).toEqual(expect.objectContaining({
      text: '<svg viewBox="0 0 1 1"></svg>',
      name: 'logo.svg',
      type: 'image/svg+xml',
      size: file.size,
    }))
  })

  it('accepts extension-matched SVG files even when the browser omits MIME type', async () => {
    const file = new File(['<svg></svg>'], 'logo.svg')

    await expect(readAcceptedTextFile(file, {
      id: 'designer.svgCustom.importFile',
      source: 'svg-custom-content',
      accept: ['.svg', 'image/svg+xml'],
    })).resolves.toEqual(expect.objectContaining({
      text: '<svg></svg>',
      name: 'logo.svg',
    }))
  })

  it('rejects files that do not match the requested accept list', async () => {
    const diagnostics: Array<{ severity: string, message: string, detail?: Record<string, unknown> }> = []
    const file = new File(['{}'], 'data.json', { type: 'application/json' })

    await expect(readAcceptedTextFile(file, {
      id: 'designer.svgCustom.importFile',
      source: 'svg-custom-content',
      accept: ['.svg', 'image/svg+xml'],
    }, {
      onDiagnostic: diagnostic => diagnostics.push(diagnostic),
    })).resolves.toBeNull()

    expect(diagnostics).toEqual([
      expect.objectContaining({
        severity: 'warn',
        detail: expect.objectContaining({
          fileName: 'data.json',
          fileType: 'application/json',
          accept: ['.svg', 'image/svg+xml'],
        }),
      }),
    ])
  })

  it('rejects text files larger than maxBytes', async () => {
    const diagnostics: Array<{ severity: string, message: string, detail?: Record<string, unknown> }> = []
    const file = new File(['<svg></svg>'], 'logo.svg', { type: 'image/svg+xml' })

    await expect(readAcceptedTextFile(file, {
      id: 'designer.svgCustom.importFile',
      source: 'svg-custom-content',
      accept: ['.svg', 'image/svg+xml'],
      maxBytes: 4,
    }, {
      onDiagnostic: diagnostic => diagnostics.push(diagnostic),
    })).resolves.toBeNull()

    expect(diagnostics).toEqual([
      expect.objectContaining({
        severity: 'warn',
        detail: expect.objectContaining({
          fileName: 'logo.svg',
          fileSize: file.size,
          maxBytes: 4,
        }),
      }),
    ])
  })

  it('reads file text with the browser FileReader path', async () => {
    const file = new File(['hello'], 'hello.txt', { type: 'text/plain' })

    await expect(readFileAsText(file)).resolves.toBe('hello')
  })
})
