# 23. Contribution 机制

本文档描述 Designer 的 Contribution 扩展点：如何在不修改 Designer 源码的前提下注入面板、工具栏动作和命令。

## 23.1 设计动机

Designer 需要支持外部能力注入（AI 面板、审计面板、素材市场等），但不能为每个新能力新增 prop 或 event。Contribution 机制借鉴 VS Code 的 Extension Point 思路：Designer 只暴露注册协议，外部包通过协议注入能力。

## 23.2 核心接口

```ts
interface Contribution {
  id: string
  activate: (ctx: ContributionContext) => void
}

interface ContributionContext {
  store: DesignerStore
  registerPanel: (panel: PanelDescriptor) => void
  registerToolbarAction: (action: ToolbarActionDescriptor) => void
  registerCommand: <A, R>(command: Command<A, R>) => void
  executeCommand: <A, R>(id: string, args?: A) => Promise<R>
  confirm: (request: DesignerConfirmRequest) => Promise<boolean>
  pickAsset: (request: DesignerAssetPickRequest) => Promise<DesignerResolvedAsset | null>
  onDispose: (fn: () => void) => void
  onDiagnostic: (fn: (entry: Diagnostic) => void) => () => void
}
```

### 23.2.1 PanelDescriptor

```ts
interface PanelDescriptor {
  id: string
  component: Component
  teleportTarget?: string  // 默认 '#ei-overlay-root'
  props?: Record<string, unknown>  // 支持响应式 getter
}
```

### 23.2.2 ToolbarActionDescriptor

```ts
interface ToolbarActionDescriptor {
  id: string
  icon: Component
  label: string
  onClick: (ctx: ContributionContext) => void
}
```

### 23.2.3 Command

```ts
interface Command<TArgs = unknown, TResult = unknown> {
  id: string
  handler: (args: TArgs, ctx: ContributionContext) => TResult | Promise<TResult>
}
```

## 23.3 ContributionRegistry 实现

`ContributionRegistry` 位于 `packages/designer/src/contributions/contribution-registry.ts`：

```ts
class ContributionRegistry {
  panels: PanelDescriptor[]           // shallowReactive
  toolbarActions: ToolbarActionDescriptor[]  // shallowReactive
  private _commands: Map<string, Command>
  private _disposers: Array<() => void>

  activate(contributions: Contribution[], store: DesignerStore): void
  dispose(): void
  registerPanel(panel: PanelDescriptor): void
  registerToolbarAction(action: ToolbarActionDescriptor): void
  registerCommand<A, R>(command: Command<A, R>): void
  executeCommand<A, R>(id: string, args?: A): Promise<R>
}
```

关键行为：

- **重复 id 抛错**：`registerPanel`、`registerToolbarAction`、`registerCommand` 遇到重复 id 立即 throw
- **命令未找到抛错**：`executeCommand` 找不到 id 时 throw
- **统一 dispose**：`dispose()` 执行所有 `onDispose` 回调，清空 panels、toolbarActions、commands

## 23.4 注入方式

`EasyInkDesigner` 组件接收 `contributions: Contribution[]` prop：

```vue
<EasyInkDesigner
  v-model:schema="schema"
  :contributions="[myContribution]"
/>
```

内部流程：

1. 组件 mount 时创建 `ContributionRegistry` 实例
2. 调用 `registry.activate(props.contributions, store)`
3. 通过 `provide(CONTRIBUTION_REGISTRY_KEY, { registry, context })` 暴露给子组件
4. 工具栏组件 `inject` registry 后渲染所有已注册的 toolbar actions
5. 面板通过 Teleport 挂载到 `#ei-overlay-root`
6. 组件 unmount 时调用 `registry.dispose()`

## 23.5 响应式 Props

Panel 的 `props` 支持 getter，实现 Vue 响应式追踪：

```ts
ctx.registerPanel({
  id: 'my.panel',
  component: MyPanel,
  props: {
    get open() { return open.value },        // 响应式
    get schema() { return ctx.store.schema }, // 响应式
    onClose: () => { open.value = false },   // 事件回调
  },
})
```

面板组件通过 `v-bind="panel.props"` 消费这些 getter，Vue 的依赖追踪自动生效。

## 23.6 宿主交互

Contribution 不应直接调用浏览器原生 API。破坏性确认和资产选择走宿主交互层：

- `ctx.confirm(request)` → 进入宿主 `DesignerInteractionProvider`
- `ctx.pickAsset(request)` → 进入宿主资产选择器

这样宿主可以统一处理权限、审计和 UI 风格。

## 23.7 生命周期

```
EasyInkDesigner mount
  → ContributionRegistry.activate()
    → contribution.activate(ctx)
      → registerPanel / registerToolbarAction / registerCommand
      → onDispose(cleanup)

EasyInkDesigner unmount
  → ContributionRegistry.dispose()
    → 执行所有 onDispose 回调
    → 清空 panels / toolbarActions / commands
```

嵌入式场景、路由切换和 HMR 都可能让 Designer 反复挂载。Contribution 不应假设自己会一直存在。

## 23.8 命名空间约定

- 命令 id 使用 `namespace.action` 格式，如 `assistant.open`、`review.togglePanel`
- 面板 id 使用 `namespace.panel` 格式
- 工具栏 id 使用 `namespace.action.button` 格式

## 23.9 与物料扩展的区别

| 维度 | 物料扩展 | Contribution |
|------|---------|-------------|
| 注册时机 | `setupStore` 回调 | `contributions` prop |
| 扩展目标 | 画布节点（新元素类型） | 设计器外围（面板、按钮、命令） |
| 依赖方向 | 物料包 → designer 类型 | contribution 包 → designer 类型 |
| 典型用途 | 价格签、图表、自定义容器 | AI 面板、审计面板、素材市场 |

## 23.10 实际应用：Assistant Contribution

`@easyink/assistant-designer-bridge` 是 Contribution 机制的典型应用，它注册了：

- 9 个命令（open、close、togglePanel、applyResult、applyPatch、applySelectedElements、applyDataSource、rollback、attachCurrentSelection）
- 1 个工具栏按钮（AI 助手开关）
- 1 个异步面板（AssistantPanel，通过 `defineAsyncComponent` 按需加载）

面板通过响应式 getter 传递 `materialManifest`（含物料 knowledge 字段），使 AI 能实时感知已注册物料的能力和约束。详见 [25-ai-assistant](./25-ai-assistant.md)。
