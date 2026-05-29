import type { DataSourceDescriptor } from '@easyink/datasource'
import type { DocumentSchema, ExpectedDataSource } from '@easyink/schema'
import type { AIGenerationPlan, AIMaterialDescriptor } from '@easyink/shared'
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

export const AssistantMaterialCapabilitiesSchema = z.object({
  bindable: z.boolean().optional(),
  rotatable: z.boolean().optional(),
  resizable: z.boolean().optional(),
  supportsChildren: z.boolean().optional(),
  supportsAnimation: z.boolean().optional(),
  supportsUnionDrop: z.boolean().optional(),
  pageAware: z.boolean().optional(),
  multiBinding: z.boolean().optional(),
  keepAspectRatio: z.boolean().optional(),
})

export type AssistantMaterialCapabilities = z.infer<typeof AssistantMaterialCapabilitiesSchema>

export const AssistantMaterialPropSchema = z.object({
  key: z.string(),
  label: z.string(),
  type: z.string(),
  group: z.string().optional(),
  default: z.unknown().optional(),
  enum: z.array(z.object({ label: z.string(), value: z.unknown() })).optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  step: z.number().optional(),
  nullable: z.boolean().optional(),
  editor: z.string().optional(),
  editorOptions: z.record(z.unknown()).optional(),
})

export type AssistantMaterialProp = z.infer<typeof AssistantMaterialPropSchema>

export const AssistantAIMaterialDescriptorSchema = z.object({
  type: z.string(),
  description: z.string(),
  properties: z.array(z.string()),
  requiredProps: z.array(z.string()).optional(),
  binding: z.enum(['none', 'single', 'multi']).optional(),
  usage: z.array(z.string()).optional(),
  schemaRules: z.array(z.string()).optional(),
  examples: z.array(z.record(z.unknown())).optional(),
}) satisfies z.ZodType<AIMaterialDescriptor>

export type AssistantAIMaterialDescriptor = z.infer<typeof AssistantAIMaterialDescriptorSchema>

export const AssistantMaterialManifestEntrySchema = z.object({
  type: z.string(),
  name: z.string(),
  capabilities: AssistantMaterialCapabilitiesSchema,
  props: z.array(AssistantMaterialPropSchema).optional(),
  ai: AssistantAIMaterialDescriptorSchema.optional(),
})

export type AssistantMaterialManifestEntry = z.infer<typeof AssistantMaterialManifestEntrySchema>

export const AssistantMaterialManifestSchema = z.object({
  materials: z.array(AssistantMaterialManifestEntrySchema),
})

export type AssistantMaterialManifest = z.infer<typeof AssistantMaterialManifestSchema>

export const AssistantTaskInputSchema = z.object({
  prompt: z.string().min(1),
  source: AssistantSourceInputSchema.optional(),
  constraints: z.record(z.unknown()).optional(),
  currentSchema: z.unknown().optional(),
  materialManifest: AssistantMaterialManifestSchema.optional(),
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

export type AssistantPatchApplyMode = 'full' | 'new-elements' | 'selected-elements'

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
