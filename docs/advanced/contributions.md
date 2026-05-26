# 贡献扩展开发

Contribution 解决的不是“怎么用 Designer”，而是“怎么在不改 Designer 源码的前提下把宿主能力挂进去”。

## 使用场景

下面几种需求通常应该走 Contribution：

- 增加一个设计器面板
- 增加一个工具栏动作
- 定义一个可复用命令
- 订阅设计器诊断并转发给宿主系统

如果你只是想注册新物料，那先看 [自定义物料开发](/advanced/custom-materials)。

## 核心接口

```ts
interface Contribution {
  id: string
  activate: (ctx: ContributionContext) => void
}
```

这意味着 Contribution 最好理解成“初始化时注册能力”，而不是一段散落的业务脚本。

## `ContributionContext` 能力

源码里最核心的入口就是这些：

```ts
interface ContributionContext {
  store: DesignerStore
  registerPanel: (panel: PanelDescriptor) => void
  registerToolbarAction: (action: ToolbarActionDescriptor) => void
  registerCommand: <TArgs, TResult>(command: Command<TArgs, TResult>) => void
  executeCommand: <TArgs = unknown, TResult = unknown>(id: string, args?: TArgs) => Promise<TResult>
  confirm: (request) => Promise<boolean>
  pickAsset: (request) => Promise<DesignerResolvedAsset | null>
  onDispose: (fn: () => void) => void
  onDiagnostic: (fn: (entry: Diagnostic) => void) => () => void
}
```

如果只记一条分层原则，也够用了：面板和按钮只负责入口，真正可复用的动作尽量收敛成命令。

## 最小示例

```ts
export const helloContribution: Contribution = {
  id: 'demo.hello',
  activate(ctx) {
    ctx.registerCommand({
      id: 'demo.sayHello',
      handler: () => {
        console.log(ctx.store.schema.version)
      },
    })

    ctx.registerToolbarAction({
      id: 'demo.hello.button',
      icon: IconSparkles,
      label: 'Say Hello',
      onClick: () => {
        void ctx.executeCommand('demo.sayHello')
      },
    })
  },
}
```

接入方式也很直接：

```vue
<EasyInkDesigner
  v-model:schema="schema"
  :contributions="[helloContribution]"
/>
```

## `registerPanel()` 用途

适合持续存在的扩展能力，例如：

- AI 面板
- 资产选择器
- 审查面板
- 宿主侧日志面板

`PanelDescriptor` 当前支持 `id`、`component`、`teleportTarget` 和 `props`。如果没有特殊要求，面板会挂到默认的 `#ei-overlay-root`。

## `registerToolbarAction()` 用途

它只适合显式触发动作，不适合承载整条业务流程。

如果一个逻辑以后可能还会被面板、快捷键或其他扩展复用，就不要直接焊在按钮点击里，先做成命令。

## `confirm()` 与 `pickAsset()`

这两个入口都走宿主控制的交互层，而不是 Contribution 自己去直接操作浏览器 UI。

这意味着：

- 破坏性确认应走 `confirm()`
- 资产选择应走 `pickAsset()`

这样扩展能力仍然能保持宿主可控，而不是把交互细节写死在设计器内部。

## 诊断事件转发

如果你要把 Designer 内部诊断接入宿主系统，可以转给：

- 埋点系统
- Sentry / APM
- 业务提示条

```ts
const unsubscribe = ctx.onDiagnostic((entry) => {
  console.warn(`[designer:${entry.severity}] ${entry.message}`)
})
```

这里的关键不是打印日志，而是“把 Designer 内部可恢复问题往宿主系统转发”。`onDiagnostic()` 返回的取消函数可以用于提前取消订阅；如果不手动调用，ContributionRegistry 也会在 Designer dispose 时自动取消，避免路由切换或 HMR 后残留监听。

## 生命周期设计

Contribution 的实际生命周期可以理解成：

```text
mount designer
  -> activate()
  -> register panel / action / command / subscriptions
  -> user interaction
  -> designer unmount
  -> dispose callbacks
```

`onDispose()` 必须拿来清理这些东西：

- 事件监听
- 轮询
- 外部订阅
- contribution 自己维护的临时状态

不要假设 contribution 会一直存活。嵌入式场景、路由切换、HMR 都会让它被反复挂载和销毁。

## 可切换面板示例

这类结构最接近真实业务，也最适合作为起点。

```ts
import type { Contribution } from '@easyink/designer'
import { IconSparkles } from '@easyink/icons'
import { defineAsyncComponent, ref } from 'vue'

const ReviewPanel = defineAsyncComponent(() => import('./ReviewPanel.vue'))

export function createReviewContribution(): Contribution {
  const open = ref(false)

  return {
    id: 'demo.review',
    activate(ctx) {
      ctx.registerCommand({
        id: 'review.togglePanel',
        handler: () => {
          open.value = !open.value
        },
      })

      ctx.registerToolbarAction({
        id: 'review.toggle.button',
        icon: IconSparkles,
        label: 'Review',
        onClick: () => {
          void ctx.executeCommand('review.togglePanel')
        },
      })

      ctx.registerPanel({
        id: 'review.panel',
        component: ReviewPanel,
        props: {
          get open() {
            return open.value
          },
          'onUpdate:open': (next: boolean) => {
            open.value = next
          },
        },
      })

      ctx.onDispose(() => {
        open.value = false
      })
    },
  }
}
```

这个结构和仓库里的 AI contribution 是同一思路：

- 面板状态在 contribution 自己维护
- 工具栏只负责触发命令
- 命令统一切换状态
- 面板只消费 props

## 仓库实现参考

当前仓库里最直接的参考实现就是 AI 集成：

- `packages/ai/src/contribution.ts`

它做了三件事：

1. 注册 `ai.togglePanel` 命令
2. 注册顶部工具栏按钮
3. 注册异步加载的 AI 面板

如果你要做自己的业务扩展，这个实现比文档示例更接近真实工程写法。

## 常见错误

### 重复 ID

根因通常很简单：同一个 contribution 被重复挂载，或者你在 `activate()` 之外又做了一次注册。

### 按钮无响应

先查两点：

- 对应命令是不是成功注册了
- `onClick` 里是不是没有实际调用 `executeCommand()` 或状态切换

### 事件残留

说明你把外部订阅挂上去了，但没有在 `onDispose()` 里清理。

### 职责混淆

这通常不是能力不够，而是职责划错了。Contribution 应该是注入额外能力，不应该把设计器本身的主流程重新实现一遍。

## 工程路径

如果你是第一次做 contribution，最稳的顺序是：

1. 先注册一个命令。
2. 再给它挂一个工具栏按钮。
3. 最后再接一个面板。

这样你能先验证“扩展已经成功激活”，再验证“交互入口可用”，最后才处理复杂 UI。

## 延伸阅读

- Designer 基础接入见 [Designer / 概述](/designer/)
- 自定义物料见 [自定义物料开发](/advanced/custom-materials)
- Schema 结构见 [Schema 参考](/advanced/schema)
