# 10. 插件系统

> **物料与插件的区别**：物料（Material）专注于「一个元素类型的全部实现」（定义 + 渲染 + 设计器交互），通过 `engine.useMaterial()` 注册。插件（Plugin）用于跨元素的全局扩展（钩子拦截、面板扩展、工具栏按钮、格式化器、PDF 生成器等），通过 `engine.use()` 注册。两者职责不重叠，互不替代。详见 [12-物料体系](./12-element-system.md)。

## 10.1 插件定义

```typescript
interface EasyInkPlugin {
  /** 插件唯一标识 */
  name: string
  /** 插件版本 */
  version?: string
  /** 依赖的其他插件 */
  dependencies?: string[]

  /**
   * 插件安装方法
   * @param context - 插件上下文，提供所有注册 API
   */
  install(context: PluginContext): void | (() => void)
}

/**
 * 工厂函数模式（推荐的插件编写方式）
 *
 * 注意：元素类型注册已迁移到物料系统（engine.useMaterial），
 * 插件不再负责注册元素。插件专注于全局扩展能力。
 */
function watermarkPlugin(options?: WatermarkPluginOptions): EasyInkPlugin {
  return {
    name: 'watermark',
    install(ctx) {
      // 注册渲染钩子（全局扩展，非元素特定）
      ctx.hooks.afterRender.tap('watermark', (el, node) => {
        // 在渲染后添加水印层
      })
      // 注册导出后处理器
      ctx.export.addPostProcessor(watermarkProcessor)
    },
  }
}
```

## 10.2 插件上下文 API

```typescript
interface PluginContext {
  // --- 元素查询（只读，注册已迁移到物料系统） ---
  elements: {
    /** 获取已注册的元素类型 */
    get(type: string): ElementTypeDefinition | undefined
  }

  // --- 属性编辑器注册 ---
  editors: {
    /** 注册自定义属性编辑器组件 */
    register(name: string, component: Component): void
  }

  // --- 工具栏扩展 ---
  toolbar: {
    /** 添加工具栏按钮/分组 */
    addItem(item: ToolbarItem): void
    /** 添加右键菜单项 */
    addContextMenuItem(item: ContextMenuItem): void
  }

  // --- 面板扩展 ---
  panels: {
    /** 添加自定义侧边面板 */
    addPanel(panel: PanelDefinition): void
  }

  // --- 钩子系统 ---
  hooks: PluginHooks

  // --- 数据处理 ---
  data: {
    /** 注册数据中间件（在数据填充前/后处理数据） */
    addMiddleware(middleware: DataMiddleware): void
    /** 注册自定义格式化器 */
    addFormatter(name: string, formatter: FormatterFunction): void
  }

  // --- 导出管线 ---
  export: {
    /** 注册 PDF 生成器 */
    registerPDFGenerator(generator: PDFGenerator): void
    /** 注册导出后处理器（如添加水印） */
    addPostProcessor(processor: ExportPostProcessor): void
  }

  // --- 表达式引擎 ---
  expression: {
    /** 替换默认表达式引擎 */
    setEngine(engine: ExpressionEngine): void
    /** 注册 helper 函数（在表达式中可用） */
    addHelper(name: string, fn: Function): void
  }

  // --- Schema 操作 ---
  schema: {
    readonly current: TemplateSchema
    /** 监听 Schema 变化 */
    onChange(callback: (schema: TemplateSchema) => void): void
  }

  // --- 命令系统 ---
  commands: {
    /** 注册自定义命令 */
    register(command: CommandDefinition): void
    /** 执行命令 */
    execute(commandName: string, ...args: unknown[]): void
  }
}
```

## 10.3 分类钩子体系

钩子分为两类：**同步钩子**（SyncHook）可拦截和修改核心流程；**异步事件**（AsyncEvent）只做通知，不阻塞流程：

```typescript
interface PluginHooks {
  // --- 同步钩子（可拦截/修改） ---

  /** 渲染前 -- 可修改待渲染元素的属性 */
  beforeRender: SyncWaterfallHook<[ElementNode, RenderContext]>
  /** 渲染后 -- 可修改生成的 DOM 节点 */
  afterRender: SyncWaterfallHook<[HTMLElement, ElementNode]>
  /** 导出前 -- 可修改导出配置或注入内容（如水印） */
  beforeExport: SyncWaterfallHook<[ExportContext]>
  /** 元素创建前 -- 可修改默认属性 */
  beforeElementCreate: SyncWaterfallHook<[ElementNode]>
  /** 数据解析前 -- 可修改数据上下文 */
  beforeDataResolve: SyncWaterfallHook<[Record<string, unknown>]>
  /** Schema 变更前 -- 可拦截或修改变更 */
  beforeSchemaChange: SyncBailHook<[SchemaChangeEvent], boolean>

  // --- 异步事件（仅通知） ---

  /** Schema 已变更 */
  schemaChanged: AsyncEvent<[TemplateSchema]>
  /** 选中元素变更 */
  selectionChanged: AsyncEvent<[string[]]>
  /** 导出完成 */
  exportCompleted: AsyncEvent<[ExportResult]>
  /** 设计器初始化完成 */
  designerReady: AsyncEvent<[]>
}
```

## 10.4 钩子类型定义

```typescript
/**
 * SyncWaterfallHook -- 同步瀑布钩子
 * 每个 tap 接收上一个 tap 的返回值，最终结果返回给调用方
 * 用于「修改」场景
 */
interface SyncWaterfallHook<Args extends unknown[]> {
  tap(name: string, fn: (...args: Args) => Args[0]): void
  call(...args: Args): Args[0]
}

/**
 * SyncBailHook -- 同步熔断钩子
 * 任一 tap 返回非 undefined 值时停止后续执行
 * 用于「拦截/取消」场景
 */
interface SyncBailHook<Args extends unknown[], R> {
  tap(name: string, fn: (...args: Args) => R | undefined): void
  call(...args: Args): R | undefined
}

/**
 * AsyncEvent -- 异步通知事件
 * 所有监听器并行执行，不影响核心流程
 * 用于「监听/响应」场景
 */
interface AsyncEvent<Args extends unknown[]> {
  on(name: string, fn: (...args: Args) => void | Promise<void>): void
  emit(...args: Args): void
}
```
