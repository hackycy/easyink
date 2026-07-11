import type { DocumentSchemaInput, MaterialNode } from '@easyink/schema'
import type { CompiledMaterialProfile, SchemaAdmissionBudget } from './material-profile'
import type { MaterialLoadDiagnostic, MaterialNodeLoadState } from './schema-adapter'
import { loadDocumentWithProfile } from './schema-adapter'

export function admitMaterialGraph(
  roots: readonly unknown[],
  profile: CompiledMaterialProfile,
  budget: Partial<SchemaAdmissionBudget> = {},
): Readonly<{
  roots: readonly MaterialNode[]
  nodeStates: ReadonlyMap<string, MaterialNodeLoadState>
  diagnostics: readonly MaterialLoadDiagnostic[]
}> {
  const admissionProfile = Object.create(profile) as CompiledMaterialProfile
  Object.defineProperty(admissionProfile, 'admissionBudget', {
    value: resolveAdmissionBudget(profile.admissionBudget, budget),
  })
  const input = {
    version: '1.0.0',
    unit: 'mm',
    page: { mode: 'fixed', width: 1, height: 1 },
    guides: { x: [], y: [] },
    elements: roots,
  } as unknown as DocumentSchemaInput
  const loaded = loadDocumentWithProfile(input, admissionProfile)
  return Object.freeze({
    roots: Object.freeze([...loaded.schema.elements]),
    nodeStates: loaded.nodeStates,
    diagnostics: loaded.diagnostics,
  })
}

function resolveAdmissionBudget(
  ceiling: Readonly<SchemaAdmissionBudget>,
  requested: Partial<SchemaAdmissionBudget>,
): Readonly<SchemaAdmissionBudget> {
  const result = { ...ceiling }
  for (const key of Object.keys(requested) as Array<keyof SchemaAdmissionBudget>) {
    const value = requested[key]
    if (!Object.hasOwn(ceiling, key)
      || !Number.isSafeInteger(value)
      || value! <= 0
      || value! > ceiling[key]) {
      throw new Error('MATERIAL_GRAPH_BUDGET_INVALID')
    }
    result[key] = value!
  }
  return Object.freeze(result)
}
