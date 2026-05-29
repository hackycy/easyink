import type { DataSourceDescriptor } from '@easyink/datasource'
import { z } from 'zod'

export const AdapterInputSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('json'),
    content: z.string(),
    name: z.string().optional(),
  }),
  z.object({
    kind: z.literal('file'),
    content: z.string(),
    fileName: z.string().optional(),
  }),
  z.object({
    kind: z.literal('http'),
    url: z.string().url(),
    method: z.string().optional(),
    headers: z.record(z.string()).optional(),
    body: z.string().optional(),
  }),
  z.object({
    kind: z.literal('curl'),
    content: z.string(),
  }),
])

export type AdapterInput = z.infer<typeof AdapterInputSchema>

export interface ParsedExternalData {
  kind: AdapterInput['kind']
  sample: unknown
  descriptor: DataSourceDescriptor
  request?: HttpRequestConfig
  warnings: string[]
}

export interface HttpRequestConfig {
  url: string
  method: string
  headers?: Record<string, string>
  body?: string
}
