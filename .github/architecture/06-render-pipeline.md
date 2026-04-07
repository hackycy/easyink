# 6. 渲染与预览管线

EasyInk 现在不再把“渲染”理解成单次 DOM 输出，而是把它定义为 Viewer 运行时流程。

## 6.1 Viewer 主流程

```
Schema
  │
  ▼
SchemaNormalizer / Migrator
  │
  ▼
DataSourceResolver
  │
  ▼
UsageFormatter / AggregateResolver
  │
  ▼
PagePlanner
  │
  ▼
MaterialRendererRegistry
  │
  ├── 页面 DOM / SVG
  ├── 缩略图模型
  └── 打印 / 导出入口
```

区别于旧设计的关键点：

- 预览不是设计器画布的一部分，而是 Viewer 独立流程
- 数据加载、字体加载、分页、缩略图生成都属于 Viewer
- 设计器只负责嵌入和调度 Viewer

## 6.2 运行时阶段补充

结合对标产品实测，Viewer 运行时至少还要显式经过以下阶段：

1. `SchemaCodec`：把外部输入转为 EasyInk 规范模型。
2. `FontRegistryLoader`：加载字体描述与字体资源。
3. `DataSourceResolver`：根据 `sourceId / sourceTag` 拉取数据。
4. `BindingProjector`：处理 `usage / union / bindIndex`。
5. `PagePlanner`：生成固定分页、连续页或标签页计划。
6. `RenderSurface`：输出页面 DOM/SVG 和缩略图。
7. `ExportAdapterLoader`：按需装载导出依赖和适配器。

## 6.3 Viewer 接口

```typescript
function createViewer(options?: ViewerOptions): ViewerRuntime

interface ViewerRuntime {
  open(input: ViewerOpenInput): Promise<void>
  updateData(data: Record<string, unknown>): Promise<void>
  print(): Promise<void>
  exportDocument(): Promise<Blob | void>
  destroy(): void
}

interface ViewerOpenInput {
  schema: DocumentSchema
  data?: Record<string, unknown>
  dataSources?: DataSourceDescriptor[]
  onDiagnostic?: (event: ViewerDiagnosticEvent) => void
}
```

## 6.4 设计态渲染与 Viewer 渲染的分层

EasyInk 存在两套独立的物料渲染能力，不共享实现代码：

| | 设计态渲染 | Viewer 渲染 |
|---|---|---|
| 接口 | `MaterialDesignerExtension.renderContent()` | `MaterialViewerExtension.render()` |
| 运行场景 | Designer 画布内 | Viewer 运行时（预览/打印/导出） |
| 数据 | 无真实数据，绑定显示为字段标签 | 真实数据绑定 + 格式化 |
| 性能要求 | 主线程同步渲染，必须轻量 | 可异步，可引入重量级第三方库 |
| 输出 | HTML 注入画布元素容器 | DOM/SVG 页面 + 缩略图 |

详细设计见 [10.9 画布设计态渲染](./10-designer-interaction.md) 和 [11.6 Designer 扩展面](./11-element-system.md)。

## 6.5 设计器与 Viewer 的全量预览关系

设计器预览时：

1. Designer 把当前 Schema 和调试数据传给 iframe Viewer。
2. Viewer 重新做数据解析、分页和渲染。
3. Designer 只接收预览结果事件，不直接操纵 Viewer 内部 DOM。

这保证：

- 设计器不会把自己的编辑态 DOM 误当成真实预览
- 宿主应用与设计器内预览共享同一运行时路径

## 6.6 数据与格式规则处理

Viewer 在渲染前执行：

- 数据源适配器调用
- 字段路径解析
- `usage` 格式规则解释
- 聚合规则求值
- union 批量投放结果合并

但不会执行：

- 任意 JavaScript 表达式
- 来自模板的自定义函数

## 6.7 页面输出

Viewer 的输出不再只有一个 `page` DOM 节点，而是页面集合：

```typescript
interface ViewerRenderResult {
  pages: ViewerPageResult[]
  thumbnails: ThumbnailResult[]
  diagnostics: ViewerDiagnosticEvent[]
}

interface ViewerPageResult {
  index: number
  width: number
  height: number
  elementCount: number
}
```

## 6.8 样式与承载策略

### 设计器

- 以编辑体验为主
- 可使用 Shadow DOM 或局部样式隔离
- 不要求和打印 DOM 完全同构

### Viewer

- 以稳定预览、打印和导出为主
- 使用 iframe 隔离上下文
- 内部仍以 DOM/SVG 为主要输出
- 自动生成页面样式、打印样式和缩略图容器

## 6.9 导出依赖装载

对标产品预览时已经验证 `viewer` 会动态加载：

- `pptxgenjs`
- `jszip`
- `jspdf`
- `file-saver`
- `docx`

这意味着 EasyInk 需要把导出能力建模成运行时适配器：

- 预览核心路径不强绑定某一个导出格式
- 第三方导出依赖按需装载
- 装载失败时给出可见诊断，而不是让整个 Viewer 崩溃

## 6.10 诊断机制

诊断事件至少覆盖：

- schema：缺字段、未知元素、迁移降级
- datasource：数据源缺失、路径无效、字段类型不匹配
- viewer：字体加载失败、图片加载失败、页面计划冲突
- material：单个物料渲染失败
- print：打印或导出失败
- export-adapter：第三方依赖加载失败、格式不支持、宿主能力缺失

所有问题默认都应该是可见的、可追踪的，而不是静默跳过。
