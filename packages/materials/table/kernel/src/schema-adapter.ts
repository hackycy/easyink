import type {
  AdaptableMaterialNode,
  MaterialIntrospection,
  MaterialSchemaIssue,
  SchemaAdapter,
  SchemaAdapterContext,
} from '@easyink/core'
import type { MaterialNode } from '@easyink/schema'
import type { JsonValue, UnitType } from '@easyink/shared'
import type { TableModel, TableStyle } from './model'
import { cloneJsonValue, convertUnit } from '@easyink/shared'
import { assertValidTableModel } from './model'
import { decodeTableModelV1 } from './model-codec'

const NODE_KEYS = [
  'id',
  'type',
  'x',
  'y',
  'width',
  'height',
  'rotation',
  'alpha',
  'zIndex',
  'modelVersion',
  'model',
  'slots',
  'bindings',
  'editorState',
  'output',
  'extensions',
  'compat',
] as const

export const tableSchemaAdapter: SchemaAdapter = {
  currentModelVersion: 1,
  modelUnitPolicy: 'convertible',
  migrations: [],
  validateInput(node) {
    const model = ownData(node, 'model')
    if (!model.ok)
      return [issue('TABLE_MODEL_STRUCTURE_INVALID', '/model', 'Table model must be an own data property')]
    return decodeTableModelV1(model.value, '/model').issues
  },
  normalize(node) {
    const clone = cloneJsonValue(node as unknown as JsonValue) as unknown as AdaptableMaterialNode
    const normalized: Record<string, unknown> = {}
    for (const key of NODE_KEYS) {
      const descriptor = Object.getOwnPropertyDescriptor(clone, key)
      if (descriptor && 'value' in descriptor)
        normalized[key] = descriptor.value
    }
    const decoded = decodeTableModelV1(normalized.model, '/model')
    if (decoded.value)
      normalized.model = decoded.value as unknown as Record<string, unknown>
    return normalized as unknown as AdaptableMaterialNode
  },
  validate(node, context) {
    const modelProperty = ownData(node, 'model')
    if (!modelProperty.ok)
      return [issue('TABLE_MODEL_STRUCTURE_INVALID', '/model', 'Table model must be an own data property')]
    const decoded = decodeTableModelV1(modelProperty.value, '/model')
    if (!decoded.value)
      return decoded.issues
    const model = decoded.value
    const issues: MaterialSchemaIssue[] = []
    try {
      assertValidTableModel(model)
    }
    catch (error) {
      const detailShape = model.kind === 'data'
        && (model.bands.filter(band => band.role === 'detail').length !== 1
          || model.bands.some(band => band.role === 'detail' && band.rows.length !== 1))
      issues.push(issue(
        'TABLE_MODEL_INVALID',
        detailShape ? '/model/bands' : '/model',
        error instanceof Error ? error.message : 'Table model topology is invalid',
      ))
      return issues
    }
    const expectedKind = expectedKindFor(node, context)
    if (expectedKind && model.kind !== expectedKind)
      issues.push(issue('TABLE_MODEL_KIND_MISMATCH', '/model/kind', 'Table model kind does not match its material type'))
    validateEnvelope(node, model, issues)
    return issues
  },
  introspect(node) {
    const decoded = decodeTableModelV1(node.model, '/model')
    if (!decoded.value)
      return emptyIntrospection()
    return introspectTable(node, decoded.value)
  },
  convertModelUnits(model, from, to) {
    const decoded = decodeTableModelV1(model, '/model')
    if (!decoded.value)
      throw new Error('TABLE_MODEL_STRUCTURE_INVALID')
    const converted = decoded.value
    for (const column of converted.columns) {
      if (column.track.kind === 'fixed')
        column.track.size = length(column.track.size, from, to)
      if (column.track.min !== undefined)
        column.track.min = length(column.track.min, from, to)
      if (column.track.max !== undefined)
        column.track.max = length(column.track.max, from, to)
      convertStyle(column.style, from, to)
    }
    convertStyle(converted.style, from, to)
    for (const band of converted.bands) {
      convertStyle(band.style, from, to)
      for (const row of band.rows) {
        row.minHeight = length(row.minHeight, from, to)
        convertStyle(row.style, from, to)
        for (const cell of row.cells)
          convertStyle(cell.style, from, to)
      }
    }
    return converted as unknown as Record<string, unknown>
  },
}

function validateEnvelope(node: AdaptableMaterialNode, model: TableModel, issues: MaterialSchemaIssue[]): void {
  const expectedSlots = new Map<string, string>()
  const ports = new Set<string>()
  for (const band of model.bands) {
    for (const row of band.rows) {
      for (const cell of row.cells) {
        if (cell.content.kind === 'materials')
          expectedSlots.set(cell.content.slotId, cell.id)
        else if (cell.content.bindingPort)
          ports.add(cell.content.bindingPort)
      }
    }
  }
  if (model.kind === 'data') {
    ports.add(model.data.collectionPort)
    if (model.data.detailKeyPort)
      ports.add(model.data.detailKeyPort)
  }

  const slots = ownRecord(node, 'slots', '/slots', issues)
  if (slots) {
    for (const slot of expectedSlots.keys()) {
      if (!Object.hasOwn(slots, slot))
        issues.push(issue('TABLE_SLOT_MISSING', pointer('/slots', slot), `Required table cell slot is missing: ${slot}`))
    }
    for (const key of Object.keys(slots)) {
      const descriptor = Object.getOwnPropertyDescriptor(slots, key)
      if (!descriptor || !('value' in descriptor) || !Array.isArray(descriptor.value)
        || !expectedSlots.has(key) || key.length > 256) {
        issues.push(issue('TABLE_SLOT_ORPHAN', pointer('/slots', key), `Table slot is orphaned or malformed: ${key}`))
      }
    }
  }
  else {
    for (const slot of expectedSlots.keys())
      issues.push(issue('TABLE_SLOT_MISSING', pointer('/slots', slot), `Required table cell slot is missing: ${slot}`))
  }

  const bindings = ownRecord(node, 'bindings', '/bindings', issues)
  if (!bindings)
    return
  for (const key of Object.keys(bindings)) {
    const path = pointer('/bindings', key)
    const descriptor = Object.getOwnPropertyDescriptor(bindings, key)
    if (!ports.has(key))
      issues.push(issue('TABLE_BINDING_ORPHAN', path, `Binding port is not declared by the table model: ${key}`))
    if (!descriptor || !('value' in descriptor)) {
      issues.push(issue('TABLE_BINDING_INVALID', path, 'Table binding must be an own data property'))
      continue
    }
    if (Array.isArray(descriptor.value)) {
      issues.push(issue('TABLE_BINDING_SCALAR_REQUIRED', path, 'Table named binding ports require a scalar binding expression'))
      continue
    }
    if (!isBindingExpression(descriptor.value))
      issues.push(issue('TABLE_BINDING_INVALID', path, 'Table binding expression is invalid'))
  }
}

function introspectTable(node: MaterialNode, model: TableModel): MaterialIntrospection {
  const identities: MaterialIntrospection['identities'][number][] = []
  const references: MaterialIntrospection['references'][number][] = []
  const structures: MaterialIntrospection['structures'][number][] = []
  const resources: MaterialIntrospection['resources'][number][] = []
  const bindings: MaterialIntrospection['bindings'][number][] = []
  const target = (kind: string) => ({ scope: 'material' as const, kind: `table.${kind}` })
  model.columns.forEach((column, columnIndex) => {
    identities.push(identity(`/model/columns/${columnIndex}/id`, column.id, target('column')))
    collectFont(column.style, `/model/columns/${columnIndex}/style`, resources)
  })
  model.bands.forEach((band, bandIndex) => {
    identities.push(identity(`/model/bands/${bandIndex}/id`, band.id, target('band')))
    collectFont(band.style, `/model/bands/${bandIndex}/style`, resources)
    band.rows.forEach((row, rowIndex) => {
      const rowPath = `/model/bands/${bandIndex}/rows/${rowIndex}` as const
      identities.push(identity(`${rowPath}/id`, row.id, target('row')))
      collectFont(row.style, `${rowPath}/style`, resources)
      row.cells.forEach((cell, cellIndex) => {
        const cellPath = `${rowPath}/cells/${cellIndex}` as const
        identities.push(identity(`${cellPath}/id`, cell.id, target('cell')))
        references.push(reference(`${cellPath}/columnId`, cell.columnId, target('column')))
        collectFont(cell.style, `${cellPath}/style`, resources)
        if (cell.content.kind === 'materials') {
          references.push({
            ...reference(`${cellPath}/content/slotId`, cell.id, target('cell')),
            encoding: { prefix: 'cell:' },
          })
          const slotPath = pointer('/slots', cell.content.slotId)
          references.push({
            path: slotPath,
            location: 'key',
            encoding: { prefix: 'cell:' },
            value: cell.id,
            target: target('cell'),
            required: true,
          })
          structures.push({
            path: slotPath,
            slot: cell.content.slotId,
            children: node.slots[cell.content.slotId] ?? [],
            policyId: 'table-cell-free',
            coordinateSpace: 'slot',
            layoutParticipation: 'owner',
            reparent: 'allowed',
          })
        }
      })
    })
  })
  model.merges.forEach((merge, mergeIndex) => {
    const mergePath = `/model/merges/${mergeIndex}` as const
    identities.push(identity(`${mergePath}/id`, merge.id, target('merge')))
    references.push(reference(`${mergePath}/anchorCellId`, merge.anchorCellId, target('cell')))
    merge.rowIds.forEach((id, index) => references.push(reference(`${mergePath}/rowIds/${index}`, id, target('row'))))
    merge.columnIds.forEach((id, index) => references.push(reference(`${mergePath}/columnIds/${index}`, id, target('column'))))
    merge.inactiveCellIds.forEach((id, index) => references.push(reference(`${mergePath}/inactiveCellIds/${index}`, id, target('cell'))))
  })
  collectFont(model.style, '/model/style', resources)

  const namedPorts = declaredPorts(model)
  for (const port of [...namedPorts].sort()) {
    const expression = node.bindings[port]
    if (isBindingExpression(expression))
      bindings.push({ path: pointer('/bindings', port), value: expression, port })
  }
  return { identities, structures, references, resources, bindings }
}

function declaredPorts(model: TableModel): Set<string> {
  const ports = new Set<string>()
  for (const band of model.bands) {
    for (const row of band.rows) {
      for (const cell of row.cells) {
        if (cell.content.kind === 'text' && cell.content.bindingPort)
          ports.add(cell.content.bindingPort)
      }
    }
  }
  if (model.kind === 'data') {
    ports.add(model.data.collectionPort)
    if (model.data.detailKeyPort)
      ports.add(model.data.detailKeyPort)
  }
  return ports
}

function collectFont(style: TableStyle | undefined, base: `/${string}`, resources: MaterialIntrospection['resources'][number][]): void {
  const font = style?.typography?.fontFamily
  if (font)
    resources.push({ path: `${base}/typography/fontFamily`, value: font, kind: 'font' })
}

function identity(path: `/${string}`, value: string, target: { scope: 'material', kind: string }): MaterialIntrospection['identities'][number] {
  return { path, location: 'value', value, target }
}

function reference(path: `/${string}`, value: string, target: { scope: 'material', kind: string }): MaterialIntrospection['references'][number] {
  return { path, location: 'value', value, target, required: true }
}

function convertStyle(style: TableStyle | undefined, from: UnitType, to: UnitType): void {
  if (!style)
    return
  if (style.padding) {
    for (const key of ['top', 'right', 'bottom', 'left'] as const) {
      if (style.padding[key] !== undefined)
        style.padding[key] = length(style.padding[key]!, from, to)
    }
  }
  if (style.typography?.fontSize !== undefined)
    style.typography.fontSize = length(style.typography.fontSize, from, to)
  if (style.typography?.letterSpacing !== undefined)
    style.typography.letterSpacing = length(style.typography.letterSpacing, from, to)
  if (style.border) {
    for (const side of ['blockStart', 'inlineEnd', 'blockEnd', 'inlineStart'] as const) {
      if (style.border[side])
        style.border[side]!.width = length(style.border[side]!.width, from, to)
    }
  }
}

function length(value: number, from: UnitType, to: UnitType): number {
  return convertUnit(value, from, to)
}

function expectedKindFor(node: AdaptableMaterialNode, context: SchemaAdapterContext): TableModel['kind'] | undefined {
  const typeProperty = ownData(node, 'type')
  const type = typeProperty.ok && typeof typeProperty.value === 'string' ? typeProperty.value : context.materialType
  if (type === 'table-static')
    return 'static'
  if (type === 'table-data')
    return 'data'
  return undefined
}

function ownRecord(node: object, key: string, path: `/${string}`, issues: MaterialSchemaIssue[]): Record<string, unknown> | undefined {
  const property = ownData(node, key)
  if (!property.ok) {
    issues.push(issue(key === 'slots' ? 'TABLE_SLOT_ORPHAN' : 'TABLE_BINDING_INVALID', path, `${key} must be a plain record`))
    return undefined
  }
  try {
    if (typeof property.value !== 'object' || property.value === null || Array.isArray(property.value))
      throw new Error('record required')
    const prototype = Object.getPrototypeOf(property.value)
    if (prototype !== Object.prototype && prototype !== null)
      throw new Error('plain record required')
    const descriptors = Object.getOwnPropertyDescriptors(property.value)
    const snapshot: Record<string, unknown> = {}
    for (const token of Reflect.ownKeys(descriptors)) {
      if (typeof token !== 'string' || ['__proto__', 'prototype', 'constructor'].includes(token))
        throw new Error('unsafe record key')
      const descriptor = Object.getOwnPropertyDescriptor(descriptors, token)?.value as PropertyDescriptor | undefined
      if (!descriptor || !('value' in descriptor) || !descriptor.enumerable)
        throw new Error('data property required')
      Object.defineProperty(snapshot, token, {
        value: descriptor.value,
        enumerable: true,
        configurable: true,
        writable: true,
      })
    }
    return snapshot
  }
  catch {
    issues.push(issue(key === 'slots' ? 'TABLE_SLOT_ORPHAN' : 'TABLE_BINDING_INVALID', path, `${key} must be a plain record of data properties`))
    return undefined
  }
}

function ownData(node: object, key: string): { ok: true, value: unknown } | { ok: false } {
  try {
    const descriptor = Object.getOwnPropertyDescriptor(node, key)
    return descriptor && 'value' in descriptor ? { ok: true, value: descriptor.value } : { ok: false }
  }
  catch {
    return { ok: false }
  }
}

function plainRecord(value: unknown): value is Record<string, unknown> {
  try {
    if (typeof value !== 'object' || value === null || Array.isArray(value))
      return false
    const prototype = Object.getPrototypeOf(value)
    return prototype === Object.prototype || prototype === null
  }
  catch {
    return false
  }
}

function isBindingExpression(value: unknown): value is MaterialIntrospection['bindings'][number]['value'] {
  if (!plainRecord(value))
    return false
  try {
    const descriptors = Object.getOwnPropertyDescriptors(value)
    const sourceId = Object.getOwnPropertyDescriptor(descriptors, 'sourceId')?.value as PropertyDescriptor | undefined
    const fieldPath = Object.getOwnPropertyDescriptor(descriptors, 'fieldPath')?.value as PropertyDescriptor | undefined
    return sourceId !== undefined
      && fieldPath !== undefined
      && 'value' in sourceId
      && 'value' in fieldPath
      && typeof sourceId.value === 'string'
      && typeof fieldPath.value === 'string'
      && !Object.hasOwn(descriptors, 'kind')
  }
  catch {
    return false
  }
}

function issue(code: string, path: `/${string}`, message: string): MaterialSchemaIssue {
  return { code, severity: 'error', path, message }
}

function pointer(root: `/${string}`, token: string): `/${string}` {
  return `${root}/${token.replaceAll('~', '~0').replaceAll('/', '~1')}`
}

function emptyIntrospection(): MaterialIntrospection {
  return { identities: [], structures: [], references: [], resources: [], bindings: [] }
}
