import type { Component } from 'vue'
import type { DesignerStore } from '../store/designer-store'

/**
 * Descriptor for a panel contributed to the designer overlay layer.
 * Panels are mounted via Vue Teleport; the contribution owns its own layout.
 */
export interface PanelDescriptor {
  /** Unique panel id. Duplicate registration throws. */
  id: string
  /** Vue component to render. May be defineAsyncComponent. */
  component: Component
  /** CSS selector for the Teleport target. Defaults to '#ei-overlay-root'. */
  teleportTarget?: string
  /** Static props to pass to the component. `store` is always injected. */
  props?: Record<string, unknown>
}

/**
 * Descriptor for a button injected into TopBar's actions slot.
 */
export interface ToolbarActionDescriptor {
  /** Unique action id. Duplicate registration throws. */
  id: string
  /** Vue component rendering the icon (recommended size 16, stroke-width 1.5). */
  icon: Component
  /** Tooltip / accessible label. */
  label: string
  /** Click handler; receives the contribution context. */
  onClick: (ctx: ContributionContext) => void
}

/**
 * Command registered on the designer.
 * Commands form a uniform invocation surface for actions / shortcuts.
 */
export interface Command<TArgs = unknown, TResult = unknown> {
  id: string
  handler: (args: TArgs, ctx: ContributionContext) => TResult | Promise<TResult>
}

/**
 * Context passed to contribution `activate` hooks and registered handlers.
 */
export interface ContributionContext {
  store: DesignerStore
  registerPanel: (panel: PanelDescriptor) => void
  registerToolbarAction: (action: ToolbarActionDescriptor) => void
  registerCommand: <TArgs, TResult>(command: Command<TArgs, TResult>) => void
  executeCommand: <TArgs = unknown, TResult = unknown>(id: string, args?: TArgs) => Promise<TResult>
  /** Register a cleanup callback fired when the designer unmounts. */
  onDispose: (fn: () => void) => void
}

/**
 * A contribution bundles panels / toolbar actions / commands behind an
 * `activate` hook. Pass instances to `<EasyInkDesigner :contributions>`.
 */
export interface Contribution {
  /** Unique contribution id (used for diagnostics, not enforced). */
  id: string
  activate: (ctx: ContributionContext) => void
}
