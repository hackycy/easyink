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

类型导出：`DocumentSchema`, `DocumentSchemaInput`, `MaterialNode`, `DataSourceDescriptor`, `Contribution`, `ContributionContext`, `Command`, `PanelDescriptor`, `ToolbarActionDescriptor`, `DesignerConfirmRequest`, `DesignerConfirmSeverity`, `DesignerInteractionProvider`, `DesignerMaterialBundle`, `DesignerMaterialRegistration`, `DesignerCatalogRegistration`, `MaterialCapabilities`, `TemplateAutoSaveOptions`, `PreferenceProvider`, `PersistableWorkbenchState`, `LocaleMessages`, `FontDescriptor`, `FontProvider`

## @easyink/core

共享核心能力。

| 导出 | 类型 | 说明 |
|------|------|------|
| `FontManager` | Class | 字体目录缓存、加载状态、批量加载和可选 `@font-face` 注入 |
| `collectFontFamilies` | Function | 从 DocumentSchema 收集页面和元素字体引用 |

字体相关类型导出：`FontDescriptor`, `FontProvider`, `FontSource`, `FontLoadRequest`, `FontLoadStatus`, `FontLoadState`, `FontLoadSuccess`, `FontLoadFailure`, `FontBatchLoadOptions`, `FontBatchLoadResult`, `FontPreloadResult`

## @easyink/viewer

独立的预览/打印/导出引擎。

| 导出 | 类型 | 说明 |
|------|------|------|
| `createViewer` | Function | 创建 ViewerRuntime |
| `ViewerRuntime` | Class | 核心运行时 |
| `MaterialRendererRegistry` | Class | 物料渲染注册表 |
| `renderPages` | Function | 渲染页面 DOM |
| `createThumbnails` | Function | 生成缩略图 |
| `collectFontFamilies` | Function | 收集字体引用 |
| `loadAndInjectFonts` | Function | 加载并注入字体到 Viewer host document |
| `projectBindings` | Function | 解析数据绑定 |
| `applyBindingsToProps` | Function | 应用绑定到属性 |
| `resolvePrintPolicy` | Function | 解析打印策略 |
| `PrintPolicyError` | Class | 打印策略解析错误 |
| `createBrowserViewerHost` | Function | Browser Host |
| `createIframeViewerHost` | Function | Iframe Host |
| `createCustomViewerHost` | Function | Custom Host |

类型导出：`ViewerHost`, `ViewerOptions`, `ViewerOpenInput`, `ViewerRenderResult`, `ViewerDiagnosticEvent`, `PrintDriver`, `ViewerPrintOptions`, `ViewerPrintPolicy`, `ViewerPrintContext`, `ViewerExporter`, `ViewerExportContext`, `ViewerExportOptions`, `ViewerTaskCallbacks`, `ViewerTaskPhaseEvent`, `ViewerTaskProgressEvent`, `MaterialViewerExtension`, `ViewerRenderContext`, `ViewerMeasureContext`, `FontDescriptor`, `FontProvider`

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
| `isCompatibleVersion` | Function | 判断 Schema 主版本是否兼容 |

类型导出：`DocumentSchema`, `DocumentSchemaInput`, `DocumentMeta`, `PageSchema`, `PageModelConfig`, `DocumentLayoutConfig`, `PaginationConfig`, `ReflowConfig`, `MaterialNode`, `TableNode`, `TableSchema`, `BindingRef`, `AnimationSchema`, `SchemaValidationIssue`, `SchemaDeserializeError`, `SchemaMigrationError`

## @easyink/export-runtime

导出运行时框架。

| 导出 | 类型 | 说明 |
|------|------|------|
| `createExportRuntime` | Function | 创建 ExportRuntime |
| `ExportRuntime` | Class | 导出运行时 |

类型导出：`ExportFormatPlugin`, `ExportRuntimeContext`, `ExportDiagnostic`, `ExportProgress`

## @easyink/export-plugin-dom-pdf

DOM-to-PDF 导出插件。

| 导出 | 类型 | 说明 |
|------|------|------|
| `createDomPdfExportPlugin` | Function | 创建 `pdf` 格式导出插件 |
| `renderPagesToPdfBlob` | Function | 将 Viewer 页面 DOM 渲染为 PDF Blob |
| `resolveCanvasScale` | Function | 按 DPI 计算 html2canvas 缩放比例 |

类型导出：`DomPdfExportInput`, `DomPdfExportPluginOptions`, `RenderPagesToPdfOptions`, `JsPDF`

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

类型导出：`PrintDriverRequestContext`, `PrintDriverBaseOptions`, `ManagedPrintViewerOptions`, `ManagedPrintViewer`, `ManagedPrintInput`, `PrinterDeviceLike`, `PrintJobLike`, `ViewerPdfPageSize`, `ViewerPdfPageInput`

## @easyink/print-integration-easyink-printer

EasyInk.Printer 官方前端集成。

| 导出 | 类型 | 说明 |
|------|------|------|
| `createEasyInkPrinterClient` | Function | 创建 HTTP/WebSocket 客户端 |
| `EasyInkPrinterClient` | Class | EasyInk.Printer 连接、设备、任务和 PDF 上传客户端 |
| `DEFAULT_EASYINK_PRINTER_URL` | Constant | 默认服务地址 `http://localhost:18080` |
| `createEasyInkPrinter` | Function | 创建托管 Viewer + PDF 上传或 Printer-side Render 的高阶打印器 |
| `createEasyInkPrinterDriver` | Function | 创建 Viewer 打印驱动 |

类型导出：`EasyInkPrinterClientOptions`, `EasyInkPrinterConnectionState`, `EasyInkPrinterDevice`, `EasyInkPrinterJob`, `EasyInkPrinterPrintPdfOptions`, `EasyInkPrinterPrintRenderOptions`, `EasyInkPrinterRenderSource`, `EasyInkPrinterRenderOptions`, `EasyInkPrinterOptions`, `EasyInkPrinter`, `EasyInkPrinterPrintRequest`, `EasyInkPrinterDriverSubmitMode`

## @easyink/print-integration-hiprint

electron-hiprint 官方前端集成。

| 导出 | 类型 | 说明 |
|------|------|------|
| `createHiPrintClient` | Function | 创建并管理 `vue-plugin-hiprint` 连接的客户端 |
| `createHiPrintRuntimeClient` | Function | 包装业务已有的 HiPrint runtime |
| `createLegacyHiPrintClient` | Function | `createHiPrintRuntimeClient` 的兼容别名 |
| `HiPrintClient` | Class | HiPrint 连接、设备和打印提交客户端 |
| `HiPrintRuntimeClient` | Class | 只负责打印提交的 runtime adapter |
| `DEFAULT_HIPRINT_URL` | Constant | 默认服务地址 `http://localhost:17521` |
| `createHiPrintPrinter` | Function | 创建托管 Viewer + HiPrint HTML 提交的高阶打印器 |
| `printHtmlWithHiPrintRuntime` | Function | 通过 HiPrint runtime 打印单个 HTML 文档 |

类型导出：`HiPrintClientOptions`, `HiPrintRuntimeClientOptions`, `HiPrintClientLike`, `HiPrintDevice`, `HiPrintPrinterOptions`, `HiPrintPrinter`, `HiPrintPrintRequest`, `PrintHtmlOptions`, `PrintPagesOptions`, `HiPrintProgress`

## @easyink/ai

Designer AI contribution 与 MCP 客户端。

| 导出 | 类型 | 说明 |
|------|------|------|
| `AIPanel` | Vue Component | 可单独挂载的 AI 面板 |
| `createAIContribution` | Function | 注册 AI 面板、工具栏按钮和 `ai.togglePanel` 命令 |
| `MCPClient` | Class | MCP 工具调用客户端 |
| `ServerRegistry` | Class | MCP server 配置注册表 |
| `validateServerConfig` | Function | 校验 MCP server 配置 |

类型导出：`CreateAIContributionOptions`, `MCPServerConfig`, `MCPProviderConfig`, `MCPAuthConfig`, `MCPTool`, `MCPToolResult`, `GenerateOptions`, `GenerateResult`, `GenerateContext`, `ConnectionState`, `ServerStatus`, `SessionMessage`

## @easyink/mcp-server

EasyInk MCP 服务端。

| 导出 | 类型 | 说明 |
|------|------|------|
| `createMCPServer` | Function | 创建 MCP server 并注册工具 |
| `startStdioServer` | Function | 以 stdio transport 启动 |
| `startHTTPServer` | Function | 以 Streamable HTTP transport 启动 `/mcp` |
| `ClaudeProvider` | Class | Claude LLM provider |
| `OpenAIProvider` | Class | OpenAI LLM provider |
| `registerGenerateSchemaTool` | Function | 注册 `generateSchema` 工具 |
| `registerGenerateDataSourceTool` | Function | 注册 `generateDataSource` 工具 |
| `registerDebugTools` | Function | 注册调试工具 |

类型导出：`MCPServerOptions`, `LLMConfig`, `LLMProvider`, `SchemaGenerationInput`, `SchemaGenerationOutput`, `DataSourceGenerationInput`, `DataSourceGenerationOutput`
