import type { DesignerStore } from '../store/designer-store'
import type { Command, Contribution, ContributionContext, PanelDescriptor, ToolbarActionDescriptor } from './types'
import { markRaw, shallowReactive } from 'vue'

/**
 * Internal registry that stores activated contributions' panels, toolbar
 * actions, and commands. Designer renders from these reactive lists.
 *
 * Uses shallowReactive so descriptor.component / icon stay raw — Vue must not
 * proxy component definitions (it would warn and break async wrappers).
 */
export class ContributionRegistry {
  readonly panels = shallowReactive<PanelDescriptor[]>([])
  readonly toolbarActions = shallowReactive<ToolbarActionDescriptor[]>([])
  private readonly _commands = new Map<string, Command>()
  private readonly _disposers: Array<() => void> = []
  private _context: ContributionContext | null = null

  get context(): ContributionContext {
    if (!this._context) {
      throw new Error('[easyink] ContributionRegistry has not been activated')
    }
    return this._context
  }

  activate(contributions: Contribution[], store: DesignerStore): ContributionContext {
    const ctx: ContributionContext = {
      store,
      registerPanel: panel => this.registerPanel(panel),
      registerToolbarAction: action => this.registerToolbarAction(action),
      registerCommand: command => this.registerCommand(command as Command),
      executeCommand: <TArgs = unknown, TResult = unknown>(id: string, args?: TArgs) =>
        this.executeCommand<TArgs, TResult>(id, args, ctx),
      onDispose: fn => this._disposers.push(fn),
    }
    this._context = ctx
    for (const contribution of contributions) {
      contribution.activate(ctx)
    }
    return ctx
  }

  private registerPanel(panel: PanelDescriptor): void {
    if (this.panels.some(p => p.id === panel.id)) {
      throw new Error(`[easyink] Panel "${panel.id}" already registered`)
    }
    this.panels.push(markRaw(panel))
  }

  private registerToolbarAction(action: ToolbarActionDescriptor): void {
    if (this.toolbarActions.some(a => a.id === action.id)) {
      throw new Error(`[easyink] Toolbar action "${action.id}" already registered`)
    }
    this.toolbarActions.push(markRaw(action))
  }

  private registerCommand(command: Command): void {
    if (this._commands.has(command.id)) {
      throw new Error(`[easyink] Command "${command.id}" already registered`)
    }
    this._commands.set(command.id, command)
  }

  private async executeCommand<TArgs, TResult>(
    id: string,
    args: TArgs | undefined,
    ctx: ContributionContext,
  ): Promise<TResult> {
    const command = this._commands.get(id)
    if (!command) {
      throw new Error(`[easyink] Command "${id}" not found`)
    }
    return (await command.handler(args as TArgs, ctx)) as TResult
  }

  dispose(): void {
    for (const fn of this._disposers) {
      try {
        fn()
      }
      catch (err) {
        console.error('[easyink] Contribution dispose error:', err)
      }
    }
    this._disposers.length = 0
    this.panels.length = 0
    this.toolbarActions.length = 0
    this._commands.clear()
    this._context = null
  }
}
