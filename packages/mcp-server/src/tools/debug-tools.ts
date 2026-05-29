import type { DocumentSchema } from '@easyink/schema'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { LLMProvider } from '../llm/types'
import { validateSchema } from '@easyink/schema'
import {
  repairGeneratedSchema,
  SchemaValidator,
  validateGeneratedSchemaAccuracy,
} from '@easyink/schema-tools'
import { z } from 'zod'
import { getMaterialAliases, getMaterialTypes, loadMaterialsConfig } from '../config/material-loader'
import { isGenerationPlan } from './generate-schema'

export function registerDebugTools(server: McpServer, _llmProvider: LLMProvider): void {
  registerValidateGeneratedSchemaTool(server)
}

function registerValidateGeneratedSchemaTool(server: McpServer): void {
  server.registerTool(
    'validateGeneratedSchema',
    {
      description: 'Debug helper: run EasyInk generation accuracy validation and schema validation for a schema.',
      inputSchema: {
        schema: z.object({}).passthrough(),
        generationPlan: z.object({}).passthrough().optional(),
      },
    },
    async ({ schema, generationPlan }) => {
      const materialsConfig = loadMaterialsConfig()
      const allowedMaterialTypes = getMaterialTypes(materialsConfig)
      const materialAliases = getMaterialAliases(materialsConfig)
      const plan = isGenerationPlan(generationPlan) ? generationPlan : undefined
      if (!isValidDocumentSchema(schema))
        return toolPayload({ errors: validateSchema(schema) }, true)
      const repaired = repairGeneratedSchema(schema, {
        allowedMaterialTypes,
        materialAliases,
        plan,
      })
      const accuracyIssues = validateGeneratedSchemaAccuracy(repaired.schema, {
        allowedMaterialTypes,
        materialAliases,
        plan,
      })
      const validator = new SchemaValidator({
        strictMode: true,
        allowedMaterialTypes,
        autoFix: true,
      })
      const validation = validator.validate(repaired.schema)
      return toolPayload({ repaired, accuracyIssues, validation })
    },
  )
}

function isValidDocumentSchema(schema: unknown): schema is DocumentSchema {
  return validateSchema(schema).length === 0
}

function toolPayload(payload: Record<string, unknown>, isError = false) {
  return {
    structuredContent: payload,
    content: [{ type: 'text' as const, text: JSON.stringify(payload) }],
    ...(isError ? { isError: true } : {}),
  }
}
