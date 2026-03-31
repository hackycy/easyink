import type { EasyInkPlugin, PluginContext, PluginHooks } from './types'
import { AsyncEvent, SyncBailHook, SyncWaterfallHook } from './hooks'

/**
 * 创建一套全新的 PluginHooks 实例
 */
export function createPluginHooks(): PluginHooks {
  return {
    // 同步钩子
    beforeRender: new SyncWaterfallHook(),
    afterRender: new SyncWaterfallHook(),
    beforeExport: new SyncWaterfallHook(),
    beforeMaterialCreate: new SyncWaterfallHook(),
    beforeDataResolve: new SyncWaterfallHook(),
    beforeSchemaChange: new SyncBailHook(),
    // 异步事件
    schemaChanged: new AsyncEvent(),
    selectionChanged: new AsyncEvent(),
    exportCompleted: new AsyncEvent(),
    designerReady: new AsyncEvent(),
  }
}

/**
 * 已安装插件的记录
 */
interface InstalledPlugin {
  plugin: EasyInkPlugin
  dispose?: () => void
}

/**
 * PluginManager — 管理插件的安装、卸载和依赖检查
 */
export class PluginManager {
  private installed = new Map<string, InstalledPlugin>()
  private hooks: PluginHooks

  constructor(hooks: PluginHooks) {
    this.hooks = hooks
  }

  /**
   * 安装插件
   * @throws 重复安装或依赖缺失时抛出错误
   */
  install(plugin: EasyInkPlugin): void {
    if (this.installed.has(plugin.name)) {
      throw new Error(`Plugin "${plugin.name}" is already installed.`)
    }

    // 检查依赖
    if (plugin.dependencies) {
      const missing = plugin.dependencies.filter(dep => !this.installed.has(dep))
      if (missing.length > 0) {
        throw new Error(
          `Plugin "${plugin.name}" requires missing dependencies: ${missing.join(', ')}`,
        )
      }
    }

    const context: PluginContext = {
      hooks: this.hooks,
    }

    const dispose = plugin.install(context) ?? undefined
    this.installed.set(plugin.name, { plugin, dispose })
  }

  /**
   * 批量安装插件（按数组顺序）
   */
  installAll(plugins: EasyInkPlugin[]): void {
    for (const plugin of plugins) {
      this.install(plugin)
    }
  }

  /**
   * 卸载插件
   * @throws 插件未安装或被其他插件依赖时抛出错误
   */
  uninstall(name: string): void {
    const record = this.installed.get(name)
    if (!record) {
      throw new Error(`Plugin "${name}" is not installed.`)
    }

    // 检查是否被其他插件依赖
    const dependents = this.getDependents(name)
    if (dependents.length > 0) {
      throw new Error(
        `Cannot uninstall "${name}": depended on by ${dependents.join(', ')}`,
      )
    }

    record.dispose?.()
    this.installed.delete(name)
  }

  /** 检查插件是否已安装 */
  has(name: string): boolean {
    return this.installed.has(name)
  }

  /** 获取已安装插件列表 */
  list(): string[] {
    return [...this.installed.keys()]
  }

  /** 获取依赖指定插件的其他插件名 */
  private getDependents(name: string): string[] {
    const dependents: string[] = []
    for (const [key, { plugin }] of this.installed) {
      if (plugin.dependencies?.includes(name)) {
        dependents.push(key)
      }
    }
    return dependents
  }

  /** 卸载全部插件（按安装逆序） */
  clear(): void {
    const names = [...this.installed.keys()].reverse()
    for (const name of names) {
      const record = this.installed.get(name)
      record?.dispose?.()
      this.installed.delete(name)
    }
  }
}
