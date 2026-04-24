import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { LLMProvider } from '../llm/types'
import { z } from 'zod'
import { buildMaterialContext, loadMaterialsConfig } from '../config/material-loader'
import { buildDataSourceSystemPrompt } from '../prompts/system-builder'

const expectedFieldSchema = z.object({
  name: z.string(),
  type: z.enum(['string', 'number', 'boolean', 'array', 'object']),
  required: z.boolean().optional(),
  path: z.string(),
})

// Recursive type for ExpectedField children
type ExpectedFieldZod = z.infer<typeof expectedFieldSchema> & {
  children?: ExpectedFieldZod[]
}

const expectedFieldRecursive: z.ZodType<ExpectedFieldZod> = expectedFieldSchema.extend({
  children: z.lazy(() => expectedFieldRecursive.array().optional()),
})

export function registerGenerateDataSourceTool(
  server: McpServer,
  llmProvider: LLMProvider,
): void {
  server.tool(
    'generateDataSource',
    'Generate a complete DataSourceDescriptor with field tree from expected data structure. Each field includes name, path, type, and optional material use recommendations.',
    {
      expectedDataSource: z.object({
        name: z.string().describe('Data source name'),
        fields: expectedFieldRecursive.array(),
      }),
    },
    async ({ expectedDataSource }) => {
      const materialsConfig = loadMaterialsConfig()
      const materialContext = buildMaterialContext(materialsConfig)
      const systemPrompt = buildDataSourceSystemPrompt(materialContext)

      const dataSource = await llmProvider.generateDataSource({
        systemPrompt,
        expectedDataSource,
      })

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ dataSource }),
        }],
      }
    },
  )
}
