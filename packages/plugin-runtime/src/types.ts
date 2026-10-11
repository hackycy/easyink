import type { DeepReadonly, ResourceContext } from '@easyink/plugin-api'
import type { DesignerCommand, DesignerExtension, DesignerMaterial } from '@easyink/plugin-api/designer'
import type { LocaleDeclaration, LocaleTree } from '@easyink/plugin-api/material'
import type { ViewerMaterial } from '@easyink/plugin-api/viewer'

// Structural payloads keep Vue declarations out of the assembly kernel.
export interface RuntimeMaterialUI {
  readonly palette?: readonly { readonly id: string }[]
  readonly properties?: unknown
}

export interface RuntimeDesignerUI {
  readonly toolbar?: readonly { readonly id: string }[]
  readonly contextMenu?: readonly { readonly id: string }[]
  readonly overlays?: readonly { readonly id: string }[]
}

export type HostMaterial = DesignerMaterial<RuntimeMaterialUI> | ViewerMaterial
export type HostExtension = DesignerExtension<RuntimeDesignerUI>
export type HostKind = 'designer' | 'viewer'
export type HostState = 'initializing' | 'active' | 'disposing' | 'disposed'
export type CapabilityPoint = 'material' | 'designer.command' | 'designer.palette' | 'designer.properties' | 'designer.toolbar' | 'designer.context-menu' | 'designer.overlay'

export interface ContributionOwner {
  readonly pluginId: string
  readonly installationId: string
  readonly contributionId: string
}

export interface OwnedContribution<T = unknown> {
  readonly point: CapabilityPoint
  readonly key: string
  readonly owner: ContributionOwner
  readonly value: DeepReadonly<T>
}

export interface CleanupError {
  readonly owner: ContributionOwner
  readonly phase: 'consumer' | 'scope' | 'late'
  readonly cause: unknown
}

export interface DisposeResult {
  readonly errors: readonly CleanupError[]
}

export interface LocaleDiagnostic {
  readonly code: 'locale-conflict' | 'locale-invalid' | 'locale-missing'
  readonly language: string
  readonly key: string
  readonly source: ContributionOwner
  readonly adoptedSource?: ContributionOwner
}

export interface HostRegistry<M extends HostMaterial> {
  readonly materials: readonly OwnedContribution<M>[]
  readonly getMaterial: (type: string) => OwnedContribution<M> | undefined
  readonly getCommand: (id: string) => OwnedContribution<DesignerCommand<never, unknown>> | undefined
  readonly contributions: (point: CapabilityPoint) => readonly OwnedContribution[]
}

export type HostConfig<M extends HostMaterial> = {
  readonly materials: readonly M[]
  readonly locale?: { readonly code?: string, readonly messages?: LocaleTree }
} & (
  | { readonly kind: 'designer', readonly materials: readonly DesignerMaterial<RuntimeMaterialUI>[], readonly extensions?: readonly HostExtension[] }
  | { readonly kind: 'viewer', readonly materials: readonly ViewerMaterial[], readonly extensions?: never }
)

export interface Host<M extends HostMaterial> {
  readonly kind: HostKind
  readonly state: HostState
  readonly generation: number
  readonly registry: HostRegistry<M>
  readonly localeDiagnostics: readonly LocaleDiagnostic[]
  /** Late cleanup is separate from diagnostics for current rendering work. */
  readonly lateCleanupErrors: readonly CleanupError[]
  readonly t: (key: string) => string
  readonly setLocale: (code?: string, messages?: LocaleTree) => void
  readonly resources: (owner: string | ContributionOwner) => ResourceContext
  readonly runTask: <T>(materialType: string, acquire: (context: ResourceContext) => Promise<T>, release?: (value: T) => void | Promise<void>) => Promise<T | undefined>
  readonly destroy: () => Promise<DisposeResult>
}

/** Framework consumer seam, never a plugin service container or setup callback. */
export interface ConsumerContext extends ResourceContext {
  readonly resources: (owner: string | ContributionOwner) => ResourceContext
  /** Final locale view is available while the core consumer initializes. */
  readonly t: (key: string) => string
}

export type InitializeConsumer<M extends HostMaterial> = (registry: HostRegistry<M>, context: ConsumerContext) => void | Promise<void>

export interface LocaleSource {
  readonly owner: ContributionOwner
  readonly declaration: LocaleDeclaration
}
