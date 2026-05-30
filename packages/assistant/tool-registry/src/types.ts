import type { z } from 'zod'

export interface ToolDefinition {
  name: string
  description: string
  category: 'material' | 'data' | 'layout' | 'schema' | 'validation'
  parameters: z.ZodType<any>
  execute: (input: any, context: ToolExecutionContext) => unknown | Promise<unknown>
}

export interface ToolExecutionContext {
  pageMode: 'fixed' | 'continuous'
  pageWidth: number
  pageHeight: number
  unit: 'mm' | 'pt' | 'px'
  dataSourceName: string
  currentElements: unknown[]
}

export interface ToolCallResult<T = unknown> {
  success: boolean
  data?: T
  error?: string
}

export interface ToolManifest {
  name: string
  description: string
  category: string
  parameters: Record<string, unknown>
}
