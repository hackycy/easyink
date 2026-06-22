import type {
  DataContractBinding,
  DataContractFieldMapping,
  DataContractRelation,
  MaterialBinding,
} from '@easyink/schema'
import type { BindingFormatEditorDefinition } from './binding-format-editor'
import { deepClone, FIELD_PATH_SEPARATOR, resolveFieldPath } from '@easyink/shared'
import { formatBindingDisplayValue, hasBindingFormat } from './binding-format'

export type MaterialDataModelKind = 'tabular'
export type MaterialDataValueType = 'string' | 'number' | 'boolean' | 'date' | 'object' | 'array'
export type MaterialDataFieldFormat = 'display' | 'raw'
export type MaterialDataResolutionMode = 'record' | 'index' | 'empty' | 'invalid'

export interface MaterialDataContract {
  version: 3
  model: MaterialDataModel
}

export interface MaterialDataModel {
  kind: MaterialDataModelKind
  fields: Record<string, MaterialDataModelField>
}

export interface MaterialDataModelField {
  labelKey: string
  type: MaterialDataValueType
  required?: boolean
  format?: MaterialDataFieldFormat
  formatEditor?: BindingFormatEditorDefinition | false
}

export interface MaterialDataDiagnostic {
  code: string
  message: string
  severity: 'warning'
  fieldId?: string
  cause?: unknown
}

export interface MaterialDataBindingField {
  sourceId: string
  sourceName?: string
  sourceTag?: string
  fieldPath: string
  fieldKey?: string
  fieldTag?: string
  fieldLabel?: string
  format?: DataContractFieldMapping['format']
}

export interface MaterialDataMappingAcceptance {
  accepted: boolean
  message?: string
  messageKey?: string
}

export interface MaterialDataContractResolution {
  model: MaterialDataModel
  records: Array<Record<string, unknown>>
  mappings: Record<string, MaterialDataFieldResolution>
  diagnostics: MaterialDataDiagnostic[]
  mode: MaterialDataResolutionMode
}

export interface MaterialDataFieldResolution {
  field: MaterialDataModelField
  mapping?: DataContractFieldMapping
  value: unknown
  diagnostics: MaterialDataDiagnostic[]
}

interface SourceSelection {
  fieldId: string
  mapping: DataContractFieldMapping
  value: unknown
  diagnostics: MaterialDataDiagnostic[]
  normalizedPath: string
  sourceRoot: Record<string, unknown>
}

export function isDataContractBinding(binding: MaterialBinding | undefined): binding is DataContractBinding {
  return !!binding && !Array.isArray(binding) && 'kind' in binding && binding.kind === 'data-contract'
}

export function resolveMaterialDataContract(
  contract: MaterialDataContract,
  binding: MaterialBinding | undefined,
  data: Record<string, unknown>,
): MaterialDataContractResolution {
  const mappings = isDataContractBinding(binding) ? binding.mappings : {}
  const diagnostics: MaterialDataDiagnostic[] = []
  const fieldEntries = Object.entries(contract.model.fields)
  const resolvedMappings: Record<string, MaterialDataFieldResolution> = {}
  const selections: SourceSelection[] = []

  for (const [fieldId, field] of fieldEntries) {
    const mapping = mappings[fieldId]
    const fieldDiagnostics: MaterialDataDiagnostic[] = []
    if (!mapping) {
      if (field.required) {
        fieldDiagnostics.push({
          code: 'MATERIAL_DATA_FIELD_MISSING',
          severity: 'warning',
          fieldId,
          message: `Required data field "${fieldId}" is not mapped.`,
        })
      }
      resolvedMappings[fieldId] = { field, mapping, value: undefined, diagnostics: fieldDiagnostics }
      diagnostics.push(...fieldDiagnostics)
      continue
    }

    const selection = formatSelection(resolveSelection(fieldId, mapping, data), data)
    selections.push(selection)
    fieldDiagnostics.push(...selection.diagnostics)
    resolvedMappings[fieldId] = {
      field,
      mapping,
      value: selection.value,
      diagnostics: fieldDiagnostics,
    }
    diagnostics.push(...fieldDiagnostics)
  }

  const projection = projectSelections(contract, selections, bindingRelation(binding), diagnostics)
  return {
    model: contract.model,
    records: projection.records,
    mappings: resolvedMappings,
    diagnostics,
    mode: projection.mode,
  }
}

export function canBindMaterialDataField(
  contract: MaterialDataContract,
  _binding: MaterialBinding | undefined,
  _field: MaterialDataBindingField,
  fieldId: string,
): MaterialDataMappingAcceptance {
  if (!contract.model.fields[fieldId])
    return { accepted: false, message: 'Unknown data field', messageKey: 'designer.materialDataBinding.rejectUnknownSlot' }
  return { accepted: true }
}

export function applyMaterialDataFieldMapping(
  contract: MaterialDataContract,
  binding: MaterialBinding | undefined,
  field: MaterialDataBindingField,
  fieldId: string,
): DataContractBinding | undefined {
  if (!contract.model.fields[fieldId])
    return isDataContractBinding(binding) ? binding : undefined

  const current = isDataContractBinding(binding)
    ? deepClone(binding)
    : createEmptyDataContractBinding()
  current.mappings[fieldId] = createFieldMapping(field)
  return current
}

export function clearMaterialDataFieldMapping(
  _contract: MaterialDataContract,
  binding: MaterialBinding | undefined,
  fieldId: string,
): DataContractBinding | undefined {
  if (!isDataContractBinding(binding))
    return undefined
  const next = deepClone(binding)
  delete next.mappings[fieldId]
  return Object.keys(next.mappings).length > 0 ? next : undefined
}

export function findMaterialDataFieldMapping(
  contract: MaterialDataContract,
  binding: MaterialBinding | undefined,
  fieldId: string,
): DataContractFieldMapping | undefined {
  if (!contract.model.fields[fieldId] || !isDataContractBinding(binding))
    return undefined
  return binding.mappings[fieldId]
}

export function swapMaterialDataFieldMappings(
  contract: MaterialDataContract,
  binding: MaterialBinding | undefined,
  fromFieldId: string,
  toFieldId: string,
): DataContractBinding | undefined {
  if (fromFieldId === toFieldId)
    return isDataContractBinding(binding) ? binding : undefined
  if (!contract.model.fields[fromFieldId] || !contract.model.fields[toFieldId] || !isDataContractBinding(binding))
    return isDataContractBinding(binding) ? binding : undefined

  const next = deepClone(binding)
  const from = next.mappings[fromFieldId]
  const to = next.mappings[toFieldId]
  if (to)
    next.mappings[fromFieldId] = to
  else
    delete next.mappings[fromFieldId]
  if (from)
    next.mappings[toFieldId] = from
  else
    delete next.mappings[toFieldId]
  return next
}

export function normalizeMaterialDataBinding(binding: MaterialBinding | undefined): DataContractBinding | undefined {
  return isDataContractBinding(binding) ? binding : undefined
}

function projectSelections(
  contract: MaterialDataContract,
  selections: SourceSelection[],
  relation: DataContractRelation | undefined,
  diagnostics: MaterialDataDiagnostic[],
): { records: Array<Record<string, unknown>>, mode: MaterialDataResolutionMode } {
  if (selections.length === 0)
    return { records: [], mode: 'empty' }

  const relationKind = relation?.kind === 'auto' ? undefined : relation?.kind
  const recordProjection = relationKind === 'index' ? undefined : projectSharedRecordSelections(selections, diagnostics)
  if (recordProjection)
    return { records: coerceRecords(contract, recordProjection.records), mode: 'record' }

  if (relationKind === 'record') {
    diagnostics.push({
      code: 'MATERIAL_DATA_RECORD_RELATION_UNRESOLVED',
      severity: 'warning',
      message: 'Mapped fields do not share a resolvable record collection.',
    })
    return { records: [], mode: 'invalid' }
  }

  const indexProjection = projectIndexedSelections(selections, diagnostics)
  if (indexProjection)
    return { records: coerceRecords(contract, indexProjection.records), mode: 'index' }

  diagnostics.push({
    code: 'MATERIAL_DATA_RELATION_UNRESOLVED',
    severity: 'warning',
    message: 'Mapped fields could not be resolved into target records.',
  })
  return { records: [], mode: 'invalid' }
}

function projectSharedRecordSelections(
  selections: SourceSelection[],
  diagnostics: MaterialDataDiagnostic[],
): { records: Array<Record<string, unknown>> } | undefined {
  const parents = selections.map((selection) => {
    const parentPath = parentPathOf(selection.normalizedPath)
    if (!parentPath)
      return undefined
    const collection = resolvePath(selection.sourceRoot, parentPath)
    return Array.isArray(collection)
      ? { parentPath, collection, leafPath: leafPathOf(selection.normalizedPath, parentPath) }
      : undefined
  })
  if (parents.some(parent => !parent))
    return undefined
  const first = parents[0]!
  if (!parents.every(parent => parent!.parentPath === first.parentPath && parent!.collection === first.collection))
    return undefined

  const records = first.collection.map((record) => {
    const target: Record<string, unknown> = {}
    selections.forEach((selection, index) => {
      const raw = resolvePath(record, parents[index]!.leafPath)
      const formatted = formatMappingValue(raw, selection.mapping, isRecord(record) ? record : {})
      target[selection.fieldId] = formatted.value
      diagnostics.push(...toMaterialDataDiagnostics(selection.fieldId, formatted.diagnostics))
    })
    return target
  })
  return { records }
}

function projectIndexedSelections(
  selections: SourceSelection[],
  diagnostics: MaterialDataDiagnostic[],
): { records: Array<Record<string, unknown>> } | undefined {
  const arrays = selections.map((selection) => {
    if (Array.isArray(selection.value)) {
      return selection.value.map((item) => {
        const formatted = formatMappingValue(item, selection.mapping, selection.sourceRoot)
        diagnostics.push(...toMaterialDataDiagnostics(selection.fieldId, formatted.diagnostics))
        return formatted.value
      })
    }
    const parentPath = parentPathOf(selection.normalizedPath)
    if (!parentPath)
      return undefined
    const collection = resolvePath(selection.sourceRoot, parentPath)
    if (!Array.isArray(collection))
      return undefined
    const leafPath = leafPathOf(selection.normalizedPath, parentPath)
    return collection.map((record) => {
      const raw = resolvePath(record, leafPath)
      const formatted = formatMappingValue(raw, selection.mapping, record as Record<string, unknown>)
      diagnostics.push(...toMaterialDataDiagnostics(selection.fieldId, formatted.diagnostics))
      return formatted.value
    })
  })
  if (arrays.some(array => !array))
    return undefined

  const length = Math.min(...arrays.map(array => array!.length))
  const records: Array<Record<string, unknown>> = []
  for (let index = 0; index < length; index++) {
    const record: Record<string, unknown> = {}
    selections.forEach((selection, selectionIndex) => {
      record[selection.fieldId] = arrays[selectionIndex]![index]
    })
    records.push(record)
  }
  return { records }
}

function coerceRecords(contract: MaterialDataContract, records: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  return records.map((record) => {
    const next: Record<string, unknown> = {}
    for (const [fieldId, field] of Object.entries(contract.model.fields))
      next[fieldId] = coerceFieldValue(record[fieldId], field)
    return next
  })
}

function coerceFieldValue(value: unknown, field: MaterialDataModelField): unknown {
  if (value == null)
    return value
  if (field.type === 'number') {
    const numeric = typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim() !== ''
        ? Number(value)
        : Number.NaN
    return Number.isFinite(numeric) ? numeric : undefined
  }
  if (field.type === 'string')
    return String(value)
  return value
}

function formatSelection(selection: SourceSelection, data: Record<string, unknown>): SourceSelection {
  if (Array.isArray(selection.value) || isCollectionLeafSelection(selection))
    return { ...selection, diagnostics: [] }
  const formatted = formatMappingValue(selection.value, selection.mapping, data)
  return {
    ...selection,
    value: formatted.value,
    diagnostics: toMaterialDataDiagnostics(selection.fieldId, formatted.diagnostics),
  }
}

function isCollectionLeafSelection(selection: SourceSelection): boolean {
  const parentPath = parentPathOf(selection.normalizedPath)
  return !!parentPath && Array.isArray(resolvePath(selection.sourceRoot, parentPath))
}

function formatMappingValue(
  value: unknown,
  mapping: DataContractFieldMapping,
  data: Record<string, unknown>,
): { value: unknown, diagnostics: MaterialDataDiagnostic[] } {
  if (!hasBindingFormat(mapping.format))
    return { value, diagnostics: [] }
  return formatBindingDisplayValue(value, {
    sourceId: mapping.sourceId,
    sourceName: mapping.sourceName,
    sourceTag: mapping.sourceTag,
    fieldPath: mapping.select.path,
    fieldKey: mapping.select.key,
    fieldLabel: mapping.select.label,
    format: mapping.format,
  }, { data })
}

function toMaterialDataDiagnostics(
  fieldId: string,
  diagnostics: Array<{ code: string, severity: 'warning', message: string, cause?: unknown }>,
): MaterialDataDiagnostic[] {
  return diagnostics.map(diagnostic => ({
    code: diagnostic.code,
    severity: diagnostic.severity,
    fieldId,
    message: diagnostic.message,
    cause: diagnostic.cause,
  }))
}

function resolveSelection(fieldId: string, mapping: DataContractFieldMapping, data: Record<string, unknown>): SourceSelection {
  const normalizedPath = normalizePath(mapping.select.path)
  if (canResolveSelectionPath(data, normalizedPath)) {
    return {
      fieldId,
      mapping,
      value: resolvePath(data, normalizedPath),
      diagnostics: [],
      normalizedPath,
      sourceRoot: data,
    }
  }

  return {
    fieldId,
    mapping,
    value: undefined,
    diagnostics: [],
    normalizedPath,
    sourceRoot: data,
  }
}

function canResolveSelectionPath(root: Record<string, unknown>, path: string): boolean {
  if (resolvePath(root, path) !== undefined)
    return true
  const parentPath = parentPathOf(path)
  if (!parentPath)
    return false
  return Array.isArray(resolvePath(root, parentPath))
}

function bindingRelation(binding: MaterialBinding | undefined): DataContractRelation | undefined {
  return isDataContractBinding(binding) ? binding.relation : undefined
}

function createEmptyDataContractBinding(): DataContractBinding {
  return {
    kind: 'data-contract',
    mappings: {},
    relation: { kind: 'auto' },
  }
}

function createFieldMapping(field: MaterialDataBindingField): DataContractFieldMapping {
  return {
    sourceId: field.sourceId,
    sourceName: field.sourceName,
    sourceTag: field.sourceTag,
    select: {
      path: field.fieldPath,
      key: field.fieldKey,
      label: field.fieldLabel,
      tag: field.fieldTag,
    },
    format: field.format ? deepClone(field.format) : undefined,
  }
}

function resolvePath(root: unknown, path: string): unknown {
  if (!path)
    return root
  return resolveFieldPath(root, path)
}

function normalizePath(path: string): string {
  return path.split(FIELD_PATH_SEPARATOR).filter(Boolean).join(FIELD_PATH_SEPARATOR)
}

function parentPathOf(path: string): string | undefined {
  const index = path.lastIndexOf(FIELD_PATH_SEPARATOR)
  return index > 0 ? path.slice(0, index) : undefined
}

function leafPathOf(path: string, parentPath: string): string {
  const prefix = `${parentPath}${FIELD_PATH_SEPARATOR}`
  return path.startsWith(prefix) ? path.slice(prefix.length) : path
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
