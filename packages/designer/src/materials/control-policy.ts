import type {
  MaterialControlPolicy,
  MaterialControlPolicyContext,
  MaterialControlState,
  MaterialControlStateKind,
  MaterialGeometryControlKey,
  MaterialResizeHandle,
} from '@easyink/core'
import type { MaterialNode } from '@easyink/schema'
import type { DesignerStore } from '../store/designer-store'
import type { PropSchema } from '../types'

const DEFAULT_CONTROL_STATE: MaterialControlState = { state: 'enabled' }

function normalizeControlState(input: MaterialControlState | MaterialControlStateKind | undefined): MaterialControlState {
  if (!input)
    return DEFAULT_CONTROL_STATE
  if (typeof input === 'string')
    return { state: input }
  return input
}

function getControlPolicy(store: DesignerStore, node: MaterialNode): MaterialControlPolicy | undefined {
  const ext = store.peekDesignerFacet(node.type)?.value?.extension
  if (!ext?.resolveControlPolicy)
    return undefined
  return ext.resolveControlPolicy(node, {
    getSchema: () => store.schema,
    t: (key: string) => store.t(key),
  } satisfies MaterialControlPolicyContext)
}

export function getGeometryControlState(
  store: DesignerStore,
  node: MaterialNode,
  key: MaterialGeometryControlKey,
): MaterialControlState {
  const policy = getControlPolicy(store, node)
  return normalizeControlState(policy?.geometry?.[key])
}

export function canEditGeometry(store: DesignerStore, node: MaterialNode, key: MaterialGeometryControlKey): boolean {
  return getGeometryControlState(store, node, key).state === 'enabled'
}

export function getResizeHandleControlState(
  store: DesignerStore,
  node: MaterialNode,
  handle: MaterialResizeHandle,
): MaterialControlState {
  const material = store.getMaterialManifest(node.type)
  if (material?.common.interaction.resizable === false)
    return { state: 'hidden' }

  const policy = getControlPolicy(store, node)
  const state = policy?.resize?.handles?.[handle]
  if (state && state.state !== 'enabled')
    return state

  const widthState = policy?.resize?.width ? normalizeControlState(policy.resize.width) : DEFAULT_CONTROL_STATE
  const heightState = policy?.resize?.height ? normalizeControlState(policy.resize.height) : DEFAULT_CONTROL_STATE

  const affectsWidth = handle === 'w' || handle === 'e' || handle === 'nw' || handle === 'ne' || handle === 'sw' || handle === 'se'
  const affectsHeight = handle === 'n' || handle === 's' || handle === 'nw' || handle === 'ne' || handle === 'sw' || handle === 'se'

  if (affectsWidth && widthState.state !== 'enabled')
    return widthState
  if (affectsHeight && heightState.state !== 'enabled')
    return heightState

  return DEFAULT_CONTROL_STATE
}

export function getVisibleResizeHandles(store: DesignerStore, node: MaterialNode): MaterialResizeHandle[] {
  const handles: MaterialResizeHandle[] = ['nw', 'n', 'ne', 'w', 'e', 'sw', 's', 'se']
  return handles.filter(handle => getResizeHandleControlState(store, node, handle).state !== 'hidden')
}

export function canResizeHandle(store: DesignerStore, node: MaterialNode, handle: MaterialResizeHandle): boolean {
  return getResizeHandleControlState(store, node, handle).state === 'enabled'
}

export function getPropSchemaControlState(store: DesignerStore, node: MaterialNode, schema: PropSchema): MaterialControlState {
  const policy = getControlPolicy(store, node)
  const fieldState = policy?.props?.fields?.[schema.key]
  if (fieldState)
    return normalizeControlState(fieldState)

  if (schema.group) {
    const groupState = policy?.props?.groups?.[schema.group]
    if (groupState)
      return normalizeControlState(groupState)
  }

  return DEFAULT_CONTROL_STATE
}

export function isPropSchemaDisabled(store: DesignerStore, node: MaterialNode, schema: PropSchema): boolean {
  const state = getPropSchemaControlState(store, node, schema)
  return state.state !== 'enabled' || Boolean(schema.disabled?.(node.model))
}
