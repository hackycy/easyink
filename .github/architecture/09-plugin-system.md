# 9. 内部扩展机制

## 9.1 当前定位

EasyInk 仍然保留扩展抽象，但当前阶段**不把它定义为稳定的第三方插件系统**。这些机制主要服务仓库内的物料包、设计器面板和内部钩子编排。

因此本节描述的是**内部扩展契约**，而不是对外承诺的公共插件 API。

补充约束：

- `PropSchema.visible` / `disabled` / `onChange` 等函数式能力属于代码级内部契约，而不是可序列化的公共协议。
- 编辑器注册、物料注册、交互策略注册在短期内都不提供面向第三方的兼容性承诺。
- 架构文档中出现的 registry/context 接口，默认应理解为仓库内可演进抽象，而不是外部稳定扩展面。

## 9.2 内部扩展上下文

```typescript
interface InternalExtensionContext {
  materials: {
    register(definition: MaterialTypeDefinition): void
    get(type: string): MaterialTypeDefinition | undefined
  }

  editors: {
    register(name: string, component: Component): void
  }

  panels: {
    addPanel(panel: PanelDefinition): void
  }

  toolbar: {
    addItem(item: ToolbarItem): void
    addContextMenuItem(item: ContextMenuItem): void
  }

  hooks: InternalHooks

  schema: {
    readonly current: TemplateSchema
    onChange(callback: (schema: TemplateSchema) => void): void
  }

  commands: {
    register(command: CommandDefinition): void
    execute(commandName: string, ...args: unknown[]): void
  }
}
```

## 9.3 内部钩子体系

```typescript
interface InternalHooks {
  /** 渲染前允许调整待渲染物料 */
  beforeRender: SyncWaterfallHook<[MaterialNode, RenderContext]>
  /** 渲染后允许补充 DOM 属性 */
  afterRender: SyncWaterfallHook<[HTMLElement, MaterialNode]>
  /** 创建物料前允许补齐默认值 */
  beforeMaterialCreate: SyncWaterfallHook<[MaterialNode]>
  /** 数据解析前允许替换整个展示值对象 */
  beforeDataResolve: SyncWaterfallHook<[Record<string, unknown>]>
  /** Schema 变更前允许拦截 */
  beforeSchemaChange: SyncBailHook<[SchemaChangeEvent], boolean>

  schemaChanged: AsyncEvent<[TemplateSchema]>
  selectionChanged: AsyncEvent<[string[]]>
  designerReady: AsyncEvent<[]>
}
```

## 9.4 明确不在当前扩展面中的能力

- 模板动态计算能力注入
- 格式化器注册
- PDF 生成器注册
- 图片导出后处理
- 面向第三方生态的稳定版本兼容承诺

以上能力若未来重新引入，也应作为独立扩展主题另立文档，而不是恢复单独的运行时动态计算主架构章节。

## 9.5 钩子类型定义

```typescript
interface SyncWaterfallHook<Args extends unknown[]> {
  tap(name: string, fn: (...args: Args) => Args[0]): void
  call(...args: Args): Args[0]
}

interface SyncBailHook<Args extends unknown[], R> {
  tap(name: string, fn: (...args: Args) => R | undefined): void
  call(...args: Args): R | undefined
}

interface AsyncEvent<Args extends unknown[]> {
  on(name: string, fn: (...args: Args) => void | Promise<void>): void
  emit(...args: Args): void
}
```
