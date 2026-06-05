import type { BindingRef } from '@easyink/schema'
import { deepClone, FIELD_PATH_SEPARATOR } from '@easyink/shared'
import { resolveBindingValue } from './binding-utils'

export type MaterialDataSlotKind = 'scalar' | 'field' | 'record' | 'computed'
export type MaterialDataValueType = 'string' | 'number' | 'boolean' | 'date' | 'object' | 'array'

export interface MaterialDataContract {
  version: 1
  slots: readonly MaterialDataSlot[]
}

export interface MaterialDataSlot {
  id: string
  labelKey: string
  required: boolean
  kind: MaterialDataSlotKind
  valueType?: MaterialDataValueType
  /**
   * Field slots with the same scope must come from the same inferred parent path.
   * The scope is a relationship between field roles, not a persisted collection binding.
   */
  scope?: string
  bindIndex: number
}

export interface MaterialDataDiagnostic {
  code: string
  message: string
  severity: 'warning'
  slotId?: string
  cause?: unknown
}

export interface MaterialDataSlotResolution {
  slot: MaterialDataSlot
  binding?: BindingRef
  value: unknown
  diagnostics: MaterialDataDiagnostic[]
}

export interface MaterialDataContractResolution {
  slots: MaterialDataSlotResolution[]
  diagnostics: MaterialDataDiagnostic[]
}

export interface MaterialDataBindingField {
  sourceId: string
  sourceName?: string
  sourceTag?: string
  fieldPath: string
  fieldKey?: string
  fieldTag?: string
  fieldLabel?: string
  format?: BindingRef['format']
}

export interface MaterialDataSlotAcceptance {
  accepted: boolean
  message?: string
  messageKey?: string
}

export function resolveMaterialDataContract(
  contract: MaterialDataContract,
  bindings: BindingRef | BindingRef[] | undefined,
  data: Record<string, unknown>,
): MaterialDataContractResolution {
  const refs = normalizeBindings(bindings)
  const slots = contract.slots.map((slot) => {
    const binding = findSlotBinding(refs, slot)
    const diagnostics: MaterialDataDiagnostic[] = []
    if (!binding) {
      if (slot.required) {
        diagnostics.push({
          code: 'MATERIAL_DATA_SLOT_MISSING',
          severity: 'warning',
          slotId: slot.id,
          message: `Required data slot "${slot.id}" is not bound.`,
        })
      }
      return { slot, binding, value: undefined, diagnostics }
    }

    const value = resolveBindingValue(binding, data)
    if (slot.required && value === undefined && slot.kind !== 'field') {
      diagnostics.push({
        code: 'MATERIAL_DATA_SLOT_VALUE_MISSING',
        severity: 'warning',
        slotId: slot.id,
        message: `Required data slot "${slot.id}" resolved to no value.`,
      })
    }
    return { slot, binding, value, diagnostics }
  })

  return {
    slots,
    diagnostics: slots.flatMap(slot => slot.diagnostics),
  }
}

export function getMaterialDataSlot(
  resolution: MaterialDataContractResolution,
  slotId: string,
): MaterialDataSlotResolution | undefined {
  return resolution.slots.find(slot => slot.slot.id === slotId)
}

export function canBindMaterialDataSlot(
  contract: MaterialDataContract,
  bindings: BindingRef | BindingRef[] | undefined,
  field: MaterialDataBindingField,
  slotId: string,
): MaterialDataSlotAcceptance {
  const slot = findContractSlot(contract, slotId)
  if (!slot)
    return { accepted: false, message: 'Unknown data slot', messageKey: 'designer.materialDataBinding.rejectUnknownSlot' }

  if (slot.kind !== 'field')
    return { accepted: true }

  if (!slot.scope)
    return { accepted: true }

  const collectionPath = inferParentPath(field.fieldPath)
  if (!collectionPath)
    return { accepted: false, message: 'Drop a field inside a collection', messageKey: 'designer.materialDataBinding.rejectScopedField' }

  for (const scopedSlot of contract.slots) {
    if (scopedSlot.id === slot.id || scopedSlot.kind !== 'field' || scopedSlot.scope !== slot.scope)
      continue
    const scopedBinding = findMaterialDataSlotBinding(contract, bindings, scopedSlot.id)
    if (!scopedBinding)
      continue

    if (scopedBinding.sourceId !== field.sourceId)
      return { accepted: false, message: 'Data source mismatch', messageKey: 'designer.dataSource.sourceConflict' }

    const scopedCollectionPath = inferParentPath(scopedBinding.fieldPath)
    if (scopedCollectionPath !== collectionPath)
      return { accepted: false, message: 'Collection path mismatch', messageKey: 'designer.dataSource.collectionMismatch' }
  }

  return { accepted: true }
}

export function applyMaterialDataSlotBinding(
  contract: MaterialDataContract,
  bindings: BindingRef | BindingRef[] | undefined,
  field: MaterialDataBindingField,
  slotId: string,
): BindingRef[] {
  const slot = findContractSlot(contract, slotId)
  if (!slot)
    return normalizeBindings(bindings)

  const current = normalizeBindings(bindings)
  const acceptance = canBindMaterialDataSlot(contract, current, field, slotId)
  if (!acceptance.accepted)
    return current

  return replaceSlotBinding(contract, current, createSlotBinding(slot, field, field.fieldPath, field.fieldLabel), slot)
}

export function clearMaterialDataSlotBinding(
  contract: MaterialDataContract,
  bindings: BindingRef | BindingRef[] | undefined,
  slotId: string,
): BindingRef[] {
  const slot = findContractSlot(contract, slotId)
  if (!slot)
    return normalizeBindings(bindings)

  const dependentSlotIds = new Set<string>([slot.id])

  return normalizeBindings(bindings)
    .filter(binding => !dependentSlotIds.has(readBindingSlotId(contract, binding)))
    .sort(sortByBindIndex)
}

export function findMaterialDataSlotBinding(
  contract: MaterialDataContract,
  bindings: BindingRef | BindingRef[] | undefined,
  slotId: string,
): BindingRef | undefined {
  const slot = findContractSlot(contract, slotId)
  if (!slot)
    return undefined
  return normalizeBindings(bindings).find(binding => (binding.bindIndex ?? 0) === slot.bindIndex)
}

export function swapMaterialDataSlotBindings(
  contract: MaterialDataContract,
  bindings: BindingRef | BindingRef[] | undefined,
  fromSlotId: string,
  toSlotId: string,
): BindingRef[] {
  if (fromSlotId === toSlotId)
    return normalizeBindings(bindings).sort(sortByBindIndex)

  const fromSlot = findContractSlot(contract, fromSlotId)
  const toSlot = findContractSlot(contract, toSlotId)
  if (!fromSlot || !toSlot)
    return normalizeBindings(bindings).sort(sortByBindIndex)

  return normalizeBindings(bindings)
    .map((binding) => {
      const slotId = readBindingSlotId(contract, binding)
      if (slotId === fromSlotId)
        return retargetSlotBinding(binding, toSlot)
      if (slotId === toSlotId)
        return retargetSlotBinding(binding, fromSlot)
      return binding
    })
    .sort(sortByBindIndex)
}

export function normalizeMaterialDataBindings(bindings: BindingRef | BindingRef[] | undefined): BindingRef[] {
  return normalizeBindings(bindings)
}

function findSlotBinding(bindings: BindingRef[], slot: MaterialDataSlot): BindingRef | undefined {
  return bindings.find(binding => (binding.bindIndex ?? 0) === slot.bindIndex)
}

function createSlotBinding(
  slot: MaterialDataSlot,
  field: MaterialDataBindingField,
  fieldPath: string,
  fieldLabel: string | undefined,
): BindingRef {
  return {
    sourceId: field.sourceId,
    sourceName: field.sourceName,
    sourceTag: field.sourceTag,
    fieldPath,
    fieldKey: fieldPath === field.fieldPath ? field.fieldKey : undefined,
    fieldLabel: fieldLabel || fieldPath,
    format: field.format ? deepClone(field.format) : undefined,
    bindIndex: slot.bindIndex,
  }
}

function replaceSlotBinding(
  contract: MaterialDataContract,
  bindings: BindingRef[],
  next: BindingRef,
  slot: MaterialDataSlot,
): BindingRef[] {
  const remaining = bindings.filter(binding =>
    readBindingSlotId(contract, binding) !== slot.id && (binding.bindIndex ?? 0) !== slot.bindIndex,
  )
  return [...remaining, next].sort((a, b) => (a.bindIndex ?? 0) - (b.bindIndex ?? 0))
}

function findContractSlot(contract: MaterialDataContract, slotId: string): MaterialDataSlot | undefined {
  return contract.slots.find(slot => slot.id === slotId)
}

function retargetSlotBinding(binding: BindingRef, slot: MaterialDataSlot): BindingRef {
  const next: BindingRef = {
    ...binding,
    bindIndex: slot.bindIndex,
  }
  next.fieldLabel = stripSlotLabel(binding.fieldLabel) || binding.fieldPath
  return next
}

function readBindingSlotId(contract: MaterialDataContract, binding: BindingRef): string {
  return contract.slots.find(slot => (binding.bindIndex ?? 0) === slot.bindIndex)?.id ?? ''
}

function stripSlotLabel(label: string | undefined): string | undefined {
  if (!label)
    return undefined
  const index = label.indexOf(':')
  if (index < 0)
    return label
  return label.slice(index + 1)
}

function normalizeBindings(bindings: BindingRef | BindingRef[] | undefined): BindingRef[] {
  if (!bindings)
    return []
  return Array.isArray(bindings) ? bindings : [bindings]
}

function normalizePath(path: string | undefined): string | undefined {
  return path?.split(FIELD_PATH_SEPARATOR).filter(Boolean).join(FIELD_PATH_SEPARATOR)
}

function inferParentPath(fieldPath: string): string | undefined {
  const normalized = normalizePath(fieldPath)
  if (!normalized)
    return undefined
  const index = normalized.lastIndexOf(FIELD_PATH_SEPARATOR)
  if (index <= 0)
    return undefined
  return normalized.slice(0, index)
}

function sortByBindIndex(a: BindingRef, b: BindingRef): number {
  return (a.bindIndex ?? 0) - (b.bindIndex ?? 0)
}
