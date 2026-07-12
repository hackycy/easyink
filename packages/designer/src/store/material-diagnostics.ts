import type { MaterialLoadDiagnostic, MaterialNodeLoadState } from '@easyink/core'

export function collectMaterialDiagnostics(
  diagnostics: readonly MaterialLoadDiagnostic[],
  nodeStates: ReadonlyMap<string, MaterialNodeLoadState>,
): readonly MaterialLoadDiagnostic[] {
  const unique = new Map<string, MaterialLoadDiagnostic>()
  const add = (item: MaterialLoadDiagnostic) => {
    const key = `${item.code}\u0000${item.path}\u0000${item.nodeId ?? ''}`
    if (!unique.has(key))
      unique.set(key, item)
  }
  diagnostics.forEach(add)
  for (const state of nodeStates.values())
    state.diagnostics.forEach(add)
  return [...unique.values()]
}
