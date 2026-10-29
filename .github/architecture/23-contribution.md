# 23. Designer 独立扩展

Designer 在创建前通过 `extensions` 接受 `@easyink/plugin-api/ui` 的 `DesignerExtension`。完整物料通过 `materials` 自带模型、绘制和可选 UI；独立扩展用于面板和工作台命令。装配、身份校验和生命周期由每实例唯一 plugin-runtime Host 管理。

## 23.1 声明与入口

```typescript
import type { DesignerCommand } from '@easyink/plugin-api/designer'
import type { DesignerExtension } from '@easyink/plugin-api/ui'

const review: DesignerCommand<undefined, boolean> = {
  id: 'review.open',
  handler: (_args, context) => context.confirm({ id: 'review', message: context.t('review.confirm') }),
}
const extension: DesignerExtension = {
  id: 'review',
  locale: { messages: { review: { confirm: 'Review this document' } } },
  commands: [review],
  ui: { toolbar: [{ id: 'review.open', label: 'Review', onClick: async (context) => {
    await context.executeCommand(review, undefined)
  } }] },
}
```

应用将数组传给 `<EasyInkDesigner :extensions="extensions" />`。换集合通过销毁重建。组件内部等待 Store 创建；程序化使用 `await DesignerStore.create({ materials, extensions })`，关闭时等待 `destroy()`。

## 23.2 五类 UI 与上下文

`toolbar`、`contextMenu`、`overlays` 属于独立扩展；`palette`、`properties` 属于完整物料的 UI。位置、排序和稳定 id 由声明给出，UI 只读消费最终 registry。属性扩展默认 append，可选 replace-body；绑定、条件、几何等核心区仍由框架管理。

组件的最后一个 `context` prop 由框架提供，业务 props 不能覆盖。独立 UI 和命令获得 `DesignerContext`；物料属性获得较窄的 `MaterialPropertiesContext`；绘制实例获得 `DesignerRendererContext`。查询为冻结快照，写入通过 tx、typed command 或受控文档操作。物料属性编辑遵循原撤销与 pending editor flush 规则。

确认、资产选择和文本文件读取通过 `context.confirm`、`pickAsset`、`pickFileText` 进入宿主交互层。选择文件或 DOM 不进入 Schema。命令保留参数与返回类型，通过 `executeCommand(command, args)` 调用其 owner 上下文。

## 23.3 生命周期和失败

每个 Host 有独立登记与 UI 根。overlay 挂载到实例根；同一扩展可在两个 Designer 使用，状态按 Host 身份隔离。UI 每次挂载获取短 Scope，订阅、监听和异步工作通过 `signal`、`onDispose` 归属；卸载先失效，销毁等待实际清理。不可取消的迟到资源由任务自行释放。

重复身份、核心能力冲突和必需初始化失败整体拒绝创建并回滚。局部 UI 渲染或 props 失败记录诊断并隔离相应 UI；locale 缺失或冲突按稳定 fallback 记录诊断，保持非阻断。

作者用法见 [独立扩展指南](../../docs/advanced/contributions.md)，框架装配与资源边界见 [9. 内部扩展机制](./09-plugin-system.md)。
