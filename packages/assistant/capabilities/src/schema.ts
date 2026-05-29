import type { DataFieldNode, DataSourceDescriptor } from '@easyink/datasource'
import type { TemplateIntentField, TemplateIntentSection } from '@easyink/schema-tools'
import type { AssistantTaskInput, SchemaCandidate } from './types'
import {
  buildDataSourceDescriptor,
  buildSchemaFromTemplateIntent,
  inferAIGenerationPlan,
} from '@easyink/schema-tools'
import { validateAssistantSchema } from './validation'

export interface GenerateSchemaCandidateOptions {
  sourceData?: unknown
  sourceDescriptor?: DataSourceDescriptor
}

export function generateSchemaCandidate(
  input: AssistantTaskInput,
  options: GenerateSchemaCandidateOptions = {},
): SchemaCandidate {
  const plan = inferAIGenerationPlan(input.prompt)
  const fields = options.sourceDescriptor?.fields.length
    ? options.sourceDescriptor.fields.map(field => toIntentField(field))
    : undefined

  const sections = fields?.length ? createSectionsFromFields(fields) : undefined
  const build = buildSchemaFromTemplateIntent(
    {
      name: resolveTitle(input.prompt),
      domain: plan.domain,
      dataSourceName: options.sourceDescriptor?.name,
      fields,
      sections,
      sampleData: isRecord(options.sourceData) ? options.sourceData : undefined,
      warnings: plan.warnings,
    },
    { plan, prompt: input.prompt },
  )

  const dataSource = options.sourceDescriptor ?? buildDataSourceDescriptor(
    build.expectedDataSource,
    {
      generatedBy: 'easyink-assistant-platform',
      prompt: input.prompt,
      titlePrefix: 'Assistant',
    },
  )
  const validation = validateAssistantSchema(build.schema)

  return {
    schema: build.schema,
    expectedDataSource: build.expectedDataSource,
    dataSource,
    plan,
    warnings: [
      ...build.intent.warnings,
      ...validation.warnings.map(warning => warning.message),
      ...build.missingRequiredPaths.map(path => `Required field was injected: ${path}`),
    ],
  }
}

function toIntentField(field: DataFieldNode): TemplateIntentField {
  return {
    name: field.name,
    path: field.path ?? field.key ?? field.name,
    title: field.title,
    type: inferIntentType(field),
    required: field.meta?.required === true,
    children: field.fields?.map(child => toIntentField(child)),
  }
}

function inferIntentType(field: DataFieldNode): TemplateIntentField['type'] {
  const explicit = field.meta?.valueType
  if (explicit === 'string' || explicit === 'number' || explicit === 'boolean' || explicit === 'array' || explicit === 'object')
    return explicit
  if (field.fields?.length)
    return field.use ? 'array' : 'object'
  return 'string'
}

function createSectionsFromFields(fields: TemplateIntentField[]): TemplateIntentSection[] {
  const scalarFields = fields.filter(field => field.type !== 'array' && field.type !== 'object')
  const arrayFields = fields.filter(field => field.type === 'array')
  return [
    ...(scalarFields.length
      ? [{
          kind: 'field-list' as const,
          title: '基础信息',
          fields: scalarFields,
        }]
      : []),
    ...arrayFields.map(field => ({
      kind: 'array-table' as const,
      title: field.title ?? field.name,
      sourcePath: field.path ?? field.name,
      columns: field.children?.map(child => ({
        path: child.path ?? `${field.path ?? field.name}/${child.name}`,
        title: child.title ?? child.name,
      })),
    })),
  ]
}

function resolveTitle(prompt: string): string {
  const compact = prompt.trim().replace(/\s+/g, ' ')
  return compact.length > 24 ? compact.slice(0, 24) : compact || 'EasyInk Assistant'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}
