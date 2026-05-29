import type { DataSourceDescriptor } from '@easyink/datasource'
import type { DocumentSchema, ExpectedDataSource } from '@easyink/schema'
import type { AIGenerationPlan } from '@easyink/shared'
import { z } from 'zod'

export const AssistantWorkflowStepSchema = z.enum([
  'idle',
  'intake',
  'plan',
  'source',
  'compose',
  'validate',
  'repair',
  'review',
  'done',
  'failed',
])

export type AssistantWorkflowStep = z.infer<typeof AssistantWorkflowStepSchema>

export const AssistantSourceKindSchema = z.enum(['none', 'json', 'http', 'curl', 'file'])

export type AssistantSourceKind = z.infer<typeof AssistantSourceKindSchema>

export const AssistantSourceInputSchema = z.object({
  kind: AssistantSourceKindSchema,
  content: z.string().optional(),
  url: z.string().url().optional(),
  fileName: z.string().optional(),
  headers: z.record(z.string()).optional(),
  method: z.string().optional(),
})

export type AssistantSourceInput = z.infer<typeof AssistantSourceInputSchema>

export const AssistantTaskInputSchema = z.object({
  prompt: z.string().min(1),
  source: AssistantSourceInputSchema.optional(),
  constraints: z.record(z.unknown()).optional(),
  currentSchema: z.unknown().optional(),
})

export type AssistantTaskInput = z.infer<typeof AssistantTaskInputSchema>

export interface SchemaCandidate {
  schema: DocumentSchema
  expectedDataSource: ExpectedDataSource
  dataSource: DataSourceDescriptor
  plan: AIGenerationPlan
  warnings: string[]
}

export interface AssistantPatchOperation {
  op: 'add' | 'remove' | 'replace'
  path: string
  value?: unknown
}

export interface AssistantSchemaDiff {
  changed: boolean
  operations: AssistantPatchOperation[]
  summary: string[]
}

export interface AssistantValidationIssue {
  code: string
  message: string
  path?: string
  location?: string
}

export interface AssistantValidationReport {
  valid: boolean
  errors: AssistantValidationIssue[]
  warnings: AssistantValidationIssue[]
  autoFixed: Array<{
    path: string
    reason: string
    original: unknown
    fixed: unknown
  }>
}

export interface AssistantResult {
  id: string
  schema: DocumentSchema
  dataSource?: DataSourceDescriptor
  patch: AssistantPatchOperation[]
  diff: AssistantSchemaDiff
  validation: AssistantValidationReport
  preview: AssistantPreview
  createdAt: number
}

export interface AssistantPreview {
  title: string
  page: {
    mode: DocumentSchema['page']['mode']
    width: number
    height: number
    unit: DocumentSchema['unit']
  }
  elementCount: number
  dataFieldCount: number
  warnings: string[]
}
