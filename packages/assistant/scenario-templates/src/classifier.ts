import type { FocusedContext, ScenarioClassification, ScenarioTemplate } from './types'
import { invoiceTemplate, labelTemplate, receiptTemplate, reportTemplate } from './templates'

const allTemplates: ScenarioTemplate[] = [
  invoiceTemplate,
  receiptTemplate,
  reportTemplate,
  labelTemplate,
]

export class ScenarioClassifier {
  private readonly templates: ScenarioTemplate[]

  constructor(templates?: ScenarioTemplate[]) {
    this.templates = templates ?? allTemplates
  }

  classify(prompt: string): ScenarioClassification | undefined {
    const normalized = prompt.replace(/\s+/g, '').toLowerCase()
    let best: { template: ScenarioTemplate, score: number, matched: string[] } | undefined

    for (const template of this.templates) {
      const matched = template.triggers.filter(t => normalized.includes(t.toLowerCase()))
      const score = matched.length / template.triggers.length
      if (matched.length > 0 && (!best || score > best.score)) {
        best = { template, score, matched }
      }
    }

    if (!best)
      return undefined
    return {
      scenario: best.template.id,
      confidence: Math.min(best.score * 2, 1.0),
      template: best.template,
      matchedTriggers: best.matched,
    }
  }

  getFocusedContext(scenario: string): FocusedContext | undefined {
    const template = this.templates.find(t => t.id === scenario)
    if (!template)
      return undefined
    return {
      scenario: template.id,
      relevantMaterials: template.relevantMaterials,
      skeleton: template.skeleton,
      promptHints: this.buildPromptHints(template),
    }
  }

  getTemplate(id: string): ScenarioTemplate | undefined {
    return this.templates.find(t => t.id === id)
  }

  allScenarios(): string[] {
    return this.templates.map(t => t.id)
  }

  private buildPromptHints(template: ScenarioTemplate): string[] {
    const hints: string[] = []
    hints.push(`Document type: ${template.name}`)
    hints.push(`Page: ${template.skeleton.page.mode} ${template.skeleton.page.width}x${template.skeleton.page.height}mm`)
    hints.push(`Regions: ${template.skeleton.regions.map(r => r.role).join(', ')}`)
    hints.push(`Primary materials: ${template.relevantMaterials.slice(0, 5).join(', ')}`)
    return hints
  }
}
