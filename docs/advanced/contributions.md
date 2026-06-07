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
  pickFileText: (request: DesignerTextFilePickRequest) => Promise<DesignerResolvedTextFile | null>
  onDispose: (fn: () => void) => void
  onDiagnostic: (fn: (entry: Diagnostic) => void) => () => void
}
```

如果只记一条分层原则：面板和按钮负责入口，真正可复用的动作收敛成命令。

`ctx.store` 还提供 contribution 文案注册能力。外部 contribution 的 UI 文案应放在 contribution 包里注册，不要追加到 `@easyink/locales`：

```ts
const unregister = ctx.store.registerLocaleMessages({
  messages: {
    designer: {
      review: {
        toolbar: { label: 'Review' },
      },
    },
  },
  locales: {
    'zh-CN': {
      designer: {
        review: {
          toolbar: { label: '审阅' },
        },
      },
    },
    'en-US': {
      designer: {
        review: {
          toolbar: { label: 'Review' },
        },
      },
    },
  },
})

ctx.onDispose(unregister)
```

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
  label: 'designer.demo.rename',
  onClick: (ctx) => {
    void ctx.executeCommand('demo.renameTemplate', { prefix: 'invoice' })
  },
})
```

按钮不要承载太长业务流程。以后面板、快捷键或自动化也要复用时，命令会让这条链路更清楚。

`label` 可以是普通字符串，也可以是 locale key。Designer 渲染工具栏时会调用 `store.t(action.label)`；命中翻译就显示翻译，未命中就显示原始字符串。面向产品的 contribution 推荐使用 locale key。

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

const svg = await ctx.pickFileText({
  id: 'demo.importLogoSvg',
  source: 'demo-contribution',
  accept: ['.svg', 'image/svg+xml'],
})
```

这样 Contribution 不需要自己实现浏览器弹窗、业务资产库或本地文本文件读取。宿主可以统一处理权限、审计和 UI 风格。

## 注册多语言文案 {#locale-messages}

Contribution 可以注册自己的语义文案：

```ts
import type { Contribution } from '@easyink/designer'
import { IconSparkles } from '@easyink/icons'

const messages = {
  messages: {
    designer: {
      review: {
        toolbar: { label: 'Review' },
        panel: { title: 'Review Panel' },
        action: { close: 'Close' },
      },
    },
  },
  locales: {
    'zh-CN': {
      designer: {
        review: {
          toolbar: { label: '审阅' },
          panel: { title: '审阅面板' },
          action: { close: '关闭' },
        },
      },
    },
    'en-US': {
      designer: {
        review: {
          toolbar: { label: 'Review' },
          panel: { title: 'Review Panel' },
          action: { close: 'Close' },
        },
      },
    },
  },
}

export const reviewContribution: Contribution = {
  id: 'demo.review',
  activate(ctx) {
    const unregisterMessages = ctx.store.registerLocaleMessages(messages)

    ctx.registerToolbarAction({
      id: 'review.toggle',
      icon: IconSparkles,
      label: 'designer.review.toolbar.label',
      onClick: () => void ctx.executeCommand('review.togglePanel'),
    })

    ctx.onDispose(unregisterMessages)
  },
}
```

翻译解析顺序是：

1. 宿主传给 `<EasyInkDesigner :locale="...">` 的语言包。
2. 当前 `localeCode` 对应的 contribution 注册文案。
3. contribution 注册的默认 `messages`。
4. 原始 key。

宿主永远有最高优先级，所以业务接入方可以覆盖 contribution 默认文案。`EasyInkDesigner` 对内置 `zh-CN` 和 `en-US` 会自动识别语言代码；如果你传的是自定义语言包，可以显式传 `localeCode`：

```vue
<EasyInkDesigner
  :locale="myLocale"
  locale-code="en-US"
  :contributions="[reviewContribution]"
/>
```

这套机制的边界是：`@easyink/locales` 只维护 Designer 内置文案；contribution 包维护自己的文案，并在激活时注册。

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
        label: 'designer.review.toolbar.label',
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
- 文案显示 key：确认 contribution 已调用 `registerLocaleMessages()`，或者宿主 `localeCode` 和注册的 `locales` key 匹配。
- 事件残留：确认外部订阅放进了 `onDispose()`。

关于 Contribution，目前知道这些就够用了。更完整的工程参考可以看 `packages/assistant/designer-bridge/src/contribution.ts`，它注册了命令、工具栏按钮和异步面板。

## AI Assistant Contribution 实现参考 {#assistant-contribution}

仓库中的 AI 助手是 Contribution 机制的典型应用。它通过 `@easyink/assistant-designer-bridge` 包实现，展示了如何将一个完整的业务系统接入 Designer。

### 注册结构 {#assistant-structure}

```ts
import type { Contribution } from '@easyink/designer'
import { createAssistantMaterialManifest } from './material-manifest'

export function createAssistantContribution(): Contribution {
  const open = ref(false)

  return {
    id: 'assistant',
    activate(ctx) {
      // 1. 注册命令
      ctx.registerCommand({ id: 'assistant.open', handler: () => { open.value = true } })
      ctx.registerCommand({ id: 'assistant.close', handler: () => { open.value = false } })
      ctx.registerCommand({ id: 'assistant.applyResult', handler: (args) => { /* 应用生成结果 */ } })
      ctx.registerCommand({ id: 'assistant.rollback', handler: () => { /* 回滚 */ } })

      // 2. 注册工具栏按钮
      ctx.registerToolbarAction({
        id: 'assistant.toggle',
        icon: IconSparkles,
        label: 'designer.assistant.toolbar.label',
        onClick: () => void ctx.executeCommand('assistant.togglePanel'),
      })

      // 3. 注册面板（响应式 props）
      ctx.registerPanel({
        id: 'assistant.panel',
        component: defineAsyncComponent(() => import('@easyink/assistant-ui')),
        props: {
          get open() { return open.value },
          get currentSchema() { return ctx.store.schema },
          get materialManifest() { return createAssistantMaterialManifest(ctx.store) },
          onApply: (result) => void ctx.executeCommand('assistant.applyResult', result),
          onRollback: () => void ctx.executeCommand('assistant.rollback'),
        },
      })

      ctx.onDispose(() => { open.value = false })
    },
  }
}
```

### 关键设计点 {#assistant-design-points}

**响应式 manifest 传递：** `materialManifest` 通过 getter 实现响应式。当用户注册新物料后，面板下次读取时自动获得最新的物料列表（含 `knowledge` 字段）。AI 不需要重启就能感知新物料。

**命令分离：** 面板 UI 不直接操作 store。所有写操作（apply、rollback、applyPatch）都收敛为命令。这样其他 contribution 或自动化脚本也能调用同一套命令。

**异步面板加载：** `defineAsyncComponent` 确保 AI 面板的代码不会进入 Designer 的初始 bundle。只有用户点击按钮后才加载。

**文案注册：** Assistant 的中英文文案由 `@easyink/assistant-designer-bridge` 自己维护，并在 contribution 激活时通过 `ctx.store.registerLocaleMessages()` 注册。Designer 内置语言包不需要认识 Assistant。
