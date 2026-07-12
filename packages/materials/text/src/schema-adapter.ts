import type { AdaptableMaterialNode, MaterialSchemaIssue, SchemaAdapter } from '@easyink/core'
import type { TextProps } from './schema'
import { TEXT_DEFAULTS } from './schema'

const WRAP_MODES = new Set(['wrap', 'nowrap', 'anywhere'])

export const textSchemaAdapter: SchemaAdapter = {
  currentModelVersion: 1,
  modelUnitPolicy: 'independent',
  migrations: [{
    from: 0,
    to: 1,
    conformance: {
      fixtures: [{ id: 'text-v0-auto-wrap', input: { model: { content: 'fixture', autoWrap: false } } }],
      declaredWritePaths: ['/model', '/modelVersion'],
    },
    migrate(node) {
      const { autoWrap, ...model } = node.model as Record<string, unknown>
      const wrapMode = isWrapMode(model.wrapMode)
        ? model.wrapMode
        : autoWrap === false ? 'nowrap' : 'anywhere'
      return { ...node, modelVersion: 1, model: { ...model, wrapMode } }
    },
  }],
  validateInput: validateTextInputByVersion,
  normalize: node => ({ ...node, model: normalizeTextModelV1(node.model) as unknown as Record<string, unknown> }),
  validate: validateTextV1Node,
  introspect(node) {
    const fontFamily = typeof node.model.fontFamily === 'string' ? node.model.fontFamily : ''
    return {
      identities: [],
      structures: [],
      references: [],
      bindings: [],
      resources: fontFamily
        ? [{ path: '/model/fontFamily', value: fontFamily, kind: 'font' }]
        : [],
    }
  },
}

export function normalizeTextModelV1(input: Record<string, unknown>): TextProps {
  const { autoWrap: _autoWrap, ...raw } = input
  return {
    ...TEXT_DEFAULTS,
    ...raw,
    content: typeof raw.content === 'string' ? raw.content : TEXT_DEFAULTS.content,
    writingMode: raw.writingMode === 'vertical' ? 'vertical' : 'horizontal',
    heightMode: raw.heightMode === 'auto' ? 'auto' : 'fixed',
    fontSize: Math.max(0.1, finite(raw.fontSize, TEXT_DEFAULTS.fontSize)),
    fontFamily: typeof raw.fontFamily === 'string' ? raw.fontFamily : TEXT_DEFAULTS.fontFamily,
    fontWeight: typeof raw.fontWeight === 'string' ? raw.fontWeight : TEXT_DEFAULTS.fontWeight,
    fontStyle: typeof raw.fontStyle === 'string' ? raw.fontStyle : TEXT_DEFAULTS.fontStyle,
    color: typeof raw.color === 'string' ? raw.color : TEXT_DEFAULTS.color,
    backgroundColor: typeof raw.backgroundColor === 'string' ? raw.backgroundColor : TEXT_DEFAULTS.backgroundColor,
    textAlign: raw.textAlign === 'left' || raw.textAlign === 'right' ? raw.textAlign : 'center',
    verticalAlign: raw.verticalAlign === 'top' || raw.verticalAlign === 'bottom' ? raw.verticalAlign : 'middle',
    lineHeight: Math.max(0.1, finite(raw.lineHeight, TEXT_DEFAULTS.lineHeight)),
    letterSpacing: finite(raw.letterSpacing, TEXT_DEFAULTS.letterSpacing),
    wrapMode: isWrapMode(raw.wrapMode) ? raw.wrapMode : TEXT_DEFAULTS.wrapMode,
    overflow: raw.overflow === 'visible' || raw.overflow === 'ellipsis' ? raw.overflow : 'hidden',
    minHeight: nullableNonnegative(raw.minHeight),
    maxHeight: nullableNonnegative(raw.maxHeight),
    prefix: typeof raw.prefix === 'string' ? raw.prefix : TEXT_DEFAULTS.prefix,
    suffix: typeof raw.suffix === 'string' ? raw.suffix : TEXT_DEFAULTS.suffix,
    borderWidth: Math.max(0, finite(raw.borderWidth, TEXT_DEFAULTS.borderWidth)),
    borderColor: typeof raw.borderColor === 'string' ? raw.borderColor : TEXT_DEFAULTS.borderColor,
    borderType: raw.borderType === 'dashed' || raw.borderType === 'dotted' ? raw.borderType : 'solid',
  }
}

function validateTextInputByVersion(node: AdaptableMaterialNode): readonly MaterialSchemaIssue[] {
  if (node.modelVersion !== 0 && node.modelVersion !== 1)
    return [issue('TEXT_MODEL_VERSION_UNSUPPORTED', '/model', 'Text modelVersion must be 0 or 1')]
  if (!isRecord(node.model))
    return [issue('TEXT_MODEL_INVALID', '/model', 'Text model must be an object')]
  if (node.modelVersion === 0 && node.model.autoWrap !== undefined && typeof node.model.autoWrap !== 'boolean')
    return [issue('TEXT_AUTO_WRAP_INVALID', '/model/autoWrap', 'Text autoWrap must be boolean')]
  if (node.modelVersion === 1 && Object.hasOwn(node.model, 'autoWrap'))
    return [issue('TEXT_AUTO_WRAP_LEGACY', '/model/autoWrap', 'Text v1 does not allow autoWrap')]
  if (node.model.wrapMode !== undefined && !isWrapMode(node.model.wrapMode))
    return [issue('TEXT_WRAP_MODE_INVALID', '/model/wrapMode', 'Text wrapMode is invalid')]
  return []
}

function validateTextV1Node(node: AdaptableMaterialNode): readonly MaterialSchemaIssue[] {
  if (Object.hasOwn(node.model, 'autoWrap'))
    return [issue('TEXT_AUTO_WRAP_LEGACY', '/model/autoWrap', 'Text v1 does not allow autoWrap')]
  return isWrapMode(node.model.wrapMode)
    ? []
    : [issue('TEXT_WRAP_MODE_INVALID', '/model/wrapMode', 'Text wrapMode is invalid')]
}

function isWrapMode(value: unknown): value is TextProps['wrapMode'] {
  return typeof value === 'string' && WRAP_MODES.has(value)
}

function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function nullableNonnegative(value: unknown): number | null {
  if (value === null || value === undefined)
    return null
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function issue(code: string, path: `/${string}`, message: string): MaterialSchemaIssue {
  return { code, severity: 'error', path, message }
}
