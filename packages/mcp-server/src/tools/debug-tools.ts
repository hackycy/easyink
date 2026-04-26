import type { DocumentSchema } from '@easyink/schema'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { LLMProvider, SchemaGenerationInput } from '../llm/types'
import {
  buildDataSourceDescriptor,
  buildSchemaFromTemplateIntent,
  repairGeneratedSchema,
  SchemaValidator,
  validateGeneratedSchemaAccuracy,
} from '@easyink/schema-tools'
import { z } from 'zod'
import { buildMaterialContext, getMaterialAliases, getMaterialTypes, loadMaterialsConfig } from '../config/material-loader'
import { buildIntentSystemPrompt } from '../prompts/system-builder'
import { isGenerationPlan, resolvePlan } from './generate-schema'
import { createProgressRelay } from './progress'

export function registerDebugTools(server: McpServer, llmProvider: LLMProvider): void {
  registerResolvePlanTool(server, llmProvider)
  registerGenerateIntentTool(server, llmProvider)
  registerBuildSchemaFromIntentTool(server)
  registerValidateGeneratedSchemaTool(server)
}

function registerResolvePlanTool(server: McpServer, llmProvider: LLMProvider): void {
  server.registerTool(
    'resolvePlan',
    {
      description: 'Debug helper: resolve the EasyInk deterministic generation plan for a prompt.',
      inputSchema: {
        prompt: z.string(),
      },
    },
    async ({ prompt }, extra) => {
      const relay = createProgressRelay({
        progressToken: extra._meta?.progressToken as string | number | undefined,
        clientSignal: extra.signal,
        sendNotification: extra.sendNotification,
        provider: llmProvider,
      })
      try {
        const plan = await resolvePlan(prompt, llmProvider, relay)
        return toolPayload({ plan })
      }
      finally {
        relay.dispose()
      }
    },
  )
}

function registerGenerateIntentTool(server: McpServer, llmProvider: LLMProvider): void {
  server.registerTool(
    'generateIntent',
    {
      description: 'Debug helper: generate the raw TemplateIntent before deterministic schema construction.',
      inputSchema: {
        prompt: z.string(),
        currentSchema: z.object({}).passthrough().optional(),
        generationPlan: z.object({}).passthrough().optional(),
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
        const plan = isGenerationPlan(generationPlan)
          ? generationPlan
          : await resolvePlan(prompt, llmProvider, relay)
        const intent = await llmProvider.generateTemplateIntent({
          prompt,
          currentSchema: currentSchema as SchemaGenerationInput['currentSchema'],
          systemPrompt: `${buildIntentSystemPrompt()}\n\n${materialContext}`,
          generationPlan: plan,
          signal: relay.signal,
          onProgress: relay.onProgress,
        })
        return toolPayload({ plan, intent })
      }
      finally {
        relay.dispose()
      }
    },
  )
}

function registerBuildSchemaFromIntentTool(server: McpServer): void {
  server.registerTool(
    'buildSchemaFromIntent',
    {
      description: 'Debug helper: deterministically build schema and data source from a TemplateIntent and generation plan.',
      inputSchema: {
        prompt: z.string(),
        intent: z.object({}).passthrough(),
        generationPlan: z.object({}).passthrough(),
      },
    },
    async ({ prompt, intent, generationPlan }) => {
      if (!isGenerationPlan(generationPlan)) {
        return toolPayload({ error: 'Invalid generationPlan.' }, true)
      }

      const result = buildSchemaFromTemplateIntent(intent, { prompt, plan: generationPlan })
      const dataSource = buildDataSourceDescriptor(result.expectedDataSource, {
        id: result.expectedDataSource.name,
        prompt,
      })
      return toolPayload({ ...result, dataSource })
    },
  )
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
      const repaired = repairGeneratedSchema(schema as unknown as DocumentSchema, {
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

function toolPayload(payload: Record<string, unknown>, isError = false) {
  return {
    structuredContent: payload,
    content: [{ type: 'text' as const, text: JSON.stringify(payload) }],
    ...(isError ? { isError: true } : {}),
  }
}
