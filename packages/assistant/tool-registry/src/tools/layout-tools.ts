import type { ScenarioClassifier } from '@easyink/assistant-scenario-templates'
import type { ToolDefinition, ToolExecutionContext } from '../types'
import { z } from 'zod'

export function createLayoutTools(classifier: ScenarioClassifier): ToolDefinition[] {
  return [
    {
      name: 'plan_region',
      description: 'Plan spatial regions for a document based on scenario classification.',
      category: 'layout',
      parameters: z.object({
        scenario: z.string().optional(),
        prompt: z.string().optional(),
      }),
      execute: (input: { scenario?: string, prompt?: string }, context: ToolExecutionContext) => {
        const scenario = input.scenario ?? (input.prompt ? classifier.classify(input.prompt)?.scenario : undefined)
        if (!scenario) {
          return {
            regions: [{
              id: 'content',
              role: 'main',
              x: context.pageMode === 'continuous' ? 2 : 16,
              y: context.pageMode === 'continuous' ? 2 : 16,
              width: context.pageWidth - (context.pageMode === 'continuous' ? 4 : 32),
              height: context.pageHeight - (context.pageMode === 'continuous' ? 4 : 32),
              materials: ['text', 'table-data'],
            }],
          }
        }
        const focused = classifier.getFocusedContext(scenario)
        if (!focused)
          return { regions: [] }
        const padding = context.pageMode === 'continuous' ? 2 : 16
        const usableWidth = context.pageWidth - padding * 2
        return {
          scenario,
          regions: focused.skeleton.regions.map(r => ({
            id: r.id,
            role: r.role,
            x: padding,
            y: r.yRange[0],
            width: usableWidth,
            height: r.yRange[1] - r.yRange[0],
            materials: r.materials,
            optional: r.optional,
          })),
        }
      },
    },
    {
      name: 'check_bounds',
      description: 'Check if an element fits within page bounds.',
      category: 'layout',
      parameters: z.object({
        x: z.number(),
        y: z.number(),
        width: z.number(),
        height: z.number(),
      }),
      execute: (input: { x: number, y: number, width: number, height: number }, context: ToolExecutionContext) => {
        const errors: string[] = []
        if (input.x < 0)
          errors.push('x is negative')
        if (input.y < 0)
          errors.push('y is negative')
        if (input.x + input.width > context.pageWidth)
          errors.push(`exceeds page width (${context.pageWidth})`)
        if (context.pageMode === 'fixed' && input.y + input.height > context.pageHeight)
          errors.push(`exceeds page height (${context.pageHeight})`)
        return { valid: errors.length === 0, errors }
      },
    },
    {
      name: 'classify_scenario',
      description: 'Classify a user prompt into a known document scenario.',
      category: 'layout',
      parameters: z.object({ prompt: z.string() }),
      execute: (input: { prompt: string }) => {
        const result = classifier.classify(input.prompt)
        if (!result)
          return { scenario: null, confidence: 0 }
        return {
          scenario: result.scenario,
          confidence: result.confidence,
          template: result.template.name,
          relevantMaterials: result.template.relevantMaterials,
        }
      },
    },
  ]
}
