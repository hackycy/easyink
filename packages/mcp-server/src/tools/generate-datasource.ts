import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { LLMProvider } from '../llm/types'
import { buildDataSourceDescriptor } from '@easyink/schema-tools'
import { z } from 'zod'
import { createProgressRelay } from './progress'

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
  server.registerTool(
    'generateDataSource',
    {
      description: 'Generate a complete DataSourceDescriptor with field tree from expected data structure. Each field includes name, path, type, and optional material use recommendations.',
      inputSchema: {
        expectedDataSource: z.object({
          name: z.string().describe('Data source name'),
          fields: expectedFieldRecursive.array(),
        }),
      },
    },
    async ({ expectedDataSource }, extra) => {
      const relay = createProgressRelay({
        progressToken: extra._meta?.progressToken as string | number | undefined,
        clientSignal: extra.signal,
        sendNotification: extra.sendNotification,
        provider: llmProvider,
      })
      try {
        relay.notify('Building deterministic data source descriptor...')
        const dataSource = buildDataSourceDescriptor(expectedDataSource, {
          id: expectedDataSource.name,
        })

        return {
          structuredContent: { dataSource },
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ dataSource }),
          }],
        }
      }
      finally {
        relay.dispose()
      }
    },
  )
}
