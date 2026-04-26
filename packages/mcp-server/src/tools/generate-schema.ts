import type { AIGenerationPlan } from '@easyink/shared'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { LLMProvider, SchemaGenerationInput } from '../llm/types'
import {
  buildDataSourceDescriptor,
  buildSchemaFromTemplateIntent,
  coerceLLMPlan,
  inferAIGenerationPlan,
  listDomainProfiles,
  repairGeneratedSchema,
  SchemaValidator,
  validateGeneratedSchemaAccuracy,
} from '@easyink/schema-tools'
import { z } from 'zod'
import { buildMaterialContext, getMaterialAliases, getMaterialTypes, loadMaterialsConfig } from '../config/material-loader'
import { buildIntentSystemPrompt, buildPlanSystemPrompt } from '../prompts/system-builder'
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

const MAX_INTENT_ATTEMPTS = 2

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
          .describe('Optional deterministic EasyInk generation plan supplied by the caller. When omitted the server resolves a plan via LLM with a keyword-based fallback.'),
      },
    },
    async ({ prompt, currentSchema, generationPlan }, extra) => {
      // Bridge MCP request lifecycle (cancel signal, progress notifications,
      // 5-minute hard cap) to the underlying LLM call.
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

        const plan = isGenerationPlan(generationPlan)
          ? generationPlan
          : await resolvePlan(prompt, llmProvider, relay)

        relay.notify(`Plan resolved: ${plan.domain} ${plan.page.width}x${plan.page.height}mm`)

        const intentSystemPrompt = `${buildIntentSystemPrompt()}\n\n${materialContext}`
        let attempt = 0
        let feedback: string[] = []
        let lastBuild: ReturnType<typeof buildSchemaFromTemplateIntent> | undefined
        let lastRepair: ReturnType<typeof repairGeneratedSchema> | undefined
        let lastAccuracyIssues: ReturnType<typeof validateGeneratedSchemaAccuracy> = []
        let lastIntent: Awaited<ReturnType<typeof llmProvider.generateTemplateIntent>> | undefined

        while (attempt < MAX_INTENT_ATTEMPTS) {
          attempt += 1
          relay.notify(attempt === 1 ? 'Interpreting template intent...' : `Retrying intent (attempt ${attempt})...`)

          lastIntent = await llmProvider.generateTemplateIntent({
            prompt,
            currentSchema: currentSchema as SchemaGenerationInput['currentSchema'],
            systemPrompt: intentSystemPrompt,
            generationPlan: plan,
            // Bump diversity on retry so the model does not repeat the same mistake.
            temperature: attempt === 1 ? undefined : 0.3,
            feedbackMessages: feedback.length > 0 ? feedback : undefined,
            signal: relay.signal,
            onProgress: relay.onProgress,
          })

          relay.notify('Building schema from deterministic intent...')
          lastBuild = buildSchemaFromTemplateIntent(lastIntent, { prompt, plan })

          relay.notify('Repairing schema with deterministic rules...')
          lastRepair = repairGeneratedSchema(lastBuild.schema, {
            allowedMaterialTypes: allowedTypes,
            materialAliases,
            plan,
          })

          lastAccuracyIssues = validateGeneratedSchemaAccuracy(lastRepair.schema, {
            allowedMaterialTypes: allowedTypes,
            materialAliases,
            plan,
          })

          const retryReasons: string[] = []
          if (lastBuild.missingRequiredPaths.length > 0) {
            retryReasons.push(
              `MISSING_REQUIRED_FIELD: the intent must include these field paths: ${lastBuild.missingRequiredPaths.join(', ')}`,
            )
          }
          for (const issue of lastAccuracyIssues) {
            if (RETRY_TRIGGER_CODES.has(issue.code))
              retryReasons.push(`${issue.code} at ${issue.path}: ${issue.message}`)
          }

          if (retryReasons.length === 0)
            break
          if (attempt >= MAX_INTENT_ATTEMPTS)
            break

          feedback = retryReasons
        }

        const repaired = lastRepair!
        const result = lastBuild!
        const intent = lastIntent!

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

        const dataSource = buildDataSourceDescriptor(result.expectedDataSource, {
          id: result.expectedDataSource.name,
          prompt,
        })

        const payload = {
          schema: finalSchema,
          expectedDataSource: result.expectedDataSource,
          dataSource,
          assumptions: plan,
          intent,
          attempts: attempt,
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

/**
 * Try to resolve the generation plan via LLM first, falling back to keyword
 * inference on failure or when the LLM output cannot be coerced. The
 * fallback path keeps generation working even when the plan tool fails.
 */
export async function resolvePlan(
  prompt: string,
  llmProvider: LLMProvider,
  relay: ReturnType<typeof createProgressRelay>,
): Promise<AIGenerationPlan> {
  relay.notify('Resolving generation plan...')
  const profileSummary = listDomainProfiles()
    .map(profile => `- ${profile.domain} (${profile.label}): ${profile.page.mode} ${profile.page.width}x${profile.page.height}mm, ${profile.tableStrategy}`)
    .join('\n')

  try {
    const raw = await llmProvider.generatePlan({
      prompt,
      systemPrompt: buildPlanSystemPrompt(profileSummary),
      signal: relay.signal,
      onProgress: relay.onProgress,
    })
    return coerceLLMPlan(raw, prompt)
  }
  catch (error) {
    relay.notify(`Plan inference failed (${(error as Error).message}), falling back to keyword inference.`)
    return inferAIGenerationPlan(prompt)
  }
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
