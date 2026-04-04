# 15. 输出与导出边界

## 15.1 当前结论

EasyInk 当前不把 PDF 生成器做成 `core` 的职责，但需要有独立的导出运行时层承接预览、打印和导出入口。这个运行时层可以被 `viewer` 使用，也可以被 `designer` 的工作台入口直接触发。也就是说，输出能力存在于产品架构中，只是不下沉到 Schema/Core 层。

这个调整的原因是：

- 不同业务部署环境对 PDF、打印和下载链路差异很大。
- 预览与分页已经是 Viewer 主职责，但具体导出实现仍需适配宿主环境。
- 过早把底层导出实现下沉到核心层，会放大维护面并稀释主线。

## 15.2 EasyInk 负责什么

- `viewer` 提供页面预览、打印入口和诊断事件。
- 导出运行时层提供导出入口、导出任务状态和导出适配器装载。
- `viewer` 与 `designer` 都可以调用导出运行时层。
- 导出运行时层负责页面集合、缩略图、字体加载、数据加载、页面样式生成或导出前序列化。
- 导出运行时层负责第三方导出依赖管理。
- `core` 与 `schema` 只提供文档模型和布局规则，不直接实现导出链路。

## 15.3 EasyInk 不负责什么

- 物理打印设备精度和缩放校准
- 业务侧文件上传、权限控制和审计
- 强绑定某一种浏览器外的 PDF 引擎实现
- 物理打印设备精度和缩放校准

## 15.4 对标产品的导出入口事实

第二轮实测已经确认：

- 保存主按钮会直接触发保存请求
- 保存右侧小箭头会打开一级动作菜单
- 一级动作菜单至少包含：自动保存开启、编辑模板数据、导出文件、导入文件
- 点击 `导出文件` 后，没有观察到二级格式菜单
- 页面会直接进入 `正在导出...` 状态
- 当前页面上下文会按需加载 `nzh.js` 与 `excellentexport.js`

因此 EasyInk 不应假设“导出一定从预览器页面发起”或者“导出前一定先弹格式菜单”。更接近实际的建模方式是：

- 工作台入口负责派发导出任务
- 导出运行时层负责解析当前文档、装载依赖并执行导出
- 是否先打开预览、是否有格式二级菜单，属于产品策略，而不是内核假设

## 15.5 运行时依赖

对标产品实测表明，Viewer 在预览/导出路径中会动态加载：

- `pptxgenjs`
- `jszip`
- `jspdf`
- `file-saver`
- `docx`

而 Designer 保存分支的直接导出路径中，还观察到：

- `nzh`
- `excellentexport`

EasyInk 的结论不是“必须一模一样引入这些库”，而是：

- 导出依赖属于导出运行时装载面
- 依赖按格式需求 lazy load，不进入 `core` 或 `schema`
- 导出失败必须可见诊断

推荐接口：

```typescript
interface ExportAdapter {
	id: string
	format: 'print' | 'pdf' | 'png' | 'jpg' | 'docx' | 'pptx' | string
	prepare?(context: ViewerExportContext): Promise<void>
	export(context: ViewerExportContext): Promise<Blob | void>
}

interface ExportDispatchState {
	phase: 'idle' | 'menu-open' | 'dispatching' | 'preparing' | 'exporting' | 'completed' | 'failed'
	entry: 'save-menu' | 'preview' | 'api'
	format?: string
	error?: string
}
```

## 15.6 保存分支菜单状态机

```typescript
interface SaveBranchMenuState {
	open: boolean
	autoSaveEnabled: boolean
	pendingAction?: 'edit-template-data' | 'export-file' | 'import-file'
}
```

交互约束：

- `保存` 与 `更多保存选项` 必须是两个动作源
- `导出文件` 在当前对标产品里表现为一级叶子动作
- 如果未来扩展格式二级菜单，也必须在状态机中显式增加 `format-picker-open`，不能默认复用当前叶子动作

## 15.7 业务侧推荐组合方式

```typescript
const viewer = createViewer({ mode: 'fixed' })
const exportRuntime = createExportRuntime()

await viewer.open({ schema, data, dataSources })
await viewer.print()
await exportRuntime.exportDocument({ schema, data, dataSources, entry: 'preview' })

// 宿主仍可按自己的部署环境补充：
// 1. 浏览器打印桥接
// 2. Puppeteer / Playwright PDF 落地
// 3. 上传、存储、权限控制
```

## 15.8 后续演进原则

如果继续扩展导出适配层，也必须满足：

- 不反向污染 `@easyink/core` 和 `@easyink/schema` 的数据模型
- 不要求模板层重新引入动态计算 DSL 或导出专用 DSL
- 输出适配器优先挂在独立导出运行时扩展面，而不是回退到旧 `renderer` 中心模型
- 导出依赖的加载失败要以诊断事件暴露给 Designer 和宿主
