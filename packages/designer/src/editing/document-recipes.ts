import type { DocumentOperationDescriptor } from '@easyink/core'
import type { DocumentSchema, MaterialBinding, MaterialEditorState, MaterialNode, RenderCondition } from '@easyink/schema'
import type { BindingDisplayFormat } from '@easyink/shared'
import type { DesignerStore } from '../store/designer-store'
import { removeDocumentNode, requireDocumentNode } from '@easyink/core'
import { getBindingRefs } from '@easyink/schema'
import { deepClone } from '@easyink/shared'

export function createDesignerDocumentOperation(
  store: DesignerStore,
  kind: string,
  targetIds: readonly string[],
  fieldPaths: DocumentOperationDescriptor['fieldPaths'],
  structural: boolean,
): DocumentOperationDescriptor {
  const context = store.documentTransactions.getOperationContext()
  return {
    kind,
    sessionPath: [...context.sessionPath],
    targetIds: [...targetIds],
    fieldPaths: [...fieldPaths],
    selectionLineage: context.selectionLineage,
    structural,
  }
}

export function appendDocumentNodes(draft: DocumentSchema, nodes: readonly MaterialNode[]): void {
  draft.elements.push(...nodes.map(node => deepClone(node)))
}

export function replaceDraftDocument(draft: DocumentSchema, document: DocumentSchema): void {
  const target = draft as unknown as Record<string, unknown>
  for (const key of Object.keys(target))
    delete target[key]
  Object.assign(target, deepClone(document))
}

export function removeDocumentNodes(draft: DocumentSchema, nodeIds: readonly string[]): void {
  for (const nodeId of nodeIds)
    removeDocumentNode(draft, nodeId)
}

export function updateDraftNodeGeometry(
  draft: DocumentSchema,
  store: Pick<DesignerStore, 'materialProfile'>,
  nodeId: string,
  updates: Partial<Pick<MaterialNode, 'x' | 'y' | 'width' | 'height' | 'rotation' | 'zIndex'>>,
): void {
  Object.assign(requireDocumentNode(draft, store.materialProfile, nodeId), updates)
}

export function updateDraftNodeModel(
  draft: DocumentSchema,
  store: Pick<DesignerStore, 'materialProfile'>,
  nodeId: string,
  updates: Readonly<Record<string, unknown>>,
): void {
  const model = requireDocumentNode(draft, store.materialProfile, nodeId).model as Record<string, unknown>
  for (const [path, value] of Object.entries(updates))
    writeDottedPath(model, path, deepClone(value))
}

export function updateDraftNodeEditorState(
  draft: DocumentSchema,
  store: Pick<DesignerStore, 'materialProfile'>,
  nodeId: string,
  updates: Partial<MaterialEditorState>,
): void {
  const node = requireDocumentNode(draft, store.materialProfile, nodeId)
  const editorState = node.editorState ?? (node.editorState = {})
  for (const [key, value] of Object.entries(updates)) {
    if (value === undefined)
      delete (editorState as Record<string, unknown>)[key]
    else
      (editorState as Record<string, unknown>)[key] = value
  }
}

export function updateDraftNodeBinding(
  draft: DocumentSchema,
  store: Pick<DesignerStore, 'materialProfile'>,
  nodeId: string,
  port: string,
  binding: MaterialBinding | undefined,
): void {
  const bindings = requireDocumentNode(draft, store.materialProfile, nodeId).bindings
  if (binding)
    bindings[port] = deepClone(binding)
  else
    delete bindings[port]
}

export function updateDraftBindingFormat(
  draft: DocumentSchema,
  store: Pick<DesignerStore, 'materialProfile'>,
  nodeId: string,
  port: string,
  format: BindingDisplayFormat | undefined,
  bindIndex = 0,
): void {
  const binding = requireDocumentNode(draft, store.materialProfile, nodeId).bindings[port]
  if (!binding)
    return
  const refs = getBindingRefs(binding)
  const target = refs.find(ref => (ref.bindIndex ?? 0) === bindIndex) ?? refs[0]
  if (target)
    target.format = format ? deepClone(format) : undefined
}

export function updateDraftRenderCondition(
  draft: DocumentSchema,
  store: Pick<DesignerStore, 'materialProfile'>,
  nodeId: string,
  condition: RenderCondition | undefined,
): void {
  const output = requireDocumentNode(draft, store.materialProfile, nodeId).output
  if (condition)
    output.renderCondition = deepClone(condition)
  else
    delete output.renderCondition
}

function writeDottedPath(target: Record<string, unknown>, path: string, value: unknown): void {
  const segments = path.split('.')
  let current = target
  for (const segment of segments.slice(0, -1)) {
    const next = current[segment]
    if (!next || typeof next !== 'object' || Array.isArray(next))
      current[segment] = {}
    current = current[segment] as Record<string, unknown>
  }
  current[segments.at(-1)!] = value
}
