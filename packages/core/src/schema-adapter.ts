import type { MaterialNode, MaterialNodeInput } from '@easyink/schema'
import type { UnitType } from '@easyink/shared'
import type { MaterialIntrospection } from './material-introspection'

export interface SchemaAdapterContext {
  documentVersion: string
  sourceUnit: UnitType
  documentUnit: UnitType
  materialType: string
}

export interface MaterialSchemaIssue {
  code: string
  severity: 'error' | 'warning'
  path: `/${string}`
  message: string
}

export interface AdaptableMaterialNode extends Omit<MaterialNode, 'slots'> {
  slots?: Record<string, MaterialNodeInput[]>
}

export interface SchemaMigration {
  from: number
  to: number
  migrate: (node: AdaptableMaterialNode, context: SchemaAdapterContext) => AdaptableMaterialNode
}

export interface SchemaAdapter {
  currentModelVersion: number
  modelUnitPolicy: 'independent' | 'convertible'
  migrations: readonly SchemaMigration[]
  validateInput: (node: AdaptableMaterialNode, context: SchemaAdapterContext) => readonly MaterialSchemaIssue[]
  normalize: (node: AdaptableMaterialNode, context: SchemaAdapterContext) => AdaptableMaterialNode
  validate: (node: AdaptableMaterialNode, context: SchemaAdapterContext) => readonly MaterialSchemaIssue[]
  introspect: (node: MaterialNode, context: SchemaAdapterContext) => MaterialIntrospection
  convertModelUnits?: (
    model: Readonly<Record<string, unknown>>,
    from: UnitType,
    to: UnitType,
  ) => Record<string, unknown>
}

export function recordSchemaAdapter(currentModelVersion: number): SchemaAdapter {
  if (!Number.isInteger(currentModelVersion) || currentModelVersion < 0)
    throw new Error('MATERIAL_MODEL_VERSION_INVALID')

  return {
    currentModelVersion,
    modelUnitPolicy: 'independent',
    migrations: Array.from({ length: currentModelVersion }, (_, from) => ({
      from,
      to: from + 1,
      migrate: node => ({ ...node, modelVersion: from + 1 }),
    })),
    validateInput: () => [],
    normalize: node => ({ ...node, model: { ...node.model } }),
    validate: () => [],
    introspect: () => ({ identities: [], structures: [], references: [], resources: [], bindings: [] }),
  }
}
