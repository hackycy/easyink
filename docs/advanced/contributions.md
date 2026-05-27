---
description: EasyInk Contribution 扩展开发：向 Designer 注入面板、工具栏动作和命令，无需修改源码。
---

# 贡献扩展开发 {#contributions}

Contribution 用来把宿主能力挂到 Designer 上，而不修改 Designer 源码。

先看一个最小按钮：

```ts
import type { Contribution } from '@easyink/designer'
import { IconSparkles } from '@easyink/icons'

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

接入 Designer：

```vue
<EasyInkDesigner
  v-model:schema="schema"
  :contributions="[helloContribution]"
/>
```

这段代码注册了一个命令和一个工具栏按钮。按钮只负责触发命令，真正动作放在命令里。

## 判断是否需要 Contribution {#when-to-use}

如果你要加的是这些能力，通常就用 Contribution：

```ts
ctx.registerPanel(...)
ctx.registerToolbarAction(...)
ctx.registerCommand(...)
ctx.onDiagnostic(...)
```

它适合扩展 Designer 的外层能力：

- 增加业务面板。
- 增加工具栏动作。
- 定义可复用命令。
- 订阅诊断并转发到宿主系统。

如果你要注册新元素类型，先看 [自定义物料开发](/advanced/custom-materials)。物料负责画布节点，Contribution 负责设计器外围能力。

## 核心接口 {#api}

Contribution 的形状很小：

```ts
interface Contribution {
  id: string
  activate: (ctx: ContributionContext) => void
}
```

`activate()` 会在 Designer 初始化 contribution registry 时执行。你应该在这里完成注册和订阅。

`ContributionContext` 里最常用的是这些入口：

```ts
interface ContributionContext {
  store: DesignerStore
  registerPanel: (panel: PanelDescriptor) => void
  registerToolbarAction: (action: ToolbarActionDescriptor) => void
  registerCommand: <TArgs, TResult>(command: Command<TArgs, TResult>) => void
  executeCommand: <TArgs = unknown, TResult = unknown>(id: string, args?: TArgs) => Promise<TResult>
  confirm: (request: DesignerConfirmRequest) => Promise<boolean>
  pickAsset: (request: DesignerAssetPickRequest) => Promise<DesignerResolvedAsset | null>
  onDispose: (fn: () => void) => void
  onDiagnostic: (fn: (entry: Diagnostic) => void) => () => void
}
```

如果只记一条分层原则：面板和按钮负责入口，真正可复用的动作收敛成命令。

## 注册命令 {#commands}

命令适合放可以被多处复用的动作：

```ts
ctx.registerCommand<{ prefix: string }, string>({
  id: 'demo.renameTemplate',
  handler: async (args, ctx) => {
    const name = `${args.prefix}-${Date.now()}`
    ctx.store.schema.meta = {
      ...ctx.store.schema.meta,
      name,
    }
    return name
  },
})

const name = await ctx.executeCommand<{ prefix: string }, string>(
  'demo.renameTemplate',
  { prefix: 'invoice' },
)
```

`executeCommand()` 会按 id 找到已注册命令。重复 id 或找不到命令都会抛错，所以 id 最好带上业务命名空间。

## 注册工具栏动作 {#toolbar-actions}

工具栏动作适合显式触发：

```ts
ctx.registerToolbarAction({
  id: 'demo.rename.button',
  icon: IconSparkles,
  label: 'Rename',
  onClick: (ctx) => {
    void ctx.executeCommand('demo.renameTemplate', { prefix: 'invoice' })
  },
})
```

按钮不要承载太长业务流程。以后面板、快捷键或自动化也要复用时，命令会让这条链路更清楚。

## 注册面板 {#panels}

持续存在的业务 UI 适合放进 panel：

```ts
import { defineAsyncComponent, ref } from 'vue'

const ReviewPanel = defineAsyncComponent(() => import('./ReviewPanel.vue'))

const open = ref(false)

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
```

默认情况下，面板会通过 Teleport 挂到 Designer 的 `#ei-overlay-root`。如果你有自己的挂载点，可以传 `teleportTarget`。

## 使用宿主交互 {#host-interactions}

破坏性确认和资产选择应该走宿主交互层：

```ts
const ok = await ctx.confirm({
  id: 'demo.deleteTemplate',
  title: '删除模板',
  message: '确认删除当前模板吗？',
  severity: 'danger',
})

if (!ok)
  return

const asset = await ctx.pickAsset({
  id: 'demo.pickLogo',
  source: 'demo-contribution',
})
```

这样 Contribution 不需要自己实现浏览器弹窗或业务资产库。宿主可以统一处理权限、审计和 UI 风格。

## 转发诊断 {#diagnostics}

Designer 内部的可恢复问题可以订阅出来：

```ts
const unsubscribe = ctx.onDiagnostic((entry) => {
  console.warn(`[designer:${entry.severity}] ${entry.message}`)
})

ctx.onDispose(() => {
  unsubscribe()
})
```

`onDiagnostic()` 返回取消函数。registry 在 Designer dispose 时也会自动取消订阅；你提前取消也可以。

## 清理生命周期 {#lifecycle}

带外部副作用的 contribution 必须清理：

```ts
activate(ctx) {
  const timer = window.setInterval(() => {
    console.log(ctx.store.saveStatus)
  }, 1000)

  ctx.onDispose(() => {
    window.clearInterval(timer)
  })
}
```

需要清理的通常包括：

- DOM 事件监听。
- 轮询和定时器。
- WebSocket 或外部订阅。
- contribution 自己维护的临时状态。

嵌入式场景、路由切换和 HMR 都可能让 Designer 反复挂载。不要假设 contribution 会一直存在。

## 完整面板示例 {#panel-example}

这版结构接近仓库里的 AI contribution：

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

这段代码把状态、命令、按钮和面板拆开了。你调试时可以逐个确认：命令是否注册、按钮是否触发、面板 props 是否更新。

## 常见问题 {#troubleshooting}

重复 id 会直接抛错：

```ts
ctx.registerCommand({ id: 'review.togglePanel', handler: () => {} })
ctx.registerCommand({ id: 'review.togglePanel', handler: () => {} })
```

遇到问题时先查这几项：

- 按钮无响应：确认 `onClick` 里调用了 `executeCommand()`。
- 命令找不到：确认 contribution 已传给 `<EasyInkDesigner :contributions>`。
- 面板不出现：确认 `open` 这类状态真的传进了 panel props。
- 事件残留：确认外部订阅放进了 `onDispose()`。

关于 Contribution，目前知道这些就够用了。更完整的工程参考可以看 `packages/ai/src/contribution.ts`，它注册了命令、工具栏按钮和异步面板。
