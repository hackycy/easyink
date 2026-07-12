import type { DataSourceDescriptor } from '@easyink/datasource'
import type { DocumentSchema } from '@easyink/schema'
import type { JsonObject, JsonValue } from '@easyink/shared'
import { AssistantPluginSelectionSchema } from '@easyink/assistant-plugins'
import { assertJsonValue, compileJsonSchema, isRfc6901Pointer } from '@easyink/shared'
import { z } from 'zod'

export const AssistantWorkflowStepSchema = z.enum([
  'idle',
  'intake',
  'source',
  'plan',
  'contract',
  'materials',
  'layout',
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

const JsonValueSchema = z.custom<JsonValue>((value) => {
  try {
    assertJsonValue(value)
    return true
  }
  catch {
    return false
  }
}, 'Expected a JSON value')

const JsonObjectSchema = JsonValueSchema.refine(
  (value): value is JsonObject => typeof value === 'object' && value !== null && !Array.isArray(value),
  'Expected a JSON object',
)

const PortableJsonSchema = JsonObjectSchema.superRefine((schema, context) => {
  try {
    compileJsonSchema(schema)
  }
  catch (error) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: error instanceof Error ? error.message : 'Invalid JSON Schema' })
  }
})

export const AssistantMaterialPropSchema = z.object({
  key: z.string(),
  label: z.string(),
  type: z.string(),
  group: z.string().optional(),
  default: JsonValueSchema.optional(),
  enum: z.array(z.object({ label: z.string(), value: JsonValueSchema }).strict()).optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  step: z.number().optional(),
  nullable: z.boolean().optional(),
  editor: z.string().optional(),
  editorOptions: JsonObjectSchema.optional(),
  targetPaths: z.array(z.string()).optional(),
}).strict()

export type AssistantMaterialProp = z.infer<typeof AssistantMaterialPropSchema>

const AssistantBindingFormatEditorSchema = z.object({
  tabs: z.tuple([z.literal('preset')]),
  presetTypes: z.array(z.string()).optional(),
}).strict()

const AssistantMaterialDataContractSchema = z.object({
  version: z.literal(3),
  model: z.object({
    kind: z.literal('tabular'),
    fields: z.record(z.object({
      labelKey: z.string(),
      type: z.enum(['string', 'number', 'boolean', 'date', 'object', 'array']),
      required: z.boolean().optional(),
      format: z.enum(['display', 'raw']).optional(),
      formatEditor: z.union([z.literal(false), AssistantBindingFormatEditorSchema]).optional(),
    }).strict()),
  }).strict(),
}).strict()

const AssistantMaterialBindingPortSchema = z.object({
  id: z.string(),
  key: z.union([
    z.object({ kind: z.enum(['exact', 'prefix']), value: z.string() }).strict(),
    z.object({ kind: z.literal('model'), paths: z.array(z.string()) }).strict(),
  ]),
  role: z.enum(['semantic', 'display']),
  valueShape: z.enum(['scalar', 'record', 'record-array', 'json']),
  modelPath: z.string().optional(),
  formatEditor: z.union([z.literal(false), AssistantBindingFormatEditorSchema]),
}).strict()

export const AssistantMaterialBindingDefinitionSchema = z.union([
  z.object({ kind: z.literal('none') }).strict(),
  z.object({
    kind: z.literal('ports'),
    ports: z.array(AssistantMaterialBindingPortSchema),
    dataContract: AssistantMaterialDataContractSchema.optional(),
  }).strict(),
])

export type AssistantMaterialBindingDefinition = z.infer<typeof AssistantMaterialBindingDefinitionSchema>

export const AssistantAIMaterialDescriptorSchema = z.object({
  type: z.string(),
  description: z.string(),
  properties: z.array(z.string()),
  requiredProps: z.array(z.string()).optional(),
  bindings: z.enum(['none', 'single', 'multi', 'data-contract']).optional(),
  usage: z.array(z.string()).optional(),
  schemaRules: z.array(z.string()).optional(),
  examples: z.array(z.record(z.unknown())).optional(),
  knowledge: z.object({
    category: z.enum(['data', 'layout', 'decoration', 'typography', 'visualization']),
    composability: z.object({
      canBeChildOf: z.array(z.string()),
      canContain: z.array(z.string()),
      exclusiveWith: z.array(z.string()),
      preferredCompanions: z.array(z.string()),
    }),
    bindingSpec: z.object({
      mode: z.enum(['none', 'scalar', 'collection', 'multi-scalar']),
      accepts: z.object({
        types: z.array(z.string()),
        isArray: z.boolean().optional(),
        minChildren: z.number().optional(),
        requiredChildFields: z.array(z.string()).optional(),
      }),
      produces: z.object({
        kind: z.enum(['scalar-field', 'collection-repeat', 'multi-field', 'none']),
        fieldCount: z.enum(['single', 'multiple', 'dynamic']).optional(),
        pathPattern: z.string().optional(),
      }),
      examples: z.array(z.object({
        scenario: z.string(),
        bindings: z.record(z.unknown()),
        fieldStructure: z.record(z.unknown()),
      })).optional(),
    }),
    sizing: z.object({
      minWidth: z.number(),
      minHeight: z.number(),
      aspectRatio: z.union([z.number(), z.literal('free')]).optional(),
      growAxis: z.enum(['x', 'y', 'both', 'none']).optional(),
      defaultSize: z.object({ width: z.number(), height: z.number() }),
    }),
    fitness: z.array(z.object({
      scenario: z.string(),
      score: z.number(),
      reason: z.string(),
    })).optional(),
    properties: z.array(z.object({
      key: z.string(),
      type: z.enum(['string', 'number', 'boolean', 'enum', 'color', 'object', 'array', 'code']),
      required: z.boolean(),
      defaultValue: z.unknown().optional(),
      enumValues: z.array(z.string()).optional(),
      description: z.string().optional(),
    })).optional(),
  }).optional(),
})

export type AssistantAIMaterialDescriptor = z.infer<typeof AssistantAIMaterialDescriptorSchema>

const AssistantMaterialDefaultNodeSchema = z.object({
  width: z.number(),
  height: z.number(),
  unit: z.enum(['mm', 'pt', 'px', 'inch']),
  model: JsonObjectSchema,
  bindings: JsonObjectSchema.optional(),
  output: JsonObjectSchema.optional(),
}).strict()

const AssistantMaterialInteractionSchema = z.object({
  rotatable: z.boolean(),
  resizable: z.boolean(),
  keepAspectRatio: z.boolean().optional(),
  supportsAnimation: z.boolean().optional(),
  supportsUnionDrop: z.boolean().optional(),
}).strict()

const AssistantMaterialLayoutSchema = z.object({
  intrinsicSize: z.enum(['none', 'width', 'height', 'both']),
  fragmentation: z.enum(['none', 'break-opportunities']),
  pageRepeat: z.enum(['none', 'every-output-page']),
  overflow: z.enum(['visible', 'clip']),
}).strict()

const AssistantMaterialStructureSchema = z.object({
  slots: z.array(z.object({
    id: z.string(),
    key: z.object({ kind: z.enum(['exact', 'prefix']), value: z.string() }).strict(),
    coordinateSpace: z.enum(['document', 'owner', 'slot']),
    layoutParticipation: z.enum(['independent', 'owner']),
    reparent: z.enum(['allowed', 'same-material', 'forbidden']),
  }).strict()),
}).strict()

const AssistantMaterialGenerationSchema = z.object({
  enabled: z.literal(true),
  modelSchema: PortableJsonSchema,
  bindingShape: PortableJsonSchema,
  requiredModelPaths: z.array(z.string().refine(isRfc6901Pointer, 'Expected an RFC 6901 pointer')).optional(),
  examples: z.array(JsonValueSchema).min(1),
}).strict()

export const AssistantMaterialManifestEntrySchema = z.object({
  type: z.string(),
  modelVersion: z.number().int().nonnegative(),
  common: z.object({
    nameKey: z.string(),
    category: z.string(),
    defaultNode: AssistantMaterialDefaultNodeSchema,
    interaction: AssistantMaterialInteractionSchema,
    binding: AssistantMaterialBindingDefinitionSchema,
    layout: AssistantMaterialLayoutSchema,
    structure: AssistantMaterialStructureSchema,
    properties: z.array(AssistantMaterialPropSchema),
  }).strict(),
  generation: AssistantMaterialGenerationSchema,
  descriptor: JsonObjectSchema.optional(),
}).strict()

export interface AssistantMaterialManifestEntry {
  type: string
  modelVersion: number
  common: z.infer<typeof AssistantMaterialManifestEntrySchema>['common']
  generation: z.infer<typeof AssistantMaterialGenerationSchema>
  descriptor?: JsonObject
}

export const AssistantMaterialManifestSchema = z.object({
  version: z.literal(1),
  profileId: z.string(),
  engineVersion: z.string(),
  materials: z.array(AssistantMaterialManifestEntrySchema),
}).strict()

export interface AssistantMaterialManifest {
  version: 1
  profileId: string
  engineVersion: string
  materials: AssistantMaterialManifestEntry[]
}

export const AssistantTaskInputSchema = z.object({
  prompt: z.string().min(1),
  source: AssistantSourceInputSchema.optional(),
  constraints: z.record(z.unknown()).optional(),
  currentSchema: z.unknown().optional(),
  materialManifest: AssistantMaterialManifestSchema.optional(),
  pluginSelection: AssistantPluginSelectionSchema.optional(),
})

export type AssistantTaskInput = z.infer<typeof AssistantTaskInputSchema>

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
