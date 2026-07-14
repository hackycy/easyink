---
description: EasyInk API 索引：快速定位公开能力的包入口，涵盖 Designer、Viewer、Schema、Core 等模块。
---

# API 索引

这页不讲怎么用，它只回答一个问题：某个公开能力大概从哪个包导出。

如果你已经知道自己要找什么函数、类型或类，可以直接在这里定位包入口，再回到对应章节看用法。

## @easyink/designer

设计器组件和相关工具。

| 导出 | 类型 | 说明 |
|------|------|------|
| `EasyInkDesigner` | Vue Component | 设计器根组件 |
| `DesignerStore` | Class | 核心状态管理 |
| `provideDesignerStore` | Function | Vue provide 注入 store |
| `useDesignerStore` | Function | Vue inject 获取 store |
| `useWorkbenchPersistence` | Function | 工作台偏好持久化 composable |
| `registerMaterialBundle` | Function | 注册物料包 |
| `ContributionRegistry` | Class | 贡献注册表 |
| `DesignerInteractionService` | Class | 设计器用户交互桥接服务 |
| `TemplateHistoryManager` | Class | 模板历史管理 |
| `createLocalStoragePreferenceProvider` | Function | localStorage 偏好持久化 |
| `createDefaultWorkbenchState` | Function | 创建默认工作台状态 |
| `createDefaultSaveBranchMenu` | Function | 创建默认保存分支菜单状态 |
| `tableSectionFilter` | Function | 表格属性面板过滤器 |

类型导出：`DocumentSchema`, `DocumentSchemaInput`, `MaterialNode`, `DataSourceDescriptor`, `Contribution`, `ContributionContext`, `Command`, `PanelDescriptor`, `ToolbarActionDescriptor`, `DesignerConfirmRequest`, `DesignerConfirmSeverity`, `DesignerInteractionProvider`, `DesignerMaterialBundle`, `DesignerMaterialRegistration`, `DesignerCatalogGroupRegistration`, `DesignerCatalogRegistration`, `MaterialCatalogGroup`, `MaterialCatalogEntry`, `MaterialCapabilities`, `MaterialExtensionFactory`, `LazyMaterialExtensionFactory`, `MaterialBindingDefinition`, `TemplateAutoSaveOptions`, `PreferenceProvider`, `PersistableWorkbenchState`, `LocaleMessages`, `FontDescriptor`, `FontProvider`

## @easyink/core

共享核心能力。

| 导出 | 类型 | 说明 |
|------|------|------|
| `FontManager` | Class | 字体目录缓存、加载状态、批量加载和可选 `@font-face` 注入 |
| `collectFontFamilies` | Function | 从 DocumentSchema 收集页面和元素字体引用 |
| `viewerElement` / `viewerText` / `viewerFragment` | Functions | 构造受预算约束的 ViewerRenderTree |
| `resolveMaterialDataContract` | Function | 解析 data-contract 物料的目标 records |

字体相关类型导出：`FontDescriptor`, `FontProvider`, `FontSource`, `FontLoadRequest`, `FontLoadStatus`, `FontLoadState`, `FontLoadSuccess`, `FontLoadFailure`, `FontBatchLoadOptions`, `FontBatchLoadResult`, `FontPreloadResult`

物料扩展类型导出：`MaterialDesignerExtension`, `MaterialExtensionFactory`, `LazyMaterialExtensionFactory`, `MaterialBindingDefinition`, `MaterialViewerExtension`, `MaterialViewerLayoutFacet`, `ViewerRenderContext`, `PropertyDescriptor`

## @easyink/viewer

独立的预览/打印/导出引擎。

| 导出 | 类型 | 说明 |
|------|------|------|
| `createViewer` | Function | 创建 ViewerRuntime |
| `ViewerRuntime` | Class | 核心运行时 |
| `createThumbnails` | Function | 生成缩略图 |
| `collectFontFamilies` | Function | 收集字体引用 |
| `loadAndInjectFonts` | Function | 加载并注入字体到 Viewer host document |
| `ProfileMaterialRuntime` | Class | 基于 compiled profile 激活 Viewer facet |
| `resolvePrintPolicy` | Function | 解析打印策略 |
| `PrintPolicyError` | Class | 打印策略解析错误 |
| `createBrowserViewerHost` | Function | Browser Host |
| `createIframeViewerHost` | Function | Iframe Host |
| `createCustomViewerHost` | Function | Custom Host |

类型导出：`ViewerHost`, `ViewerOptions`, `ViewerOpenInput`, `ViewerRenderResult`, `ViewerDiagnosticEvent`, `PrintDriver`, `ViewerPrintOptions`, `ViewerPrintPolicy`, `ViewerPrintContext`, `ViewerExporter`, `ViewerExportContext`, `ViewerExportOptions`, `ViewerTaskCallbacks`, `ViewerTaskPhaseEvent`, `ViewerTaskProgressEvent`, `MaterialViewerExtension`, `ViewerRenderContext`, `FontDescriptor`, `FontProvider`

## @easyink/builtin

官方内置物料集合。推荐从子路径选择集合：`@easyink/builtin/all`、`@easyink/builtin/basic`、`@easyink/builtin/none`；根入口 `@easyink/builtin` 兼容默认导出全部内置物料，并额外提供 all/basic/none 的显式别名。

公开入口只有：

- `@easyink/builtin`
- `@easyink/builtin/all`
- `@easyink/builtin/basic`
- `@easyink/builtin/none`
- `@easyink/builtin/package.json`

`@easyink/builtin/designer`、`@easyink/builtin/viewer`、`@easyink/builtin/bindings` 不是公开入口。

| 导出 | 类型 | 说明 |
|------|------|------|
| `builtinAllMaterialPackage` / `builtinBasicMaterialPackage` / `builtinNoneMaterialPackage` | Object | 根入口导出的不可变内置物料包 |
| `getBuiltinMaterialPackage` | Function | 按 all/basic/none 选择物料包 |
| `compileBuiltinMaterialProfile` | Function | 编译不可变内置物料 profile |
| `builtinMaterialPackage` | Object | all/basic/none 子入口对应的物料包 |

类型导出：`BuiltinMaterialSet`

## @easyink/schema

文档 Schema 类型定义和工具。

| 导出 | 类型 | 说明 |
|------|------|------|
| `getNodeProps` | Function | 获取类型化的元素属性 |
| `isTableNode` | Function | 表格节点类型守卫 |
| `isTableDataNode` | Function | 数据表格节点类型守卫 |
| `createDefaultSchema` | Function | 创建完整默认 Schema |
| `normalizeDocumentSchema` | Function | 将空对象或部分 Schema 输入补齐为完整 Schema |
| `createDefaultPage` | Function | 创建默认页面配置 |
| `createDefaultGuides` | Function | 创建默认辅助线配置 |
| `validateSchema` | Function | 返回字符串形式的 Schema 校验错误 |
| `validateSchemaIssues` | Function | 返回结构化 Schema 校验问题 |
| `formatSchemaValidationIssue` | Function | 格式化结构化 Schema 校验问题 |
| `isValidSchema` | Function | 判断对象是否为完整合法 Schema |
| `serializeSchema` | Function | 序列化 Schema 为 JSON 字符串 |
| `deserializeSchema` | Function | 反序列化并校验 Schema |

类型导出：`DocumentSchema`, `DocumentSchemaInput`, `DocumentMeta`, `PageSchema`, `PageModelConfig`, `DocumentLayoutConfig`, `PaginationConfig`, `ReflowConfig`, `MaterialNode`, `TableNode`, `TableSchema`, `BindingRef`, `AnimationSchema`, `SchemaValidationIssue`, `SchemaDeserializeError`

## @easyink/export-runtime

导出运行时框架。

| 导出 | 类型 | 说明 |
|------|------|------|
| `createExportRuntime` | Function | 创建 ExportRuntime |
| `ExportRuntime` | Class | 导出运行时 |

类型导出：`ExportFormatPlugin`, `ExportRuntimeContext`, `ExportDiagnostic`, `ExportProgress`

## @easyink/export-dom-capture

DOM 捕获共享工具，供浏览器端导出插件复用。

| 导出 | 类型 | 说明 |
|------|------|------|
| `createCanvasCaptureOptions` | Function | 创建 html2canvas 普通 canvas 捕获配置 |
| `createForeignObjectCaptureOptions` | Function | 创建 html2canvas foreignObject 捕获配置 |
| `cropForeignObjectOffset` | Function | 修正 foreignObject 捕获偏移 |
| `isLikelyBlankForeignObjectCanvas` | Function | 检测捕获结果是否疑似空白 |
| `waitForRenderableAssets` | Function | 等待字体、图片和背景图资源 |
| `resolveCanvasScale` | Function | 按 DPI 计算 html2canvas 缩放比例 |

类型导出：`CanvasCaptureOptions`, `ForeignObjectCaptureOptions`, `CropForeignObjectOffsetOptions`

## @easyink/export-plugin-dom-pdf

DOM-to-PDF 导出插件。

| 导出 | 类型 | 说明 |
|------|------|------|
| `createDomPdfExportPlugin` | Function | 创建 `pdf` 格式导出插件 |
| `renderPagesToPdfBlob` | Function | 将 Viewer 页面 DOM 渲染为 PDF Blob |
| `resolveCanvasScale` | Function | 按 DPI 计算 html2canvas 缩放比例 |

类型导出：`DomPdfExportInput`, `DomPdfExportPluginOptions`, `RenderPagesToPdfOptions`, `JsPDF`

## @easyink/export-plugin-dom-image

DOM-to-image 导出插件。

| 导出 | 类型 | 说明 |
|------|------|------|
| `createDomImageExportPlugin` | Function | 创建 `png`、`jpeg` 或 `webp` 格式导出插件 |
| `renderPageToImageBlob` | Function | 将单个 Viewer 页面 DOM 渲染为图片 Blob |
| `renderPagesToImageBlob` | Function | 从多页输入中选择一个页面渲染为图片 Blob |
| `renderPagesToImageBlobs` | Function | 将多个 Viewer 页面 DOM 渲染为图片 Blob 数组 |
| `resolveCanvasScale` | Function | 按 DPI 计算 html2canvas 缩放比例 |

类型导出：`DomImageExportInput`, `DomImageExportPluginOptions`, `ImageMimeType`, `ImagePageSize`, `RenderPageToImageOptions`, `RenderPagesToImageBlobOptions`, `RenderPagesToImageOptions`

## @easyink/datasource

数据源管理。

| 导出 | 类型 | 说明 |
|------|------|------|
| `DataSourceRegistry` | Class | 数据源与异步 provider 注册表 |
| `normalizeDataSource` | Function | 归一化数据源描述符 |
| `findDataFieldNode` | Function | 按绑定路径或字段 key 查找字段节点 |
| `getDataFieldCustomFormatTemplates` | Function | 读取字段级自定义格式模板 |
| `getDefaultDataFieldCustomFormatTemplate` | Function | 解析字段级默认自定义格式模板 |
| `getNamespacedId` | Function | 生成带命名空间的数据源 ID |
| `parseNamespacedId` | Function | 解析命名空间 ID |
| `setSourceNamespace` | Function | 写入数据源命名空间 |
| `getSourceNamespace` | Function | 读取数据源命名空间 |

常量导出：`DEFAULT_NAMESPACE`, `AI_NAMESPACE`

类型导出：`DataSourceDescriptor`, `DataFieldNode`, `DataFieldDisplayFormatConfig`, `DataFieldCustomFormatTemplate`, `DataFieldLookup`, `DataUnionBinding`, `DataSourceProviderFactory`, `ResolvedDataSourceEntry`, `DataSourceChangeCallback`

## @easyink/print-core

打印驱动共享工具。

| 导出 | 类型 | 说明 |
|------|------|------|
| `EasyInkPrintError` | Class | 打印包统一错误类型 |
| `toMillimeters` | Function | 将 Viewer 尺寸转换为毫米 |
| `resolvePrintSize` | Function | 从打印策略或渲染页解析有效纸张尺寸 |
| `resolveViewerPrintSize` | Function | 解析 Viewer 打印尺寸并转换为毫米 |
| `resolveViewerPdfPages` | Function | 解析每页 DOM 和毫米尺寸 |
| `resolvePrintLandscape` | Function | 解析最终横向打印标记 |
| `resolvePrintOffset` | Function | 将打印偏移转换为毫米 |
| `getViewerPages` | Function | 从 Viewer 容器读取 `.ei-viewer-page` |
| `exportDiagnosticToViewerEvent` | Function | 将导出诊断转换为 Viewer 诊断 |
| `createManagedPrintViewer` | Function | 创建托管 Viewer 打印面 |
| `resolvePrintDriverValue` | Function | 解析静态值或函数式打印配置 |

类型导出：`PrintDriverRequestContext`, `PrintDriverBaseOptions`, `ManagedPrintViewerSetup`, `ManagedPrintViewerOptions`, `ManagedPrintViewer`, `ManagedPrintInput`, `PrinterDeviceLike`, `PrintJobLike`, `ViewerPdfPageSize`, `ViewerPdfPageInput`

## @easyink/print-integration-easyink-printer

EasyInk.Printer 官方前端集成。

推荐入口是 `createEasyInkPrinter()`。它只暴露 `print()`、`printPdf()` 和 `printHtml()` 这三种高层打印动作，不需要你理解 Render 协议。

`ready()` 只是可选的预检方法，用来提前连服务和刷新打印机列表。

| 导出 | 类型 | 说明 |
|------|------|------|
| `createEasyInkPrinterClient` | Function | 创建 HTTP/WebSocket 客户端 |
| `EasyInkPrinterClient` | Class | EasyInk.Printer 连接、设备、任务和 PDF 上传客户端 |
| `DEFAULT_EASYINK_PRINTER_URL` | Constant | 默认服务地址 `http://localhost:18080` |
| `createEasyInkPrinter` | Function | 创建简单打印门面，支持 schema + data、PDF 和 HTML 打印 |
| `createEasyInkPrinterDriver` | Function | 创建 Viewer 打印驱动（高级用法） |

类型导出：`EasyInkPrinterClientOptions`, `EasyInkPrinterConnectionState`, `EasyInkPrinterDevice`, `EasyInkPrinterJob`, `EasyInkPrinterOffset`, `EasyInkPrinterPaperSize`, `EasyInkPrinterUserData`, `EasyInkPaperSize`, `EasyInkPrinterDefaults`, `EasyInkPrinterOptions`, `EasyInkPrinter`, `EasyInkPrinterPrintInput`, `EasyInkPrinterPrintPdfInput`, `EasyInkPrinterPrintHtmlInput`, `EasyInkPrintStrategy`, `EasyInkPrinterDriverOptions`

## @easyink/print-integration-hiprint

electron-hiprint 官方前端集成。

| 导出 | 类型 | 说明 |
|------|------|------|
| `createHiPrintClient` | Function | 创建并管理 `vue-plugin-hiprint` 连接的客户端 |
| `createHiPrintRuntimeClient` | Function | 包装业务已有的 HiPrint runtime |
| `HiPrintClient` | Class | HiPrint 连接、设备和打印提交客户端 |
| `HiPrintRuntimeClient` | Class | 只负责打印提交的 runtime adapter |
| `DEFAULT_HIPRINT_URL` | Constant | 默认服务地址 `http://localhost:17521` |
| `createHiPrintPrinter` | Function | 创建托管 Viewer + HiPrint HTML 提交的高阶打印器 |
| `printHtmlWithHiPrintRuntime` | Function | 通过 HiPrint runtime 打印单个 HTML 文档 |

类型导出：`HiPrintClientOptions`, `HiPrintRuntimeClientOptions`, `HiPrintClientLike`, `HiPrintDevice`, `HiPrintPrinterOptions`, `HiPrintPrinter`, `HiPrintPrintRequest`, `PrintHtmlOptions`, `PrintPagesOptions`, `HiPrintProgress`

## @easyink/print-integration-lodop

LODOP/C-Lodop 官方前端集成。

| 导出 | 类型 | 说明 |
|------|------|------|
| `createLodopClient` | Function | 创建并管理 LODOP script、runtime、设备和打印提交的客户端 |
| `createLodopRuntimeClient` | Function | 包装业务已有的 LODOP runtime |
| `LodopClient` | Class | LODOP script 加载、设备枚举和打印提交客户端 |
| `LodopRuntimeClient` | Class | 只负责打印提交的 runtime adapter |
| `DEFAULT_CLODOP_SCRIPT_URLS` | Constant | 默认 C-Lodop script 地址 |
| `loadLodopScript` | Function | 加载 `CLodopfuncs.js`，支持 `name` 命名 runtime |
| `createLodopPrinter` | Function | 创建托管 Viewer + LODOP HTML 提交的高阶打印器 |
| `createLodopDriver` | Function | 创建 Viewer 打印驱动（高级用法） |
| `printHtmlWithLodopRuntime` | Function | 通过 LODOP runtime 打印单个 HTML 文档 |
| `printImageWithLodopRuntime` | Function | 通过 LODOP runtime 打印单张图片 |

类型导出：`LodopClientOptions`, `LodopRuntimeClientOptions`, `LodopClientLike`, `LodopDevice`, `LodopPrinterOptions`, `LodopPrinter`, `LodopPrintRequest`, `LodopScriptConfig`, `LodopScriptOptions`, `LodopScriptSource`, `LodopRuntime`, `PrintHtmlOptions`, `PrintImageOptions`, `PrintPagesOptions`, `LodopProgress`
