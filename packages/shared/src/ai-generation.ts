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
 * Optional generation plan shared between the AI panel and the mcp-server.
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
  binding?: 'none' | 'single' | 'multi'
  usage?: string[]
  schemaRules?: string[]
  examples?: Array<Record<string, unknown>>
}
