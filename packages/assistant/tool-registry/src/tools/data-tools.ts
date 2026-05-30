import type { TypeAligner } from '@easyink/assistant-type-aligner'
import type { ToolDefinition } from '../types'
import { z } from 'zod'

export function createDataTools(aligner: TypeAligner): ToolDefinition[] {
  return [
    {
      name: 'infer_contract',
      description: 'Infer a typed data contract from sample data. Returns field paths, types, and structure.',
      category: 'data',
      parameters: z.object({
        sample: z.unknown(),
        name: z.string().optional(),
      }),
      execute: (input: { sample: unknown, name?: string }) => {
        return aligner.infer(input.sample, input.name ?? 'dataSource')
      },
    },
    {
      name: 'align_fields',
      description: 'Align available data fields with material requirements. Returns matched/unmatched/missing fields.',
      category: 'data',
      parameters: z.object({
        sample: z.unknown(),
        materialType: z.string(),
        dataSourceName: z.string().optional(),
      }),
      execute: (input: { sample: unknown, materialType: string, dataSourceName?: string }) => {
        const signature = aligner.infer(input.sample, input.dataSourceName)
        const required = aligner.demand(input.materialType)
        if (!required)
          return { error: `Unknown material: ${input.materialType}` }
        return aligner.align(signature, required)
      },
    },
    {
      name: 'generate_bindings',
      description: 'Auto-generate binding paths for a material type based on data structure.',
      category: 'data',
      parameters: z.object({
        sample: z.unknown(),
        materialType: z.string(),
        dataSourceName: z.string().optional(),
      }),
      execute: (input: { sample: unknown, materialType: string, dataSourceName?: string }) => {
        const signature = aligner.infer(input.sample, input.dataSourceName)
        return aligner.generateBindings(signature, input.materialType)
      },
    },
  ]
}
