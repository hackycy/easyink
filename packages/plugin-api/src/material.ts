import type { MaterialBindingDefinition, MaterialConditionCapability } from '@easyink/core'
import type { MaterialNode } from '@easyink/schema'
import type { AIMaterialDescriptor } from '@easyink/shared'
import type { DeepReadonly } from './resources'

export type { DeepReadonly, Dispose, ResourceContext } from './resources'

export interface MaterialCapabilities {
  readonly rotatable?: boolean
  readonly resizable?: boolean
  readonly supportsChildren?: boolean
  readonly supportsAnimation?: boolean
  readonly supportsUnionDrop?: boolean
  readonly multiBinding?: boolean
  readonly keepAspectRatio?: boolean
}

export interface MaterialModel {
  readonly type: string
  readonly createDefaultNode: (input?: Partial<MaterialNode>, unit?: string) => MaterialNode
  readonly binding: MaterialBindingDefinition
  readonly capabilities?: MaterialCapabilities
  readonly condition?: MaterialConditionCapability
  readonly pageAware?: boolean
}

/** Invalid text leaves remain diagnosable without making installation fatal. */
export interface LocaleTree {
  readonly [key: string]: unknown
}

export interface LocaleDeclaration {
  readonly messages?: LocaleTree
  readonly locales?: Readonly<Record<string, LocaleTree>>
}

export interface MaterialDeclaration {
  readonly model: MaterialModel
  readonly locale?: LocaleDeclaration
  readonly ai?: DeepReadonly<AIMaterialDescriptor>
}

/** A renderer is either immediately available or explicitly loaded on demand. */
export type RendererDeclaration<T>
  = { readonly renderer: T, readonly loadRenderer?: never }
    | { readonly renderer?: never, readonly loadRenderer: (context: import('./resources').ResourceContext) => Promise<T> }
