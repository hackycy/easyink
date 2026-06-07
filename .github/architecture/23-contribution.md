# 23. Contribution 机制

本文档描述 Designer 的 Contribution 扩展点：如何在不修改 Designer 源码的前提下注入面板、工具栏动作和命令。

## 23.1 设计动机

Designer 需要支持外部能力注入（AI 面板、审计面板、素材市场等），但不能为每个新能力新增 prop 或 event。Contribution 机制借鉴 VS Code 的 Extension Point 思路：Designer 只暴露注册协议，外部包通过协议注入能力。

Contribution 还应拥有自己的语义文案。Designer 内置语言包只维护 Designer 自身文案，外部 contribution 不应把自己的 UI 文案追加到 `@easyink/locales`。需要多语言时，contribution 在激活阶段向 `DesignerStore` 注册扩展文案。

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
  pickFileText: (request: DesignerTextFilePickRequest) => Promise<DesignerResolvedTextFile | null>
  onDispose: (fn: () => void) => void
  onDiagnostic: (fn: (entry: Diagnostic) => void) => () => void
}
```

`ctx.store` 同时提供 locale 扩展注册入口：

```ts
interface LocaleMessageRegistration {
  messages?: LocaleMessages
  locales?: Record<string, LocaleMessages>
}

class DesignerStore {
  setLocale(locale: LocaleMessages, code?: string): void
  registerLocaleMessages(registration: LocaleMessageRegistration): () => void
  t(key: string): string
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

Contribution 不应直接调用浏览器原生 API。破坏性确认、资产选择和文本文件读取走宿主交互层：

- `ctx.confirm(request)` → 进入宿主 `DesignerInteractionProvider`
- `ctx.pickAsset(request)` → 进入宿主资产选择器
- `ctx.pickFileText(request)` → 进入宿主文本文件选择器，返回文件文本而不是资产 URL

这样宿主可以统一处理权限、审计和 UI 风格。

## 23.7 语义文案与 i18n 注册

Contribution 的文案归属 contribution 自己。推荐每个 contribution 包内维护自己的 `locale.ts`，并在 `activate()` 中注册：

```ts
const reviewMessages = {
  messages: {
    designer: {
      review: {
        toolbar: { label: 'Review' },
        panel: { title: 'Review Panel' },
      },
    },
  },
  locales: {
    'zh-CN': {
      designer: {
        review: {
          toolbar: { label: '审阅' },
          panel: { title: '审阅面板' },
        },
      },
    },
    'en-US': {
      designer: {
        review: {
          toolbar: { label: 'Review' },
          panel: { title: 'Review Panel' },
        },
      },
    },
  },
}

activate(ctx) {
  const unregisterMessages = ctx.store.registerLocaleMessages(reviewMessages)

  ctx.registerToolbarAction({
    id: 'review.toggle',
    icon: IconSparkles,
    label: 'designer.review.toolbar.label',
    onClick: () => void ctx.executeCommand('review.togglePanel'),
  })

  ctx.onDispose(unregisterMessages)
}
```

`store.t(key)` 的解析优先级：

1. 宿主传入的 `locale`。
2. 当前 `localeCode` 对应的 contribution 注册文案。
3. contribution 注册的默认 `messages`。
4. 原始 key。

这个优先级保证宿主可以覆盖任意 contribution 文案，同时 contribution 不需要修改 `@easyink/locales` 就能交付默认中英文文案。`EasyInkDesigner` 会对内置 `zh-CN` / `en-US` locale 自动推断 `localeCode`；宿主使用自定义语言包时可以显式传入 `localeCode`。

Toolbar action 的 `label` 建议使用 locale key。Designer 渲染工具栏时会通过 `store.t(action.label)` 转换，未命中时显示原始字符串。

## 23.8 生命周期

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

如果 contribution 注册了 locale messages，应把 `registerLocaleMessages()` 返回的取消函数放进 `onDispose()`，避免 Designer 反复挂载后保留过期文案。

## 23.9 命名空间约定

- 命令 id 使用 `namespace.action` 格式，如 `assistant.open`、`review.togglePanel`
- 面板 id 使用 `namespace.panel` 格式
- 工具栏 id 使用 `namespace.action.button` 格式
- 文案 key 使用 `designer.namespace.*` 格式，如 `designer.assistant.toolbar.label`

## 23.10 与物料扩展的区别

| 维度 | 物料扩展 | Contribution |
|------|---------|-------------|
| 注册时机 | `setupStore` 回调 | `contributions` prop |
| 扩展目标 | 画布节点（新元素类型） | 设计器外围（面板、按钮、命令） |
| 依赖方向 | 物料包 → designer 类型 | contribution 包 → designer 类型 |
| 典型用途 | 价格签、图表、自定义容器 | AI 面板、审计面板、素材市场 |

## 23.11 实际应用：Assistant Contribution

`@easyink/assistant-designer-bridge` 是 Contribution 机制的典型应用，它注册了：

- 9 个命令（open、close、togglePanel、applyResult、applyPatch、applySelectedElements、applyDataSource、rollback、attachCurrentSelection）
- 1 个工具栏按钮（AI 助手开关）
- 1 个异步面板（AssistantPanel，通过 `defineAsyncComponent` 按需加载）
- 1 组 locale messages（`zh-CN`、`en-US` 和默认 fallback）

面板通过响应式 getter 传递 `materialManifest`（含物料 knowledge 字段），使 AI 能实时感知已注册物料的能力和约束。详见 [25-ai-assistant](./25-ai-assistant.md)。
