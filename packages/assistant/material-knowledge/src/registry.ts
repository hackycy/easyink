import type {
  BindingMode,
  MaterialCompatibility,
  MaterialKnowledge,
  MaterialQuery,
  MaterialQueryResult,
} from './types'

export class MaterialKnowledgeRegistry {
  private readonly materials = new Map<string, MaterialKnowledge>()

  register(knowledge: MaterialKnowledge): void {
    this.materials.set(knowledge.type, knowledge)
  }

  get(type: string): MaterialKnowledge | undefined {
    return this.materials.get(type)
  }

  has(type: string): boolean {
    return this.materials.has(type)
  }

  all(): MaterialKnowledge[] {
    return [...this.materials.values()]
  }

  types(): string[] {
    return [...this.materials.keys()]
  }

  query(query: MaterialQuery): MaterialQueryResult[] {
    const results: MaterialQueryResult[] = []
    for (const material of this.materials.values()) {
      const score = this.scoreMaterial(material, query)
      if (score > 0) {
        results.push({
          type: material.type,
          score,
          reason: this.explainScore(material, query),
          bindingSpec: material.bindingSpec,
        })
      }
    }
    return results.sort((a, b) => b.score - a.score)
  }

  checkCompatibility(
    parentType: string,
    childType: string,
    context?: { pageMode?: 'fixed' | 'continuous' },
  ): MaterialCompatibility {
    const parent = this.materials.get(parentType)
    const child = this.materials.get(childType)
    if (!parent || !child) {
      return { compatible: false, warnings: [`Unknown material type: ${parent ? childType : parentType}`] }
    }

    const warnings: string[] = []
    const canContain = parent.composability.canContain.includes(childType)
      || parent.composability.canContain.includes('*')
    const canBeChild = child.composability.canBeChildOf.includes(parentType)
      || child.composability.canBeChildOf.includes('*')

    if (!canContain)
      warnings.push(`${parentType} does not support containing ${childType}`)
    if (!canBeChild)
      warnings.push(`${childType} cannot be a child of ${parentType}`)
    if (child.composability.exclusiveWith.includes(parentType))
      warnings.push(`${childType} is exclusive with ${parentType}`)

    if (context?.pageMode === 'continuous' && child.sizing.growAxis === 'none')
      warnings.push(`${childType} has fixed sizing which may not work well in continuous mode`)

    return {
      compatible: canContain && canBeChild && warnings.length === 0,
      warnings,
      suggestions: !canContain
        ? parent.composability.canContain.filter(t => this.materials.has(t))
        : undefined,
    }
  }

  forScenario(scenario: string): MaterialQueryResult[] {
    const results: MaterialQueryResult[] = []
    for (const material of this.materials.values()) {
      const fit = material.fitness.find(f => f.scenario === scenario)
      if (fit && fit.score > 0) {
        results.push({
          type: material.type,
          score: fit.score,
          reason: fit.reason,
          bindingSpec: material.bindingSpec,
        })
      }
    }
    return results.sort((a, b) => b.score - a.score)
  }

  forBindingMode(mode: BindingMode): MaterialKnowledge[] {
    return this.all().filter(m => m.bindingSpec.mode === mode)
  }

  private scoreMaterial(material: MaterialKnowledge, query: MaterialQuery): number {
    let score = 0

    if (query.scenario) {
      const fit = material.fitness.find(f => f.scenario === query.scenario)
      if (fit)
        score += fit.score * 0.4
    }

    if (query.bindingMode && material.bindingSpec.mode === query.bindingMode)
      score += 0.3

    if (query.category && material.category === query.category)
      score += 0.2

    if (query.dataShape) {
      const accepts = material.bindingSpec.accepts
      if (query.dataShape.isArray && accepts.isArray)
        score += 0.3
      if (!query.dataShape.isArray && !accepts.isArray)
        score += 0.2
      if (accepts.types.includes(query.dataShape.type))
        score += 0.1
    }

    if (query.parentType) {
      if (material.composability.canBeChildOf.includes(query.parentType))
        score += 0.1
    }

    return score
  }

  private explainScore(material: MaterialKnowledge, query: MaterialQuery): string {
    const reasons: string[] = []
    if (query.scenario) {
      const fit = material.fitness.find(f => f.scenario === query.scenario)
      if (fit)
        reasons.push(fit.reason)
    }
    if (query.bindingMode && material.bindingSpec.mode === query.bindingMode)
      reasons.push(`binding mode matches: ${query.bindingMode}`)
    if (query.dataShape?.isArray && material.bindingSpec.accepts.isArray)
      reasons.push('accepts array data')
    return reasons.join('; ') || `${material.type} is a general-purpose material`
  }
}
