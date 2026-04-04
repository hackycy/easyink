# 9. 内部扩展机制

EasyInk 当前保留扩展抽象，但它的目标是支撑内置体系演进，而不是立刻开放成稳定的第三方插件平台。

## 9.1 当前边界

当前版本的扩展机制只服务以下场景：

- 内置物料包接入
- Designer 面板和工具栏扩展
- Viewer 运行时适配器扩展
- 数据源适配器与模板库来源扩展

不在当前稳定扩展面中的能力：

- 模板内执行任意脚本
- 模板内注册自定义表达式语言
- 运行时动态注入任意渲染器
- 面向第三方生态的兼容性承诺

## 9.2 扩展主题

内部扩展抽象围绕五类对象组织：

### 物料扩展

- 注册物料定义
- 注册 Designer 交互能力
- 注册 Viewer 渲染能力
- 注册数据源投放提示

### 数据源扩展

- 注册 `DataAdapter`
- 扩展字段推荐和 `usage` 解释器
- 扩展模板库示例数据来源

### 工作台扩展

- 注册面板
- 注册顶部工具栏动作
- 注册右键菜单动作

### Viewer 扩展

- 打印适配器
- 导出适配器
- 字体加载器
- 缩略图生成器

### 诊断扩展

- 订阅诊断事件
- 映射到工作台面板或宿主日志系统

## 9.3 内部扩展上下文

```typescript
interface InternalExtensionContext {
  materials: MaterialExtensionRegistry
  datasource: DataSourceExtensionRegistry
  designer: DesignerExtensionRegistry
  viewer: ViewerExtensionRegistry
  hooks: InternalHooks
}

interface MaterialExtensionRegistry {
  register(definition: MaterialDefinition): void
  registerDesigner(type: string, designer: MaterialDesignerExtension): void
  registerViewer(type: string, viewer: MaterialViewerExtension): void
}

interface DataSourceExtensionRegistry {
  registerAdapter(adapter: DataAdapter): void
  registerUsageResolver(resolver: UsageResolver): void
}

interface DesignerExtensionRegistry {
  addPanel(panel: DesignerPanelDefinition): void
  addToolbarItem(item: ToolbarItemDefinition): void
  addContextAction(action: ContextActionDefinition): void
}

interface ViewerExtensionRegistry {
  registerPrintAdapter(adapter: PrintAdapter): void
  registerExportAdapter(adapter: ExportAdapter): void
  registerFontLoader(loader: FontLoader): void
}
```

## 9.4 Hook 设计

Hook 只做有限可控的编排，不承担任意业务脚本执行。

```typescript
interface InternalHooks {
  beforeSchemaNormalize: SyncWaterfallHook<[DocumentSchema]>
  beforePagePlan: SyncWaterfallHook<[PagePlanningContext]>
  beforeMaterialRender: SyncWaterfallHook<[MaterialRenderPayload]>
  diagnosticsEmitted: AsyncEvent<[ViewerDiagnosticEvent]>
  commandCommitted: AsyncEvent<[CommandRecord]>
  workbenchReady: AsyncEvent<[]>
}
```

设计原则：

- 允许补齐上下文和注入受控能力
- 不允许执行不透明业务逻辑来改写模板语义
- Hook 失败应可诊断，不应静默吞掉

## 9.5 为什么暂不开放第三方插件

原因不是“不需要扩展”，而是核心模型还在收敛：

- Schema 还在建立稳定的报表设计器语义
- Designer 交互模型仍在向对标产品靠拢
- Viewer 的打印、导出和缩略图链路还没有完全固化

因此当前策略是：

- 先把扩展点做成内部抽象
- 观察真实实现是否稳定
- 再选择性公开最小必要接口
