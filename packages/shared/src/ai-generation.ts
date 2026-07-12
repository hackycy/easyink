import type { PageMode } from './types'

export type AIGenerationDomain = string

export interface AIPageAssumption {
  mode: PageMode
  width: number
  height: number
  unit: 'mm'
  reason: string
}

/**
 * Optional generation plan shared by Assistant-driven template generation flows.
 * Callers may supply one when the user has already confirmed paper or table
 * constraints; otherwise the schema generator infers them directly from the
 * prompt and source data.
 */
export interface AIGenerationPlan {
  domain: AIGenerationDomain
  confidence: 'high' | 'medium' | 'low'
  page: AIPageAssumption
  fieldNaming: 'english-camel-path-chinese-label'
  tableStrategy: 'table-data-for-arrays' | 'table-static-for-fixed' | 'avoid-table'
  sampleData: 'required'
  materialHints: string[]
  warnings: string[]
}

export interface AIMaterialDescriptor {
  type: string
  description: string
  properties: string[]
  requiredProps?: string[]
  bindings?: 'none' | 'single' | 'multi' | 'data-contract'
  usage?: string[]
  schemaRules?: string[]
  examples?: Array<Record<string, unknown>>
  knowledge?: MaterialKnowledgeDescriptor
}

export type MaterialKnowledgeCategory = 'data' | 'layout' | 'decoration' | 'typography' | 'visualization'
export type MaterialKnowledgeFieldType = 'string' | 'number' | 'boolean' | 'date' | 'image-url' | 'array' | 'object'
export type MaterialKnowledgeBindingMode = 'none' | 'scalar' | 'collection' | 'multi-scalar'

export interface MaterialKnowledgeDescriptor {
  category: MaterialKnowledgeCategory
  composability: {
    canBeChildOf: string[]
    canContain: string[]
    exclusiveWith: string[]
    preferredCompanions: string[]
  }
  bindingSpec: {
    mode: MaterialKnowledgeBindingMode
    accepts: {
      types: MaterialKnowledgeFieldType[]
      isArray?: boolean
      minChildren?: number
      requiredChildFields?: string[]
    }
    produces: {
      kind: 'scalar-field' | 'collection-repeat' | 'multi-field' | 'none'
      fieldCount?: 'single' | 'multiple' | 'dynamic'
      pathPattern?: string
    }
    examples?: Array<{
      scenario: string
      bindings: Record<string, unknown>
      fieldStructure: Record<string, unknown>
    }>
  }
  sizing: {
    minWidth: number
    minHeight: number
    aspectRatio?: number | 'free'
    growAxis?: 'x' | 'y' | 'both' | 'none'
    defaultSize: { width: number, height: number }
  }
  fitness?: Array<{
    scenario: string
    score: number
    reason: string
  }>
  properties?: Array<{
    key: string
    type: 'string' | 'number' | 'boolean' | 'enum' | 'color' | 'object' | 'array' | 'code'
    required: boolean
    defaultValue?: unknown
    enumValues?: string[]
    description?: string
  }>
}
