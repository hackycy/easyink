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
    if (!capability || !node.output.renderCondition) {
      states.set(node.id, node.editorState?.hidden ? 'reserve' : 'include')
      elements.push(node)
      continue
    }

    const resolution = resolveConditionalNode(node, data)
    const requestedState = resolution.state
    const state = node.editorState?.hidden
      ? 'reserve'
      : requestedState === 'include' || capability.hiddenEffects.includes(requestedState)
        ? requestedState
        : 'include'
    states.set(node.id, state)
    appendDiagnostics(node.id, resolution.diagnostics, diagnostics, diagnosticKeys)

    if (state === 'remove') {
      changed = true
      continue
    }
    if (state === 'reserve' && !node.editorState?.hidden) {
      changed = true
      elements.push({ ...node, editorState: { ...node.editorState, hidden: true } })
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
    const key = `${nodeId}:${diagnostic.code}:${diagnostic.groupIndex ?? ''}:${diagnostic.conditionIndex ?? ''}`
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
        groupIndex: diagnostic.groupIndex,
        conditionIndex: diagnostic.conditionIndex,
        fieldPath: diagnostic.fieldPath,
      },
    })
  }
}
