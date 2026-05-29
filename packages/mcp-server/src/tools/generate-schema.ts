import type { AIGenerationPlan } from '@easyink/shared'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { LLMProvider, SchemaGenerationInput, SchemaGenerationOutput } from '../llm/types'
import {
  buildDataSourceDescriptor,
  repairGeneratedSchema,
  SchemaValidator,
  validateGeneratedSchemaAccuracy,
} from '@easyink/schema-tools'
import { z } from 'zod'
import { buildMaterialContext, getMaterialAliases, getMaterialTypes, loadMaterialsConfig } from '../config/material-loader'
import { buildSystemPrompt } from '../prompts/system-builder'
import { createProgressRelay } from './progress'

/**
 * Accuracy issue codes that the LLM can plausibly fix on a second attempt.
 * Other codes (e.g. PAGE_PLAN_MISMATCH_FIXED) are deterministically repaired
 * without contacting the LLM again.
 */
const RETRY_TRIGGER_CODES = new Set([
  'UNKNOWN_MATERIAL_TYPE',
  'INVALID_TABLE_DATA_SCHEMA',
  'INVALID_TABLE_STATIC_SCHEMA',
  'STATIC_BINDING_ON_ELEMENT',
  'LEGACY_TABLE_SCHEMA',
])

/**
 * Translate raw validator codes into imperative behavior instructions the LLM
 * responds best to. Mirrors the "Common Mistakes" section in the schema
 * prompt so the second attempt sees consistent guidance.
 */
const FEEDBACK_INSTRUCTIONS: Record<string, string> = {
  UNKNOWN_MATERIAL_TYPE: 'Replace the unknown material type with a canonical one from the material context (e.g. text, image, table-data, table-static, container, qrcode, barcode, line, rect).',
  INVALID_TABLE_DATA_SCHEMA: 'Fix the table-data structure: include table.kind="data", a topology with column ratios, header + repeat-template rows, and cells that bind to the array path.',
  INVALID_TABLE_STATIC_SCHEMA: 'Fix the table-static structure: include table.kind="static", explicit rows with fixed heights, and cells that use content.text or staticBinding.',
  STATIC_BINDING_ON_ELEMENT: 'Remove staticBinding from this non-table element. staticBinding is reserved for cells inside table-static. Put the value in props.content or set up a real binding instead.',
  LEGACY_TABLE_SCHEMA: 'Do not use type="table" or legacy column/headerStyle props. Use canonical table-data (with topology + cells) for repeating rows, or table-static for fixed grids.',
}

const MAX_SCHEMA_ATTEMPTS = 2

function describeFeedback(code: string, path: string, fallbackMessage: string): string {
  const instruction = FEEDBACK_INSTRUCTIONS[code]
  if (instruction)
    return `At ${path}: ${instruction}`
  return `At ${path}: ${fallbackMessage}`
}

function buildClarification(plan: AIGenerationPlan | undefined): { reason: string, questions: string[] } | undefined {
  if (!plan || plan.confidence !== 'low')
    return undefined
  const questions: string[] = [
    'What kind of document is this — receipt, invoice/order, certificate, or something else?',
    `Is the paper size right (currently ${plan.page.mode}, ${plan.page.width}x${plan.page.height}mm)? If not, what should it be?`,
  ]
  if (plan.tableStrategy === 'table-data-for-arrays')
    questions.push('What columns should the item table show, and is there a fixed column order?')
  return {
    reason: 'Low-confidence supplied generation plan. Confirm before committing.',
    questions,
  }
}

export function registerGenerateSchemaTool(
  server: McpServer,
  llmProvider: LLMProvider,
): void {
  server.registerTool(
    'generateSchema',
    {
      description: 'Generate a DocumentSchema and expected data source from a natural language prompt. Returns both the schema and the expected data source structure in a single call.',
      inputSchema: {
        prompt: z.string().describe('Natural language description of the template to generate'),
        currentSchema: z
          .object({})
          .passthrough()
          .optional()
          .describe('Optional existing schema to use as context for modifications'),
        generationPlan: z
          .object({})
          .passthrough()
          .optional()
          .describe('Optional caller-confirmed EasyInk generation plan. When omitted, the schema generator infers paper and structure from the prompt and source data.'),
      },
    },
    async ({ prompt, currentSchema, generationPlan }, extra) => {
      const relay = createProgressRelay({
        progressToken: extra._meta?.progressToken as string | number | undefined,
        clientSignal: extra.signal,
        sendNotification: extra.sendNotification,
        provider: llmProvider,
      })

      try {
        const materialsConfig = loadMaterialsConfig()
        const materialContext = buildMaterialContext(materialsConfig)
        const allowedTypes = getMaterialTypes(materialsConfig)
        const materialAliases = getMaterialAliases(materialsConfig)
        const plan = isGenerationPlan(generationPlan) ? generationPlan : undefined
        const systemPrompt = `${buildSystemPrompt(materialContext)}`

        let attempt = 0
        let feedback: string[] = []
        let lastGenerated: SchemaGenerationOutput | undefined
        let lastRepair: ReturnType<typeof repairGeneratedSchema> | undefined
        let lastAccuracyIssues: ReturnType<typeof validateGeneratedSchemaAccuracy> = []

        while (attempt < MAX_SCHEMA_ATTEMPTS) {
          attempt += 1
          relay.notify(attempt === 1 ? 'Generating schema...' : `Retrying schema generation (attempt ${attempt})...`)

          lastGenerated = await llmProvider.generateSchema({
            prompt,
            currentSchema: currentSchema as SchemaGenerationInput['currentSchema'],
            systemPrompt,
            generationPlan: plan,
            temperature: attempt === 1 ? undefined : 0.3,
            feedbackMessages: feedback.length > 0 ? feedback : undefined,
            signal: relay.signal,
            onProgress: relay.onProgress,
          })

          relay.notify('Repairing schema with deterministic rules...')
          lastRepair = repairGeneratedSchema(lastGenerated.schema, {
            allowedMaterialTypes: allowedTypes,
            materialAliases,
            plan,
          })

          lastAccuracyIssues = validateGeneratedSchemaAccuracy(lastRepair.schema, {
            allowedMaterialTypes: allowedTypes,
            materialAliases,
            plan,
          })

          const retryReasons = lastAccuracyIssues
            .filter(issue => RETRY_TRIGGER_CODES.has(issue.code))
            .map(issue => describeFeedback(issue.code, issue.path, issue.message))

          if (retryReasons.length === 0 || attempt >= MAX_SCHEMA_ATTEMPTS)
            break

          feedback = retryReasons
        }

        const generated = lastGenerated!
        const repaired = lastRepair!
        const blocking = lastAccuracyIssues.filter(issue => RETRY_TRIGGER_CODES.has(issue.code))
        if (blocking.length > 0) {
          const errorMessages = blocking.map(issue => `${issue.code}: ${issue.message}`).join('; ')
          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({
                error: `Generated schema accuracy validation failed after ${attempt} attempt(s): ${errorMessages}`,
                assumptions: plan,
                attempts: attempt,
                accuracy: {
                  valid: false,
                  issues: lastAccuracyIssues,
                  repaired: repaired.issues,
                },
              }),
            }],
            isError: true,
          }
        }

        relay.notify('Validating schema...')

        const validator = new SchemaValidator({
          strictMode: true,
          allowedMaterialTypes: allowedTypes,
          autoFix: true,
        })
        const validation = validator.validate(repaired.schema)

        if (!validation.valid && validation.errors.length > 0) {
          const errorMessages = validation.errors.map(e => `${e.code}: ${e.message}`).join('; ')
          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({
                error: `Schema validation failed: ${errorMessages}`,
                assumptions: plan,
                attempts: attempt,
                validation: {
                  valid: false,
                  errors: validation.errors,
                  warnings: validation.warnings,
                },
              }),
            }],
            isError: true,
          }
        }

        let finalSchema = repaired.schema
        if (validation.autoFixed.length > 0) {
          const { fixed } = validator.autoFix(repaired.schema)
          finalSchema = fixed
        }

        const dataSource = buildDataSourceDescriptor(generated.expectedDataSource, {
          id: generated.expectedDataSource.name,
          prompt,
        })

        const payload = {
          schema: finalSchema,
          expectedDataSource: generated.expectedDataSource,
          dataSource,
          assumptions: plan,
          attempts: attempt,
          needsClarification: buildClarification(plan),
          validation: {
            valid: validation.valid,
            errors: validation.errors,
            warnings: validation.warnings,
            autoFixed: [
              ...repaired.issues.map(issue => ({
                path: issue.path,
                reason: issue.message,
              })),
              ...validation.autoFixed.map(af => ({
                path: af.path,
                reason: af.reason,
              })),
            ],
          },
        }

        return {
          structuredContent: payload,
          content: [{
            type: 'text' as const,
            text: JSON.stringify(payload),
          }],
        }
      }
      finally {
        relay.dispose()
      }
    },
  )
}

export function isGenerationPlan(value: unknown): value is AIGenerationPlan {
  if (typeof value !== 'object' || value === null)
    return false
  const record = value as Record<string, unknown>
  const page = record.page as Record<string, unknown> | undefined
  return typeof record.domain === 'string'
    && typeof record.confidence === 'string'
    && typeof record.tableStrategy === 'string'
    && typeof page === 'object'
    && page !== null
    && typeof page.mode === 'string'
    && typeof page.width === 'number'
    && typeof page.height === 'number'
}
