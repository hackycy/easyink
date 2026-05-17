# 15. 输出与导出边界

## 15.1 当前结论

EasyInk 当前不把 PDF 生成器做成 `core` 的职责。导出能力由独立的 `@easyink/export-runtime`（运行时内核）+ `@easyink/export-plugin-*`（具体格式插件）承接，`viewer` 只提供页面预览、渲染尺寸、导出/打印调度入口和诊断桥接。运行时与插件都可被 `viewer` 使用，也可以被 `designer` 的工作台入口直接触发。也就是说，输出能力存在于产品架构中，只是不下沉到 Schema/Core 层。

打印通道实现不再放在示例工程中。协议客户端和 Viewer PrintDriver 以 `packages/print/*` 独立包提供：`@easyink/print-core` 放共享纯逻辑，`@easyink/print-integration-easyink-printer` 对接 EasyInk.Printer，`@easyink/print-integration-hiprint` 对接 electron-hiprint。

这个调整的原因是：

- 不同业务部署环境对 PDF、打印和下载链路差异很大。
- 预览与分页已经是 Viewer 主职责，但具体导出实现仍需适配宿主环境。
- 过早把底层导出实现下沉到核心层，会放大维护面并稀释主线。

## 15.2 EasyInk 负责什么

- `viewer` 提供页面预览、打印入口和诊断事件。
- `@easyink/export-runtime` 提供导出入口、导出任务状态机和导出插件装载，不绑定任何具体格式。
- `@easyink/export-plugin-dom-pdf` 等独立插件包提供具体的导出实现并管理各自的第三方依赖。
- `@easyink/print-*` 包提供官方打印客户端和 Viewer PrintDriver，隐藏本地打印服务协议细节。
- `viewer` 与 `designer` 都可以调用导出运行时层。
- 导出插件负责页面集合、缩略图、字体加载、数据加载、页面样式生成或导出前序列化。
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

当前导出运行时接口：

```typescript

interface ExportFormatPlugin<TInput = unknown, TResult = Blob | void> {
	id: string
	format: 'pdf' | 'png' | 'jpg' | 'docx' | 'pptx' | string
	prepare?(context: ExportRuntimeContext<TInput>): Promise<void>
	export(context: ExportRuntimeContext<TInput>): Promise<TResult>
}

interface ExportDispatchState {
	phase: 'idle' | 'menu-open' | 'dispatching' | 'preparing' | 'exporting' | 'completed' | 'failed'
	entry: 'save-menu' | 'preview' | 'api'
	format?: string
	error?: string
}

// runtime: @easyink/export-runtime
// plugin: @easyink/export-plugin-dom-pdf
const exportRuntime = createExportRuntime()
exportRuntime.registerPlugin(createDomPdfExportPlugin())
const blob = await exportRuntime.exportDocument({ format: 'pdf', input, entry: 'preview' })
```

`@easyink/export-runtime` 不依赖 `viewer`。如果宿主要走 `viewer.exportDocument()`，应在宿主侧注册 `ViewerExporter`，把 `ViewerExportContext.container`、`renderedPages`、`onProgress` 和 `onDiagnostic` 桥接给 export runtime。

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

await viewer.open({ schema, data })
await viewer.print()
await exportRuntime.exportDocument({ schema, data, entry: 'preview' })

// 宿主仍可按自己的部署环境补充：
// 1. 浏览器打印桥接
// 2. Puppeteer / Playwright PDF 落地
// 3. 上传、存储、权限控制
```

## 15.8 后续演进原则

如果继续扩展导出插件层，也必须满足：

- 不反向污染 `@easyink/core` 和 `@easyink/schema` 的数据模型
- 不要求模板层重新引入动态计算 DSL 或导出专用 DSL
- 输出插件挂在独立导出运行时扩展面
- 导出依赖的加载失败要以诊断事件暴露给 Designer 和宿主

## 15.9 Playground 当前落地

Playground 预览页使用同一套调度语义：

- 文件导出：PDF 与 demo JSON 都通过 `@easyink/export-runtime` 执行；PDF 使用已渲染 Viewer DOM，强制 fixed 页面尺寸，第一页尺寸作为整份 PDF 的页面尺寸基准。
- 浏览器打印：`viewer.print({ driverId: 'browser' })`，未指定 `driverId` 时也回退浏览器打印；`page.print.orientation` 作为打印布局偏好，不改变模板尺寸。
- HiPrint 打印：`viewer.print({ driverId: 'hiprint-driver', pageSizeMode: 'driver' })`，保留 HTML 逐页打印，继续服务连续纸/驱动介质场景；显式方向会透传到 Electron 打印选项。
- Printer.Host 打印：`viewer.print({ driverId: 'printer-host-driver', pageSizeMode: 'fixed' })`，通过 export runtime 生成 PDF 后发送给 Printer.Host；当前 Host 只有 `landscape` 布尔值，所以“系统”会回退到按纸张宽高推导。
- 官方打印驱动可通过 `PrintDriver.defaults.pageSizeMode` 声明默认策略；宿主调用 `viewer.print({ driverId })` 即可，不需要记住不同通道的 `pageSizeMode`。
- 诊断：导出 runtime 的 warning/error 会桥接成 Viewer diagnostic，同时 playground 用 toast 展示进度与结果。
