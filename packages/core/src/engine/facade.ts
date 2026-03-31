import type { Command, SchemaOperations } from '../command'
import type { DataSourceRegistration } from '../datasource'
import type { FontProvider } from '../font'
import type { LayoutResult } from '../layout'
import type { MigrationRegistry } from '../migration'
import type {
  EasyInkPlugin,
  PluginHooks,
} from '../plugin'
import type { TemplateSchema } from '../schema'
import { CommandManager } from '../command'
import { DataResolver, DataSourceManager, registerBuiltinFormatters } from '../datasource'
import { FontManager } from '../font'
import { LayoutEngine } from '../layout'
import { builtinMaterialTypes, MaterialRegistry } from '../materials'
import { createPluginHooks, PluginManager } from '../plugin'
import { SchemaEngine } from '../schema'

// ─── 事件类型映射 ───

/**
 * EasyInkEngine 暴露的事件名 → hooks AsyncEvent 名映射
 */
const EVENT_MAP: Record<string, keyof PluginHooks> = {
  'designer:ready': 'designerReady',
  'export:completed': 'exportCompleted',
  'schema:change': 'schemaChanged',
  'selection:change': 'selectionChanged',
}

// ─── 配置项 ───

/**
 * EasyInkEngine 配置项
 */
export interface EasyInkEngineOptions {
  /** 初始 Schema */
  schema?: TemplateSchema
  /** 插件列表（按顺序安装） */
  plugins?: EasyInkPlugin[]
  /** 数据源注册列表 */
  dataSources?: Array<{ name: string } & DataSourceRegistration>
  /** auto height 元素的默认估算高度 */
  defaultFlowHeight?: number
  /** Schema 版本迁移注册表 */
  migrationRegistry?: MigrationRegistry
  /** 字体提供者 */
  fontProvider?: FontProvider
}

// ─── EasyInkEngine ───

/**
 * EasyInkEngine — 门面类，整合所有子系统为统一 API
 *
 * 构造顺序：
 * 1. hooks（钩子实例化）
 * 2. materialRegistry（注册内置物料类型）
 * 3. schemaEngine（持有 Schema 状态）
 * 4. commandManager（撤销/重做栈）
 * 5. dataSourceManager + dataResolver（数据源注册与解析）
 * 6. layoutEngine（布局计算）
 * 7. pluginManager（最后安装插件，此时所有子系统就绪）
 */
export class EasyInkEngine {
  /** 子系统只读访问 */
  readonly schema: SchemaEngine
  readonly plugins: PluginManager
  readonly commands: CommandManager
  readonly dataSource: DataSourceManager
  readonly dataResolver: DataResolver
  readonly layout: LayoutEngine
  readonly materialRegistry: MaterialRegistry
  readonly font: FontManager
  readonly migration: MigrationRegistry | undefined

  private _hooks: PluginHooks
  private _data: Record<string, unknown> = {}
  private _destroyed = false

  constructor(options?: EasyInkEngineOptions) {
    // 1. 创建钩子实例
    this._hooks = createPluginHooks()

    // 2. 物料注册中心（注册内置类型）
    this.materialRegistry = new MaterialRegistry()
    this.materialRegistry.registerAll(builtinMaterialTypes)

    // 3. 迁移注册表
    this.migration = options?.migrationRegistry

    // 4. Schema 引擎
    this.schema = new SchemaEngine({
      schema: options?.schema,
      hooks: this._hooks,
      materialRegistry: this.materialRegistry,
      migrationRegistry: this.migration,
    })

    // 5. 命令管理器
    this.commands = new CommandManager()

    // 6. 数据源
    this.dataSource = new DataSourceManager()
    this.dataResolver = new DataResolver()
    registerBuiltinFormatters(this.dataResolver)

    if (options?.dataSources) {
      for (const ds of options.dataSources) {
        this.dataSource.register(ds.name, {
          displayName: ds.displayName,
          icon: ds.icon,
          fields: ds.fields,
        })
      }
    }

    // 7. 布局引擎
    this.layout = new LayoutEngine({
      defaultFlowHeight: options?.defaultFlowHeight,
    })

    // 8. 字体管理
    this.font = new FontManager(options?.fontProvider)

    // 9. 插件（最后安装，此时所有子系统就绪）
    this.plugins = new PluginManager(this._hooks)

    if (options?.plugins) {
      this.plugins.installAll(options.plugins)
    }
  }

  /** 获取钩子实例（供高级用法） */
  get hooks(): PluginHooks {
    return this._hooks
  }

  // ── 数据 ──

  /**
   * 设置运行时数据
   *
   * 触发 beforeDataResolve waterfall hook，插件可在 resolve 前修改数据。
   */
  setData(data: Record<string, unknown>): void {
    this._ensureNotDestroyed()
    this._data = this._hooks.beforeDataResolve.call(data)
  }

  /** 获取当前数据 */
  getData(): Record<string, unknown> {
    return this._data
  }

  // ── 布局 ──

  /**
   * 计算当前 Schema + 数据的布局
   */
  calculateLayout(): LayoutResult {
    this._ensureNotDestroyed()
    return this.layout.calculate(this.schema.schema, this._data)
  }

  // ── Schema 便捷方法 ──

  /** 导出 Schema 深拷贝 */
  getSchema(): TemplateSchema {
    return this.schema.toJSON()
  }

  /** 加载 Schema（替换当前状态） */
  loadSchema(schema: TemplateSchema): void {
    this._ensureNotDestroyed()
    this.schema.loadSchema(schema)
  }

  // ── 命令 ──

  /**
   * 获取 SchemaOperations（传给 command 工厂函数）
   */
  get operations(): SchemaOperations {
    return this.schema.operations
  }

  /**
   * 执行命令
   *
   * 先触发 beforeSchemaChange bail hook，被拦截则不执行。
   */
  execute(command: Command): void {
    this._ensureNotDestroyed()
    const intercepted = this._hooks.beforeSchemaChange.call({
      type: 'update',
    })
    if (intercepted === true)
      return

    this.commands.execute(command)
  }

  /** 撤销 */
  undo(): void {
    this._ensureNotDestroyed()
    this.commands.undo()
  }

  /** 重做 */
  redo(): void {
    this._ensureNotDestroyed()
    this.commands.redo()
  }

  // ── 插件便捷方法 ──

  /** 安装插件 */
  installPlugin(plugin: EasyInkPlugin): void {
    this._ensureNotDestroyed()
    this.plugins.install(plugin)
  }

  /** 卸载插件 */
  uninstallPlugin(name: string): void {
    this._ensureNotDestroyed()
    this.plugins.uninstall(name)
  }

  // ── 数据源便捷方法 ──

  /** 注册数据源 */
  registerDataSource(name: string, registration: DataSourceRegistration): void {
    this._ensureNotDestroyed()
    this.dataSource.register(name, registration)
  }

  /** 注销数据源 */
  unregisterDataSource(name: string): void {
    this._ensureNotDestroyed()
    this.dataSource.unregister(name)
  }

  // ── 事件代理 ──

  /**
   * 监听事件
   *
   * 支持的事件名：
   * - `schema:change` — Schema 已变更
   * - `selection:change` — 选中元素变更
   * - `export:completed` — 导出完成
   * - `designer:ready` — 设计器初始化完成
   */
  on(event: string, listener: (...args: any[]) => void): void {
    this._ensureNotDestroyed()
    const hookName = EVENT_MAP[event]
    if (!hookName) {
      throw new TypeError(`Unknown event: "${event}"`)
    }
    const hook = this._hooks[hookName] as { on: (name: string, fn: (...args: any[]) => void) => void }
    hook.on(event, listener)
  }

  /**
   * 取消监听事件
   */
  off(event: string, _listener: (...args: any[]) => void): void {
    const hookName = EVENT_MAP[event]
    if (!hookName) {
      throw new TypeError(`Unknown event: "${event}"`)
    }
    const hook = this._hooks[hookName] as { off: (name: string) => void }
    hook.off(event)
  }

  // ── 生命周期 ──

  /** 是否已销毁 */
  get destroyed(): boolean {
    return this._destroyed
  }

  /**
   * 销毁引擎，清理所有子系统
   */
  destroy(): void {
    if (this._destroyed)
      return

    this.plugins.clear()
    this.dataSource.clear()
    this.dataResolver.clear()
    this.commands.clear()
    this.materialRegistry.clear()
    this.font.clear()
    this._data = {}
    this._destroyed = true
  }

  // ── 内部 ──

  private _ensureNotDestroyed(): void {
    if (this._destroyed) {
      throw new Error('EasyInkEngine has been destroyed')
    }
  }
}
