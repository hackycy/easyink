import type { MaterialBinding, MaterialNode } from '@easyink/schema'

export type JsonPointer = `/${string}`
export type MaterialIdentityScope = 'document' | 'material'

export interface MaterialIdentityTarget {
  scope: MaterialIdentityScope
  kind: string
}

export interface MaterialIdentityEncoding {
  prefix?: string
  suffix?: string
}

export interface MaterialIdentitySlot {
  path: JsonPointer
  location: 'value' | 'key'
  encoding?: MaterialIdentityEncoding
  value: string
  target: MaterialIdentityTarget
}

export interface MaterialStructureSlot {
  path: JsonPointer
  slot: string
  children: readonly MaterialNode[]
  policyId: string
  coordinateSpace: 'document' | 'owner' | 'slot'
  layoutParticipation: 'independent' | 'owner'
  reparent: 'allowed' | 'same-material' | 'forbidden'
}

export interface MaterialReferenceSlot {
  path: JsonPointer
  location: 'value' | 'key'
  encoding?: MaterialIdentityEncoding
  value: string
  target: MaterialIdentityTarget
  required: boolean
}

export interface MaterialResourceSlot {
  path: JsonPointer
  value: string
  kind: 'asset' | 'font'
}

export interface MaterialBindingSlot {
  path: JsonPointer
  value: MaterialBinding
  port: string
}

export interface MaterialIntrospection {
  identities: readonly MaterialIdentitySlot[]
  structures: readonly MaterialStructureSlot[]
  references: readonly MaterialReferenceSlot[]
  resources: readonly MaterialResourceSlot[]
  bindings: readonly MaterialBindingSlot[]
}
