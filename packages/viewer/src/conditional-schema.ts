import type { ConditionalNodeState, ConditionDiagnostic } from '@easyink/core'
import type { DocumentSchema, MaterialNode } from '@easyink/schema'
import type { MaterialRendererRegistry } from './material-registry'
import type { ViewerDiagnosticEvent } from './types'
import { resolveConditionalNode } from '@easyink/core'

export interface ConditionalSchemaResolution {
  schema: DocumentSchema
  diagnostics: ViewerDiagnosticEvent[]
  states: ReadonlyMap<string, ConditionalNodeState>
}

export function resolveConditionalSchema(
  schema: DocumentSchema,
  data: Record<string, unknown>,
  registry: MaterialRendererRegistry,
): ConditionalSchemaResolution {
  const elements: MaterialNode[] = []
  const diagnostics: ViewerDiagnosticEvent[] = []
  const diagnosticKeys = new Set<string>()
  const states = new Map<string, ConditionalNodeState>()
  let changed = false

  for (const node of schema.elements) {
    const capability = registry.getCondition(node.type)
    if (!capability || !node.renderCondition) {
      states.set(node.id, node.hidden ? 'reserve' : 'include')
      elements.push(node)
      continue
    }

    const resolution = resolveConditionalNode(node, data)
    const requestedState = resolution.state
    const state = node.hidden
      ? 'reserve'
      : requestedState === 'include' || capability.effects.includes(requestedState)
        ? requestedState
        : 'include'
    states.set(node.id, state)
    appendDiagnostics(node.id, resolution.diagnostics, diagnostics, diagnosticKeys)

    if (state === 'remove') {
      changed = true
      continue
    }
    if (state === 'reserve' && !node.hidden) {
      changed = true
      elements.push({ ...node, hidden: true })
      continue
    }
    elements.push(node)
  }

  return {
    schema: changed ? { ...schema, elements } : schema,
    diagnostics,
    states,
  }
}

function appendDiagnostics(
  nodeId: string,
  source: ConditionDiagnostic[],
  target: ViewerDiagnosticEvent[],
  keys: Set<string>,
): void {
  for (const diagnostic of source) {
    const key = `${nodeId}:${diagnostic.code}:${diagnostic.astPath}`
    if (keys.has(key))
      continue
    keys.add(key)
    target.push({
      category: 'condition',
      scope: 'condition',
      severity: diagnostic.severity,
      code: diagnostic.code,
      message: diagnostic.message,
      nodeId,
      detail: {
        astPath: diagnostic.astPath,
        fieldPath: diagnostic.fieldPath,
      },
    })
  }
}
