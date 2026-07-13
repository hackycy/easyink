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

export function escapeDocumentPathToken(value: string): string {
  return value.replaceAll('~', '~0').replaceAll('/', '~1')
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

export function normalizeDocumentNodeRoots(nodes: readonly MaterialNode[]): MaterialNode[] {
  return nodes.filter(node => !nodes.some((possibleAncestor) => {
    if (possibleAncestor.id === node.id)
      return false
    const pending = Object.values(possibleAncestor.slots).flat()
    while (pending.length > 0) {
      const child = pending.pop()!
      if (child.id === node.id)
        return true
      pending.push(...Object.values(child.slots).flat())
    }
    return false
  }))
}

export function alignDraftNodes(draft: DocumentSchema, store: Pick<DesignerStore, 'materialProfile'>, nodeIds: readonly string[], mode: 'left' | 'center' | 'right'): void {
  const nodes = nodeIds.map(id => requireDocumentNode(draft, store.materialProfile, id))
  const left = Math.min(...nodes.map(node => node.x))
  const right = Math.max(...nodes.map(node => node.x + node.width))
  for (const node of nodes)
    node.x = mode === 'left' ? left : mode === 'center' ? left + (right - left - node.width) / 2 : right - node.width
}

export function distributeDraftNodesHorizontally(draft: DocumentSchema, store: Pick<DesignerStore, 'materialProfile'>, nodeIds: readonly string[]): void {
  const nodes = nodeIds.map(id => requireDocumentNode(draft, store.materialProfile, id)).sort((left, right) => left.x - right.x)
  if (nodes.length < 3)
    return
  const first = nodes[0]!
  const last = nodes.at(-1)!
  const gap = ((last.x + last.width) - first.x - nodes.reduce((sum, node) => sum + node.width, 0)) / (nodes.length - 1)
  let x = first.x + first.width + gap
  for (const node of nodes.slice(1, -1)) {
    node.x = x
    x += node.width + gap
  }
}

export function moveDraftNodesLayer(draft: DocumentSchema, store: Pick<DesignerStore, 'materialProfile'>, nodeIds: readonly string[], direction: 'up' | 'down'): void {
  const selectedIds = new Set(nodeIds)
  nodeIds.forEach(id => requireDocumentNode(draft, store.materialProfile, id))
  const ordered = draft.elements.map((node, index) => ({ node, index }))
    .sort((left, right) => (left.node.zIndex ?? 0) - (right.node.zIndex ?? 0) || left.index - right.index)
  const selected = ordered.filter(item => selectedIds.has(item.node.id))
  if (selected.length === 0)
    return
  const firstSelectedIndex = ordered.findIndex(item => selectedIds.has(item.node.id))
  const unselected = ordered.filter(item => !selectedIds.has(item.node.id))
  const unselectedBefore = ordered.slice(0, firstSelectedIndex).filter(item => !selectedIds.has(item.node.id)).length
  const insertionIndex = Math.max(0, Math.min(unselected.length, unselectedBefore + (direction === 'up' ? 1 : -1)))
  const nextOrder = [...unselected]
  nextOrder.splice(insertionIndex, 0, ...selected)
  const levels = ordered.map(item => item.node.zIndex ?? 0)
  for (let index = 1; index < levels.length; index++)
    levels[index] = Math.max(levels[index]!, levels[index - 1]! + 1)
  nextOrder.forEach((item, index) => {
    item.node.zIndex = levels[index]
  })
}

export function addDraftElementGroup(draft: DocumentSchema, group: NonNullable<DocumentSchema['groups']>[number]): void {
  draft.groups = [...(draft.groups ?? []).filter(item => item.id !== group.id), deepClone(group)]
}

export function removeDraftElementGroups(draft: DocumentSchema, groupIds: readonly string[]): void {
  const removed = new Set(groupIds)
  draft.groups = (draft.groups ?? []).filter(group => !removed.has(group.id))
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
