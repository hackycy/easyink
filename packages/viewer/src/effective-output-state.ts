import type { CompiledMaterialProfile } from '@easyink/core'
import type { MaterialNode } from '@easyink/schema'
import { resolveConditionalNode, resolveMaterialConditionCapability } from '@easyink/core'
import { createReadonlyMap } from './readonly-map'

export interface EffectiveOutputState {
  readonly visibility: 'include' | 'remove' | 'reserve'
  readonly shouldMeasure: boolean
  readonly shouldPaint: boolean
}

export function resolveEffectiveOutputStates(
  nodes: readonly MaterialNode[],
  data: Record<string, unknown>,
  profile: CompiledMaterialProfile,
): ReadonlyMap<string, EffectiveOutputState> {
  const result = new Map<string, EffectiveOutputState>()

  const visit = (node: MaterialNode, inherited: EffectiveOutputState['visibility']): void => {
    const capability = resolveMaterialConditionCapability(profile.getManifest(node.type)?.common.condition)
    const requested = capability && node.output.renderCondition
      ? resolveConditionalNode(node, data).state
      : 'include'
    const conditionVisibility = requested === 'include' || capability?.hiddenEffects.includes(requested)
      ? requested
      : 'include'
    const ownVisibility = strongestVisibility(node.output.visibility, conditionVisibility)
    const visibility = strongestVisibility(inherited, ownVisibility)
    result.set(node.id, Object.freeze({
      visibility,
      shouldMeasure: visibility !== 'remove',
      shouldPaint: visibility === 'include',
    }))
    for (const children of Object.values(node.slots)) {
      for (const child of children)
        visit(child, visibility)
    }
  }

  for (const node of nodes)
    visit(node, 'include')
  return createReadonlyMap(result)
}

function strongestVisibility(
  left: EffectiveOutputState['visibility'],
  right: EffectiveOutputState['visibility'],
): EffectiveOutputState['visibility'] {
  if (left === 'remove' || right === 'remove')
    return 'remove'
  if (left === 'reserve' || right === 'reserve')
    return 'reserve'
  return 'include'
}
