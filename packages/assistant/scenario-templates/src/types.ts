export interface ScenarioTemplate {
  id: string
  name: string
  triggers: string[]
  skeleton: TemplateSkeleton
  relevantMaterials: string[]
  variations: TemplateVariation[]
}

export interface TemplateSkeleton {
  page: { mode: 'fixed' | 'continuous', width: number, height: number }
  regions: TemplateRegion[]
}

export interface TemplateRegion {
  id: string
  role: string
  yRange: [number, number]
  materials: string[]
  optional?: boolean
}

export interface TemplateVariation {
  condition: string
  adjust: string
  action: (skeleton: TemplateSkeleton) => TemplateSkeleton
}

export interface ScenarioClassification {
  scenario: string
  confidence: number
  template: ScenarioTemplate
  matchedTriggers: string[]
}

export interface FocusedContext {
  scenario: string
  relevantMaterials: string[]
  skeleton: TemplateSkeleton
  promptHints: string[]
}
