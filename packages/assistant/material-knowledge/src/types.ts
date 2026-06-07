import type { MaterialNode } from '@easyink/schema'

export type MaterialCategory = 'data' | 'layout' | 'decoration' | 'typography' | 'visualization'
export type BindingMode = 'none' | 'scalar' | 'collection' | 'multi-scalar'
export type FieldType = 'string' | 'number' | 'boolean' | 'date' | 'image-url' | 'array' | 'object'
export type ConstraintSeverity = 'error' | 'warning'

export interface MaterialKnowledge {
  type: string
  category: MaterialCategory
  description: string
  constraints: MaterialConstraint[]
  composability: MaterialComposability
  bindingSpec: MaterialBindingSpec
  sizing: MaterialSizing
  fitness: ScenarioFitness[]
  properties: MaterialPropertySpec[]
  requiredProps: string[]
}

export interface MaterialConstraint {
  id: string
  severity: ConstraintSeverity
  check: (node: MaterialNode, context: ConstraintContext) => ConstraintResult
  message: string
  autoFix?: (node: MaterialNode, context: ConstraintContext) => MaterialNode | null
}

export interface ConstraintContext {
  pageWidth: number
  pageHeight: number
  pageMode: 'fixed' | 'continuous'
  unit: string
  siblingTypes: string[]
  parentType?: string
  dataFields?: DataFieldInfo[]
}

export interface ConstraintResult {
  passed: boolean
  details?: string
}

export interface MaterialComposability {
  canBeChildOf: string[]
  canContain: string[]
  exclusiveWith: string[]
  preferredCompanions: string[]
}

export interface MaterialBindingSpec {
  mode: BindingMode
  accepts: FieldTypeConstraint
  produces: BindingShape
  examples: BindingExample[]
}

export interface FieldTypeConstraint {
  types: FieldType[]
  isArray?: boolean
  minChildren?: number
  requiredChildFields?: string[]
}

export interface BindingShape {
  kind: 'scalar-field' | 'collection-repeat' | 'multi-field' | 'none'
  fieldCount?: 'single' | 'multiple' | 'dynamic'
  pathPattern?: string
}

export interface BindingExample {
  scenario: string
  binding: Record<string, unknown>
  fieldStructure: Record<string, unknown>
}

export interface ScenarioFitness {
  scenario: string
  score: number
  reason: string
}

export interface MaterialSizing {
  minWidth: number
  minHeight: number
  aspectRatio?: number | 'free'
  growAxis?: 'x' | 'y' | 'both' | 'none'
  defaultSize: { width: number, height: number }
}

export interface MaterialPropertySpec {
  key: string
  type: 'string' | 'number' | 'boolean' | 'enum' | 'color' | 'object' | 'array' | 'code'
  required: boolean
  defaultValue?: unknown
  enumValues?: string[]
  description?: string
}

export interface DataFieldInfo {
  path: string
  type: FieldType
  isArray: boolean
  children?: DataFieldInfo[]
}

export interface MaterialQuery {
  scenario?: string
  bindingMode?: BindingMode
  dataShape?: DataFieldInfo
  parentType?: string
  category?: MaterialCategory
}

export interface MaterialQueryResult {
  type: string
  score: number
  reason: string
  bindingSpec: MaterialBindingSpec
}

export interface MaterialCompatibility {
  compatible: boolean
  warnings: string[]
  suggestions?: string[]
}
