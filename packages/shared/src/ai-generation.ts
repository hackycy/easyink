import type { PageMode } from './types'

/**
 * Domain identifier of an AI-generated template. Builtin domains are listed
 * for autocomplete; the type accepts arbitrary strings so that external
 * profiles can introduce their own domains without changing this file.
 */
export type AIGenerationDomain
  = | 'supermarket-receipt'
    | 'restaurant-receipt'
    | 'business-document'
    | 'certificate'
    | 'generic'
    | (string & {})

export interface AIPageAssumption {
  mode: PageMode
  width: number
  height: number
  unit: 'mm'
  reason: string
}

/**
 * Compact projection of a domain's required field used to give the intent
 * stage a concrete checklist. Carrying it on the plan keeps the prompt
 * grounded in deterministic facts instead of relying on the LLM to recall
 * domain conventions from its training data.
 */
export interface DomainFieldHint {
  name: string
  path: string
  type: 'string' | 'number' | 'boolean' | 'array' | 'object'
  required: boolean
  title?: string
  children?: DomainFieldHint[]
}

/**
 * Deterministic generation plan shared between the AI panel and the
 * mcp-server. The plan is derived (by keyword inference, by an LLM call,
 * or supplied by the caller) before the intent stage so that paper size,
 * table strategy, and material hints are not left to the LLM that builds
 * the schema.
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
  /**
   * Required-field checklist projected from the resolved domain profile.
   * The intent stage relies on this list to avoid skipping structurally
   * essential fields (e.g. a receipt without items+total). Empty when no
   * domain profile is registered for the resolved domain.
   */
  requiredFieldHints?: DomainFieldHint[]
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
