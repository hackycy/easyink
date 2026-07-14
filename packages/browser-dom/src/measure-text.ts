import type { MaterialTextMeasureInput, MaterialTextMeasureResult } from '@easyink/core'
import { convertUnit } from '@easyink/shared'

type DocumentUnit = MaterialTextMeasureInput['unit']

interface ValidatedTextMeasureInput {
  readonly text: string
  readonly availableWidth: number
  readonly unit: DocumentUnit
  readonly style: {
    readonly fontFamily: string
    readonly fontSize: number
    readonly fontWeight?: string | number
    readonly fontStyle?: 'normal' | 'italic' | 'oblique'
    readonly lineHeight: number
    readonly letterSpacing?: number
    readonly whiteSpace: 'pre' | 'pre-wrap'
    readonly overflowWrap: 'normal' | 'anywhere'
  }
}

interface CssTextMeasureDimensions {
  readonly availableWidth: number
  readonly fontSize: number
  readonly letterSpacing: number
}

export class BrowserTextMeasureService {
  private readonly cache = new Map<string, MaterialTextMeasureResult>()
  private readonly maxEntries: number

  constructor(
    private readonly document: Document,
    options: { maxEntries: number },
  ) {
    if (!Number.isSafeInteger(options.maxEntries) || options.maxEntries <= 0)
      throw new Error('BROWSER_TEXT_MEASURE_CACHE_SIZE_INVALID')
    this.maxEntries = options.maxEntries
  }

  async measure(
    input: MaterialTextMeasureInput,
    resourceRevision: number,
    signal: AbortSignal,
  ): Promise<MaterialTextMeasureResult> {
    throwIfAborted(signal)
    if (!Number.isSafeInteger(resourceRevision) || resourceRevision < 0)
      throw new Error('BROWSER_TEXT_MEASURE_RESOURCE_REVISION_INVALID')
    const validated = validateInput(input)
    const key = textMeasureKey(validated, resourceRevision)
    const cached = this.cache.get(key)
    if (cached) {
      this.cache.delete(key)
      this.cache.set(key, cached)
      return cached
    }

    if (validated.text.length === 0) {
      const result = Object.freeze({ width: 0, height: 0 })
      throwIfAborted(signal)
      this.publish(key, result)
      return result
    }

    const cssDimensions = convertInputDimensions(validated)
    const element = this.document.createElement('div')
    try {
      configureProbe(element, validated, cssDimensions)
      const parent = this.document.body ?? this.document.documentElement
      if (!parent)
        throw new Error('BROWSER_TEXT_MEASURE_DOCUMENT_INVALID')
      parent.appendChild(element)
      throwIfAborted(signal)
      const rect = element.getBoundingClientRect()
      throwIfAborted(signal)
      if (![rect.width, rect.height].every(Number.isFinite) || rect.width < 0 || rect.height < 0)
        throw new Error('BROWSER_TEXT_MEASURE_RESULT_INVALID')
      const width = normalizeMeasurement(convertUnit(rect.width, 'px', validated.unit))
      const height = normalizeMeasurement(convertUnit(rect.height, 'px', validated.unit))
      if (![width, height].every(Number.isFinite) || width < 0 || height < 0)
        throw new Error('BROWSER_TEXT_MEASURE_RESULT_INVALID')
      const result = Object.freeze({ width, height })
      throwIfAborted(signal)
      this.publish(key, result)
      return result
    }
    finally {
      element.remove()
    }
  }

  clear(): void {
    this.cache.clear()
  }

  private publish(key: string, result: MaterialTextMeasureResult): void {
    this.cache.set(key, result)
    while (this.cache.size > this.maxEntries) {
      const oldestKey = this.cache.keys().next().value
      if (oldestKey === undefined)
        break
      this.cache.delete(oldestKey)
    }
  }
}

function configureProbe(
  element: HTMLElement,
  input: ValidatedTextMeasureInput,
  dimensions: CssTextMeasureDimensions,
): void {
  element.dataset.easyinkTextMeasure = ''
  element.textContent = input.text
  element.style.position = 'fixed'
  element.style.left = '-100000px'
  element.style.top = '0'
  element.style.visibility = 'hidden'
  element.style.pointerEvents = 'none'
  element.style.contain = 'layout style paint'
  element.style.boxSizing = 'border-box'
  element.style.width = `${dimensions.availableWidth}px`
  element.style.fontFamily = input.style.fontFamily
  element.style.fontSize = `${dimensions.fontSize}px`
  element.style.fontWeight = String(input.style.fontWeight ?? 'normal')
  element.style.fontStyle = input.style.fontStyle ?? 'normal'
  element.style.lineHeight = String(input.style.lineHeight)
  element.style.letterSpacing = `${dimensions.letterSpacing}px`
  element.style.whiteSpace = input.style.whiteSpace
  element.style.overflowWrap = input.style.overflowWrap
}

function convertInputDimensions(input: ValidatedTextMeasureInput): CssTextMeasureDimensions {
  const availableWidth = convertUnit(input.availableWidth, input.unit, 'px')
  const fontSize = convertUnit(input.style.fontSize, input.unit, 'px')
  const letterSpacing = convertUnit(input.style.letterSpacing ?? 0, input.unit, 'px')
  if (!Number.isFinite(availableWidth) || availableWidth < 0
    || !Number.isFinite(fontSize) || fontSize < 0
    || !Number.isFinite(letterSpacing)) {
    throw new Error('BROWSER_TEXT_MEASURE_CONVERSION_INVALID')
  }
  return { availableWidth, fontSize, letterSpacing }
}

function textMeasureKey(input: ValidatedTextMeasureInput, resourceRevision: number): string {
  return JSON.stringify([
    resourceRevision,
    input.text,
    input.availableWidth,
    input.unit,
    input.style.fontFamily,
    input.style.fontSize,
    input.style.fontWeight ?? null,
    input.style.fontStyle ?? null,
    input.style.lineHeight,
    input.style.letterSpacing ?? null,
    input.style.whiteSpace,
    input.style.overflowWrap,
  ])
}

function validateInput(input: unknown): ValidatedTextMeasureInput {
  try {
    if (!isRecord(input))
      throw new Error('invalid input')
    const text = readOwnDataProperty(input, 'text')
    const availableWidth = readOwnDataProperty(input, 'availableWidth')
    const unit = readOwnDataProperty(input, 'unit')
    const style = readOwnDataProperty(input, 'style')
    if (typeof text !== 'string'
      || !isFiniteNumber(availableWidth) || availableWidth < 0
      || !isDocumentUnit(unit)
      || !isRecord(style)) {
      throw new Error('invalid input')
    }

    const fontFamily = readOwnDataProperty(style, 'fontFamily')
    const fontSize = readOwnDataProperty(style, 'fontSize')
    const fontWeight = readOptionalOwnDataProperty(style, 'fontWeight')
    const fontStyle = readOptionalOwnDataProperty(style, 'fontStyle')
    const lineHeight = readOwnDataProperty(style, 'lineHeight')
    const letterSpacing = readOptionalOwnDataProperty(style, 'letterSpacing')
    const whiteSpace = readOwnDataProperty(style, 'whiteSpace')
    const overflowWrap = readOwnDataProperty(style, 'overflowWrap')
    if (typeof fontFamily !== 'string' || fontFamily.trim().length === 0
      || !isFiniteNumber(fontSize) || fontSize < 0
      || !isValidFontWeight(fontWeight)
      || (fontStyle !== undefined && fontStyle !== 'normal' && fontStyle !== 'italic' && fontStyle !== 'oblique')
      || !isFiniteNumber(lineHeight) || lineHeight <= 0
      || (letterSpacing !== undefined && !isFiniteNumber(letterSpacing))
      || (whiteSpace !== 'pre' && whiteSpace !== 'pre-wrap')
      || (overflowWrap !== 'normal' && overflowWrap !== 'anywhere')) {
      throw new Error('invalid input')
    }

    return {
      text,
      availableWidth,
      unit,
      style: {
        fontFamily,
        fontSize,
        fontWeight: fontWeight ?? 'normal',
        fontStyle: fontStyle ?? 'normal',
        lineHeight,
        letterSpacing: letterSpacing ?? 0,
        whiteSpace,
        overflowWrap,
      },
    }
  }
  catch {
    throw new Error('BROWSER_TEXT_MEASURE_INPUT_INVALID')
  }
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readOwnDataProperty(value: object, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(value, key)
  if (!descriptor || !('value' in descriptor))
    throw new Error('invalid input')
  return descriptor.value
}

function readOptionalOwnDataProperty(value: object, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(value, key)
  if (!descriptor)
    return undefined
  if (!('value' in descriptor))
    throw new Error('invalid input')
  return descriptor.value
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isDocumentUnit(value: unknown): value is DocumentUnit {
  return value === 'mm' || value === 'pt' || value === 'px' || value === 'inch'
}

function isValidFontWeight(value: unknown): value is string | number | undefined {
  return value === undefined
    || (typeof value === 'string' && value.trim().length > 0)
    || isFiniteNumber(value)
}

function normalizeMeasurement(value: number): number {
  return Number(value.toPrecision(15))
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted)
    throw signal.reason ?? new DOMException('The operation was aborted.', 'AbortError')
}
