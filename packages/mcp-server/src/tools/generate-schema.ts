import type { AIGenerationPlan } from '@easyink/shared'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { LLMProvider, SchemaGenerationInput } from '../llm/types'
import { buildSchemaFromTemplateIntent, repairGeneratedSchema, SchemaValidator, validateGeneratedSchemaAccuracy } from '@easyink/schema-tools'
import { inferAIGenerationPlan } from '@easyink/shared'
import { z } from 'zod'
import { buildMaterialContext, getMaterialAliases, getMaterialTypes, loadMaterialsConfig } from '../config/material-loader'
import { buildIntentSystemPrompt } from '../prompts/system-builder'
import { createProgressRelay } from './progress'

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
          .describe('Optional deterministic EasyInk generation plan confirmed by the user'),
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
        const inferredPlan = inferAIGenerationPlan(prompt)
        const plan = isGenerationPlan(generationPlan) ? generationPlan : inferredPlan

        relay.notify('Interpreting template intent...')
        const intent = await llmProvider.generateTemplateIntent({
          prompt,
          currentSchema: currentSchema as SchemaGenerationInput['currentSchema'],
          systemPrompt: `${buildIntentSystemPrompt()}\n\n${materialContext}`,
          generationPlan: plan,
          signal: relay.signal,
          onProgress: relay.onProgress,
        })

        relay.notify('Building schema from deterministic intent...')
        const result = buildSchemaFromTemplateIntent(intent, { prompt, plan })

        relay.notify('Repairing schema with deterministic rules...')

        const allowedTypes = getMaterialTypes(materialsConfig)
        const repaired = repairGeneratedSchema(result.schema, {
          allowedMaterialTypes: allowedTypes,
          materialAliases: getMaterialAliases(materialsConfig),
          plan,
        })
        const accuracyIssues = validateGeneratedSchemaAccuracy(repaired.schema, {
          allowedMaterialTypes: allowedTypes,
          materialAliases: getMaterialAliases(materialsConfig),
          plan,
        })

        if (accuracyIssues.length > 0) {
          const errorMessages = accuracyIssues.map(issue => `${issue.code}: ${issue.message}`).join('; ')
          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({
                error: `Generated schema accuracy validation failed: ${errorMessages}`,
                assumptions: plan,
                accuracy: {
                  valid: false,
                  issues: accuracyIssues,
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

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              schema: finalSchema,
              expectedDataSource: result.expectedDataSource,
              assumptions: plan,
              intent: result.intent,
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
            }),
          }],
        }
      }
      finally {
        relay.dispose()
      }
    },
  )
}

function isGenerationPlan(value: unknown): value is AIGenerationPlan {
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
