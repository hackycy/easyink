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

## 6.2 Viewer 接口

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

## 6.3 设计器与 Viewer 的关系

设计器预览时：

1. Designer 把当前 Schema 和调试数据传给 iframe Viewer。
2. Viewer 重新做数据解析、分页和渲染。
3. Designer 只接收预览结果事件，不直接操纵 Viewer 内部 DOM。

这保证：

- 设计器不会把自己的编辑态 DOM 误当成真实预览
- 宿主应用与设计器内预览共享同一运行时路径

## 6.4 数据与格式规则处理

Viewer 在渲染前执行：

- 数据源适配器调用
- 字段路径解析
- `usage` 格式规则解释
- 聚合规则求值
- union 批量投放结果合并

但不会执行：

- 任意 JavaScript 表达式
- 来自模板的自定义函数

## 6.5 页面输出

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

## 6.6 样式与承载策略

### 设计器

- 以编辑体验为主
- 可使用 Shadow DOM 或局部样式隔离
- 不要求和打印 DOM 完全同构

### Viewer

- 以稳定预览、打印和导出为主
- 使用 iframe 隔离上下文
- 内部仍以 DOM/SVG 为主要输出
- 自动生成页面样式、打印样式和缩略图容器

## 6.7 诊断机制

诊断事件至少覆盖：

- schema：缺字段、未知元素、迁移降级
- datasource：数据源缺失、路径无效、字段类型不匹配
- viewer：字体加载失败、图片加载失败、页面计划冲突
- material：单个物料渲染失败
- print：打印或导出失败

所有问题默认都应该是可见的、可追踪的，而不是静默跳过。
