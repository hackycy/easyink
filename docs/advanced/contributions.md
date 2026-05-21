# 贡献扩展开发

这篇文档解决的是另一个高级问题：当你不想改 EasyInk Designer 源码，但又要把自己的面板、按钮、命令和诊断接到设计器里，代码应该落在哪一层，边界又该怎么划。

它被放到“进阶”的原因和自定义物料一样。Contribution 不是日常使用 Designer 的基础能力，而是宿主对 Designer 的二次开发能力。

## 先判断你需不需要 Contribution

先做一个最短判断：

- 只是要把 Designer 嵌进业务页面：不需要 Contribution。
- 只是注册新物料：优先看 [自定义物料开发](/advanced/custom-materials)。
- 要向设计器注入新面板、工具栏动作、跨模块命令或宿主侧诊断订阅：这才是 Contribution。

如果你的需求是“在不改设计器源码的前提下给它加能力”，通常就应该走这一层。

## Contribution 到底解决什么问题

Designer 已经提供了画布、属性面板、数据绑定、撤销重做这些基础能力。Contribution API 解决的是“宿主如何零侵入地把业务能力挂进去”。

最典型的几类需求：

- 增加一个 AI 助手面板
- 增加一个工具栏按钮，触发业务动作
- 注册一个命令，让多个扩展共用同一动作入口
- 订阅诊断并转发到日志、埋点或告警系统

如果你发现自己正准备 fork 设计器，只是为了加一个面板或按钮，大概率先应该看这一层。

## 架构边界

Contribution 有三种最核心的注入点：

1. `registerPanel()`：注入一个覆盖层面板
2. `registerToolbarAction()`：注入一个顶部工具栏动作
3. `registerCommand()`：注册一个统一命令入口

可以把它理解成这样：

```text
host app
  -> contributions[]
  -> contribution.activate(ctx)
  -> panel / toolbar action / command / diagnostic subscription
  -> Designer 渲染并调度
```

这层的关键价值不是“能扩展”，而是“扩展点有限且稳定”。你把业务逻辑放在自己的 contribution 里，而不是散落到设计器内部。

## 最小可用示例

先从一个能跑通的最小例子开始，不要一上来就做复杂面板。

```ts
import type { Contribution } from '@easyink/designer'
import { IconSparkles } from '@easyink/icons'

export const helloContribution: Contribution = {
  id: 'demo.hello',
  activate(ctx) {
    ctx.registerCommand({
      id: 'demo.sayHello',
      handler: () => {
        console.log('current schema version:', ctx.store.schema.version)
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

```vue
<EasyInkDesigner
  v-model:schema="schema"
  :contributions="[helloContribution]"
/>
```

这个例子里最重要的不是按钮本身，而是结构：按钮不直接塞业务代码，而是去调用一个命令。这样同一个动作后面可以被按钮、快捷键、面板或其他 contribution 复用。

## Contribution 接口

```ts
interface Contribution {
  id: string
  activate: (ctx: ContributionContext) => void
}
```

要求其实很少：

- `id` 是贡献扩展自己的稳定标识
- `activate()` 是唯一入口

这意味着 Contribution 最好被设计成“初始化时注册能力”，而不是“每次点击时再临时拼装能力”。

## ContributionContext 有什么

源码里实际可用的能力主要是这几项：

```ts
interface ContributionContext {
  store: DesignerStore
  registerPanel: (panel: PanelDescriptor) => void
  registerToolbarAction: (action: ToolbarActionDescriptor) => void
  registerCommand: <TArgs, TResult>(command: Command<TArgs, TResult>) => void
  executeCommand: <TArgs = unknown, TResult = unknown>(id: string, args?: TArgs) => Promise<TResult>
  onDispose: (fn: () => void) => void
  onDiagnostic: (fn: (entry: Diagnostic) => void) => () => void
}
```

接下来不要死记字段。更重要的是知道这些能力该怎么分层使用。

## `registerPanel()` 适合做什么

面板适合承载那些“不是一次点击就结束”的能力，例如：

- AI 生成面板
- 模板审查面板
- 资产选择器
- 审计日志面板

```ts
ctx.registerPanel({
  id: 'audit.panel',
  component: AuditPanel,
  props: {
    level: 'warning',
  },
})
```

这里有三个要点：

- `id` 必须唯一，重复注册会抛错。
- `component` 是 Vue 组件，可以是 `defineAsyncComponent()`。
- `props` 适合传静态配置或 getter 包装出的响应式值。

如果你的扩展需要自己的打开/关闭状态，不要把这个状态塞进设计器内部，直接在 contribution 自己的闭包里维护即可。

## `registerToolbarAction()` 适合做什么

工具栏动作只适合“显式触发一个动作”，不适合承载完整流程。

```ts
ctx.registerToolbarAction({
  id: 'audit.toggle',
  icon: IconSparkles,
  label: 'Open Audit',
  onClick: () => {
    void ctx.executeCommand('audit.togglePanel')
  },
})
```

推荐做法永远是：

- 工具栏按钮只负责触发
- 真实逻辑写进命令或面板状态切换

原因很直接：同一能力以后往往不止一个入口。你把逻辑焊死在按钮里，后面就没法复用。

## `registerCommand()` 应该怎么用

命令是 Contribution 体系里最值得先设计好的部分，因为它定义了“能力的统一调用面”。

```ts
ctx.registerCommand<{ templateId: string }, void>({
  id: 'template.openReview',
  handler: async (args, contributionCtx) => {
    const templateId = args.templateId
    console.log('review template', templateId)
    console.log('current page count', contributionCtx.store.schema.page.pages)
  },
})
```

适合写成命令的逻辑：

- 可以被多个入口复用
- 需要接收参数
- 可能返回结果
- 需要被面板和按钮共享

不适合写成命令的逻辑：

- 纯视图渲染
- 面板内部的一次性本地状态变化

一个实用原则：只要你觉得“这个动作以后可能还会从别的地方触发”，就优先抽成命令。

## `store` 应该怎么碰

`ctx.store` 给了你直接访问 `DesignerStore` 的能力，但不要把它理解成“可以在 contribution 里随便改所有内部状态”。

更稳的用法是：

- 读当前 schema、选区、状态
- 触发明确的 store API
- 把业务状态仍放在 contribution 自己维护的闭包或组件里

如果你的 contribution 开始大量依赖 store 的内部细节，而不是公开方法，这通常说明边界已经开始失控。

## `onDiagnostic()` 适合接到哪里

这个能力很适合接宿主侧的可观测性系统：

- 控制台告警
- 埋点系统
- Sentry / APM
- 业务提示条

```ts
const unsubscribe = ctx.onDiagnostic((entry) => {
  console.warn(`[designer:${entry.severity}] ${entry.message}`)
})
```

这里的关键不是打印日志，而是“把 Designer 内部可恢复问题往宿主系统转发”。`onDiagnostic()` 返回的取消函数可以用于提前取消订阅；如果不手动调用，ContributionRegistry 也会在 Designer dispose 时自动取消，避免路由切换或 HMR 后残留监听。

## 生命周期怎么设计才稳

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

## 完整示例：一个可切换的面板扩展

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

## 仓库里的实际参考

当前仓库里最直接的参考实现就是 AI 集成：

- `packages/ai/src/contribution.ts`

它做了三件事：

1. 注册 `ai.togglePanel` 命令
2. 注册顶部工具栏按钮
3. 注册异步加载的 AI 面板

如果你要做自己的业务扩展，这个实现比文档示例更接近真实工程写法。

## 常见错误和根因

### 面板注册时报重复 ID

根因通常很简单：同一个 contribution 被重复挂载，或者你在 `activate()` 之外又做了一次注册。

### 点击工具栏按钮没反应

先查两点：

- 对应命令是不是成功注册了
- `onClick` 里是不是没有实际调用 `executeCommand()` 或状态切换

### contribution 卸载后还在继续响应事件

说明你把外部订阅挂上去了，但没有在 `onDispose()` 里清理。

### 一个扩展越写越像在“接管 Designer”

这通常不是能力不够，而是职责划错了。Contribution 应该是注入额外能力，不应该把设计器本身的主流程重新实现一遍。

## 一个更短的工程路径

如果你是第一次做 contribution，最稳的顺序是：

1. 先注册一个命令。
2. 再给它挂一个工具栏按钮。
3. 最后再接一个面板。

这样你能先验证“扩展已经成功激活”，再验证“交互入口可用”，最后才处理复杂 UI。

## 相关文档

- Designer 基础接入见 [Designer / 概述](/designer/)
- 自定义物料见 [自定义物料开发](/advanced/custom-materials)
- Schema 结构见 [Schema 参考](/advanced/schema)