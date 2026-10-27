---
description: 独立 Designer 扩展：通过受控 context 提供命令、工具栏、上下文菜单和 overlay。
---

# Designer 扩展开发 {#contributions}

独立 `DesignerExtension` 提供物料之外的工作台能力，例如命令、工具栏按钮、上下文菜单和 overlay。应用在创建 Designer 时通过 `extensions` 选择声明，框架提供 context 并管理资源；扩展不取得可写 store 或 registry。

## 命令与工具栏 {#commands}

先声明命令，再由按钮触发。命令接收参数和框架 context，按钮接收同一个宿主的 context。

```ts
import type { DesignerCommand } from '@easyink/plugin-api/designer'
import type { DesignerExtension } from '@easyink/plugin-api/ui'
import { IconSparkles } from '@easyink/icons'

const inspect: DesignerCommand = {
  id: 'company.inspect',
  handler(_args, context) {
    console.log(context.getSchema().version, context.getSelection().ids)
  },
}

export const inspection: DesignerExtension = {
  id: 'company.inspection',
  commands: [inspect],
  locale: {
    messages: { company: { inspect: 'Inspect selection' } },
    locales: { 'zh-CN': { company: { inspect: '查看选中节点' } } },
  },
  ui: {
    toolbar: [{
      id: 'company.inspect.button',
      label: 'company.inspect',
      icon: IconSparkles,
      order: 10,
      onClick: context => context.executeCommand(inspect, undefined),
    }],
  },
}
```

接入组件：

```vue
<EasyInkDesigner
  v-model:schema="schema"
  :materials="designerMaterials"
  :extensions="[inspection]"
/>
```

声明中的物料 type、扩展 id 和命令 id 必须稳定。重复身份导致创建整体失败，框架会等待已创建资源回滚后再报告错误；应用可以监听 `ready` / `error`。

## 受控 context {#api}

`DesignerContext` 提供文档、节点、选区、数据源、物料和翻译查询，以及事务、命令、文档替换和宿主交互。查询返回只读快照，不能通过查询结果修改 Schema。

普通节点编辑使用 `context.tx` 或已有编辑命令，保留撤销重做；切换整份模板使用 `context.replaceDocument()`。文档扩展数据通过 `readDocumentExtension()` / `writeDocumentExtension()` 读写。不要把 DOM、Vue 实例或服务对象写进 Schema。

需要确认或文件选择时，调用 `context.confirm()`、`pickAsset()` 或 `pickFileText()`，让宿主统一处理交互。

```ts
const confirm: DesignerCommand = {
  id: 'company.confirm',
  async handler(_args, context) {
    const accepted = await context.confirm({
      id: 'company.confirm.action',
      message: '继续执行此操作？',
    })
    if (!accepted || context.signal.aborted)
      return
    context.reportDiagnostic({ code: 'COMPANY_CONFIRMED', message: '已确认操作' })
  },
}
```

## UI 位置 {#panels}

独立扩展的 `ui` 可以声明 `toolbar`、`contextMenu` 和 `overlays`。物料自己的 `ui` 可以声明 `palette` 和 `properties`，由该物料的完整声明提供。五种位置由框架按声明顺序和 `order` 渲染，并为每次挂载提供独立 context。

overlay 组件必须声明 `context` prop：

```ts
import type { DesignerExtension } from '@easyink/plugin-api/ui'
import ReviewPanel from './ReviewPanel.vue'

const review: DesignerExtension = {
  id: 'company.review',
  ui: {
    overlays: [{
      id: 'company.review.panel',
      component: ReviewPanel,
      props: { title: 'Review' },
    }],
  },
}
```

框架提供 `context`，`props` 和 `getProps()` 不能覆盖它。overlay 进入当前 Designer 的专属 Teleport 容器；两个 Designer 的状态和挂载互不共享。某个 UI 组件失败会报告局部诊断，并保留其它工作台功能。

物料属性组件使用 `MaterialPropertiesContext`。`mode: 'append'` 加在默认属性编辑器后；`replace-body` 只替换物料属性正文，不替换几何、绑定、条件等框架区段。自定义物料的声明见 [物料开发](./custom-materials)。

## 文案与资源 {#lifecycle}

扩展自己的文案放在 `locale.messages` 和 `locale.locales` 中，宿主传入的 locale 覆盖具有最高优先级。同级冲突稳定选值并产生诊断，缺失翻译保留 key；这些问题不阻止宿主启动。

`context.signal` 在当前生命周期结束时取消工作，`context.onDispose()` 登记同步或异步清理。事件、定时器、订阅和组件持有的资源要在取得时登记，不放在可复用声明对象的全局状态里。

```ts
const subscribe: DesignerCommand = {
  id: 'company.subscribe',
  handler(_args, context) {
    const timer = window.setInterval(() => {
      console.log(context.getSelection().ids)
    }, 1000)
    context.onDispose(() => { window.clearInterval(timer) })
  },
}
```

## Assistant 参考 {#assistant-contribution}

`createAssistantContribution()` 是 `@easyink/assistant-designer-bridge` 的业务工厂名，返回值是 `DesignerExtension`。将返回值放进 `extensions`；Assistant manifest 从当前 context 的完整物料声明生成，应用结果和回退通过声明命令执行。AI UI 由异步 overlay 加载，Viewer 入口不会引入它。

```ts
import { createAssistantContribution } from '@easyink/assistant-designer-bridge'

const extensions = [createAssistantContribution({ endpoint: '/api/assistant' })]
```
