---
description: 0.0.x 到 0.1.0 的完整物料、异步宿主与输出 API 迁移。
---

# 迁移到 0.1.0

0.1.0 是一次破坏性 API 切换。全部 67 个公共 EasyInk npm 包一起升级到 `0.1.0`，包括新增的 `@easyink/plugin-api` 与 `@easyink/plugin-runtime`。文档 Schema、codec、migration、单位和节点默认值保持原语义，已有文档无需进行“0.1.0 Schema 迁移”。

## 创建前选择完整物料

builtin 默认入口选择 all，应用可将 all、basic、none 或自选完整物料数组传给 Designer 组件。物料根入口提供 Designer 声明，`/viewer` 提供 Viewer 声明；builtin 根/all/basic 为 Designer，all/viewer 与 basic/viewer 为 Viewer，none 是两端可用空数组。

```ts
import { materials as designerMaterials } from '@easyink/builtin/all'
import { materials as viewerMaterials } from '@easyink/builtin/all/viewer'
import { DesignerStore } from '@easyink/designer'
import { normalizeDocumentSchema } from '@easyink/schema'
import { createViewer } from '@easyink/viewer'

const schema = normalizeDocumentSchema({})
const store = await DesignerStore.create({ schema, materials: designerMaterials })
const viewer = await createViewer({ container: document.createElement('div'), materials: viewerMaterials })
const result = await viewer.open({ schema, data: {} })
if (result.status === 'completed')
  console.log(result.diagnostics)
await Promise.all([store.destroy(), viewer.destroy()])
```

Vue 应用继续使用组件，由组件管理启动和销毁：

```vue
<EasyInkDesigner
  v-model:schema="schema"
  :materials="designerMaterials"
  :extensions="extensions"
  @ready="onReady"
  @error="onError"
/>
```

`runtimeConfig` 只保留纸张和模板默认配置。切换集合需等待销毁后重建。程序化底层 Viewer/DesignerStore 不隐式引入 builtin；应用明确选择集合。节点工厂、props/defaults 和适用的纯 helper 保留在各物料入口。

## 删除与替代

| 0.0.x 调用 | 0.1.0 路径 |
| --- | --- |
| builtin bundle、sets、具名/通用 registrar | 宿主对应入口的 `materials` 数组 |
| `runtimeConfig.materials.bundles`、`registerMaterialBundle` | 创建前 `materials` |
| Store/Viewer 的物料、factory、catalog、locale 注册和可写 registry | 完整物料声明，由每实例 Host 一次装配 |
| `MaterialExtensionFactory`、`MaterialExtensionContext`、`create*Extension` | `plugin-api` 的 MaterialModel 与宿主完整物料 |
| `Contribution`、`activate(ctx.store)`、组件 `contributions` / `setupStore` | `DesignerExtension`、`extensions` 与受控 context |
| print `setupViewer` / `ManagedPrintViewerSetup` | 创建前 `viewerOptions: { materials }` |
| 同步创建或销毁假设 | `await createViewer()` / `DesignerStore.create()` / `destroy()` |
| Viewer `throwOnError` 或旧输出返回假设 | completed/cancelled 判别结果；整体错误拒绝 Promise |
| `tableDataFragmentPaginator` 的模块级共享状态 | `createTableDataSession(resources).fragmentPaginator` |

不提供兼容包、旧 registry 转发或运行中补装。重复物料 type、扩展 id、命令 id 或核心能力争用使创建整体失败，已取得资源清理后返回错误。locale 缺失/冲突是非阻断诊断，同值共享、异值稳定选择，宿主显式覆盖优先。

完整自定义物料见[物料开发](../advanced/custom-materials)，独立工具栏/命令/overlay 见[Designer 扩展](../advanced/contributions)。`createAssistantContribution()` 保留业务工厂名称，其返回值是新的 DesignerExtension。

## 输出和资源

每轮 Viewer 固定输入，只有最新请求提交。同文档刷新失败保留旧画面但输出任务拒绝使用旧成功结果；open 切文档清空预览。打印/导出开始后固定版本，预览替换不会提前释放正在输出的资源。关闭路径保留并等待 destroy Promise，包含创建尚未结束的情形。

普通取消返回 cancelled，带可见诊断的完成返回 completed；整体错误拒绝 Promise。字体/图片有限等待后可能降级，检查 diagnostics。浏览器打印只能证明交接到打印界面，不能证明纸张已输出。

## 整组恢复

如需恢复 0.0.x，按用户 Git 流程恢复应用代码、整组 EasyInk 依赖和匹配的内嵌 runtime/Go/Android 制品，重新构建并重建 Host。只降低单个包版本或保留 0.1.0 调用混用旧包不属于支持路径。
