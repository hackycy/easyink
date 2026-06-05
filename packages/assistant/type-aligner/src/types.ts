import type { BindingMode, FieldType } from '@easyink/assistant-material-knowledge'

export interface DataTypeSignature {
  name: string
  fields: TypedField[]
}

export interface TypedField {
  path: string
  name: string
  title?: string
  type: FieldType
  itemType?: FieldType
  isArray: boolean
  children?: TypedField[]
}

export interface RequiredDataShape {
  materialType: string
  bindingMode: BindingMode
  fields: RequiredField[]
}

export interface RequiredField {
  role: string
  acceptTypes: FieldType[]
  isArray: boolean
  required: boolean
}

export interface AlignmentResult {
  matched: FieldMapping[]
  unmatched: UnmatchedField[]
  missing: MissingField[]
  transforms: FieldTransform[]
  confidence: number
}

export interface FieldMapping {
  sourcePath: string
  targetRole: string
  sourceType: FieldType
  targetType: FieldType
  confidence: number
}

export interface UnmatchedField {
  path: string
  type: FieldType
  reason: string
}

export interface MissingField {
  role: string
  acceptTypes: FieldType[]
  required: boolean
}

export interface FieldTransform {
  sourcePath: string
  sourceType: FieldType
  targetType: FieldType
  transform: string
}

export interface GeneratedBindingRef {
  sourceId: string
  sourceName: string
  fieldPath: string
  fieldLabel?: string
}

export interface GeneratedDataContractFieldMapping {
  sourceId: string
  sourceName: string
  select: {
    path: string
    label?: string
  }
}

export interface GeneratedDataContractBinding {
  kind: 'data-contract'
  mappings: Record<string, GeneratedDataContractFieldMapping>
  relation: { kind: 'auto' }
}

export type GeneratedMaterialBinding
  = | { kind: 'none' }
    | { kind: 'binding-ref', binding: GeneratedBindingRef }
    | { kind: 'collection-path', collectionPath: string, fields: Record<string, string> }
    | { kind: 'data-contract', binding: GeneratedDataContractBinding }
