import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { LLMProvider, SchemaGenerationInput } from '../llm/types'
import { SchemaValidator } from '@easyink/schema-tools'
import { z } from 'zod'
import { buildMaterialContext, getMaterialTypes, loadMaterialsConfig } from '../config/material-loader'
import { buildSystemPrompt } from '../prompts/system-builder'

export function registerGenerateSchemaTool(
  server: McpServer,
  llmProvider: LLMProvider,
): void {
  server.tool(
    'generateSchema',
    'Generate a DocumentSchema and expected data source from a natural language prompt. Returns both the schema and the expected data source structure in a single call.',
    {
      prompt: z.string().describe('Natural language description of the template to generate'),
      currentSchema: z
        .object({})
        .passthrough()
        .optional()
        .describe('Optional existing schema to use as context for modifications'),
    },
    async ({ prompt, currentSchema }) => {
      // Build enriched system prompt with material context
      const materialsConfig = loadMaterialsConfig()
      const materialContext = buildMaterialContext(materialsConfig)
      const systemPrompt = buildSystemPrompt(materialContext)

      // Call LLM to generate schema + expectedDataSource
      const result = await llmProvider.generateSchema({
        prompt,
        currentSchema: currentSchema as SchemaGenerationInput['currentSchema'],
        systemPrompt,
      })

      // Validate with SchemaValidator
      const allowedTypes = getMaterialTypes(materialsConfig)
      const validator = new SchemaValidator({
        strictMode: true,
        allowedMaterialTypes: allowedTypes,
        autoFix: true,
      })
      const validation = validator.validate(result.schema)

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

      // Auto-fix minor issues
      let finalSchema = result.schema
      if (validation.autoFixed.length > 0) {
        const { fixed } = validator.autoFix(result.schema)
        finalSchema = fixed
      }

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            schema: finalSchema,
            expectedDataSource: result.expectedDataSource,
            validation: {
              valid: validation.valid,
              errors: validation.errors,
              warnings: validation.warnings,
              autoFixed: validation.autoFixed.map(af => ({
                path: af.path,
                reason: af.reason,
              })),
            },
          }),
        }],
      }
    },
  )
}
