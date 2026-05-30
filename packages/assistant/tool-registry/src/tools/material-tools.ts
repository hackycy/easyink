import type { MaterialKnowledgeRegistry } from '@easyink/assistant-material-knowledge'
import type { ToolDefinition } from '../types'
import { z } from 'zod'

export function createMaterialTools(registry: MaterialKnowledgeRegistry): ToolDefinition[] {
  return [
    {
      name: 'query_material',
      description: 'Find the best material type for a given scenario or data shape. Returns ranked suggestions.',
      category: 'material',
      parameters: z.object({
        scenario: z.string().optional(),
        bindingMode: z.enum(['none', 'scalar', 'collection', 'multi-scalar']).optional(),
        isArrayData: z.boolean().optional(),
        category: z.enum(['data', 'layout', 'decoration', 'typography', 'visualization']).optional(),
      }),
      execute: (input) => {
        const results = registry.query({
          scenario: input.scenario,
          bindingMode: input.bindingMode,
          category: input.category,
          dataShape: input.isArrayData ? { path: '', type: 'array', isArray: true } : undefined,
        })
        return results.slice(0, 5)
      },
    },
    {
      name: 'get_binding_spec',
      description: 'Get the binding specification for a material type, including what data shapes it accepts.',
      category: 'material',
      parameters: z.object({ materialType: z.string() }),
      execute: (input) => {
        const knowledge = registry.get(input.materialType)
        if (!knowledge)
          return { error: `Unknown material: ${input.materialType}` }
        return {
          mode: knowledge.bindingSpec.mode,
          accepts: knowledge.bindingSpec.accepts,
          produces: knowledge.bindingSpec.produces,
          examples: knowledge.bindingSpec.examples,
          requiredProps: knowledge.requiredProps,
        }
      },
    },
    {
      name: 'check_compatibility',
      description: 'Check if two materials are compatible as parent-child.',
      category: 'material',
      parameters: z.object({
        parentType: z.string(),
        childType: z.string(),
        pageMode: z.enum(['fixed', 'continuous']).optional(),
      }),
      execute: (input) => {
        return registry.checkCompatibility(input.parentType, input.childType, { pageMode: input.pageMode })
      },
    },
    {
      name: 'get_material_sizing',
      description: 'Get sizing constraints and defaults for a material type.',
      category: 'material',
      parameters: z.object({ materialType: z.string() }),
      execute: (input) => {
        const knowledge = registry.get(input.materialType)
        if (!knowledge)
          return { error: `Unknown material: ${input.materialType}` }
        return knowledge.sizing
      },
    },
  ]
}
