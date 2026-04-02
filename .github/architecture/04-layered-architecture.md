# 4. 分层架构

```
┌─────────────────────────────────────────────────────────┐
│                    Consumer Application                  │
├─────────────────────────────────────────────────────────┤
│  @easyink/designer  (Vue 组件 + Composables)            │
│  ┌──────────────────────────────────────────────────┐   │
│  │  Workbench：顶部双栏、Logo、物料栏、系统操作栏    │   │
│  │  Workspace：画布、浮动窗口、窗口状态、偏好持久化  │   │
│  │  交互层：拖拽、对齐、选择、缩放、旋转、绑定       │   │
│  └──────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────┤
│  @easyink/renderer  (DOM 渲染)                         │
│  ┌──────────────────────────────────────────────────┐   │
│  │  DOMRenderer：Schema + data → DOM 节点树         │   │
│  │  MeasureLayer：文本/表格测量、溢出诊断           │   │
│  │  MaterialRendererRegistry：物料渲染函数注册表     │   │
│  └──────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────┤
│  @easyink/core  (框架无关的核心引擎)                   │
│  ┌──────────────────────────────────────────────────┐   │
│  │  SchemaEngine：Schema CRUD、校验、遍历           │   │
│  │  LayoutEngine：坐标推移布局计算                  │   │
│  │  DataSourceManager：字段树注册、路径解析          │   │
│  │  PluginManager：内部扩展点、生命周期管理          │   │
│  │  CommandManager：撤销/重做栈                     │   │
│  │  UnitManager：单位存储与转换                     │   │
│  └──────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────┤
│  @easyink/shared  (类型 + 工具)                       │
└─────────────────────────────────────────────────────────┘
```

## 职责切分

- `@easyink/core` 负责描述模板、解析绑定、计算布局，不承担模板动态计算和导出链路。
- `@easyink/renderer` 只负责把 Schema 渲染为 DOM，并报告测量结果与溢出状态；它必须可以在不引入设计器的前提下单独消费。
- `Consumer Application` 负责准备展示值数据，并基于 DOM 自行决定打印、导出 PDF 或图片。
- `@easyink/designer` 负责提供开箱即用且默认美观的设计工作台，记录字段来源和静态属性，不在设计时填充真实数据。
- 设计器中的窗口显示/隐藏、位置、激活态、最小化状态属于工作台偏好，不进入 Schema，也不进入撤销/重做栈。

## 4.1 外部稳定面

近两版对外只稳定最小消费面：

- `@easyink/core` 的 Schema 加载、迁移与基础遍历能力
- `@easyink/renderer` 的最小 DOM 渲染入口与诊断事件流
- `@easyink/designer` 的基础设计器入口

以下能力继续视为仓库内可演进抽象，不承诺近期稳定兼容：

- `TemplateSchema` 的外部手写 DSL 语义
- `PropSchema` 的函数式协议细节
- 自定义编辑器注册、内部插件钩子、第三方物料包契约

## 设计器工作台子层

`@easyink/designer` 在 UI 层内进一步拆为三个协作子层：

- `WorkbenchChrome`：顶部双栏结构。左侧承载 Logo 与物料栏，右侧承载撤销、重做、删除、缩放以及各工作台窗口开关，默认采用高密度 Icon 按钮。
- `CanvasWorkspace`：画布所在的主工作区，窗口仅允许在该区域内浮动与拖拽，不覆盖顶部栏。
- `WorkspaceWindowSystem`：统一窗口壳层，承载属性、页面设置、结构树、数据源、历史记录、快捷帮助等操作面板；支持标题栏拖拽、点击置顶、最小化与关闭后重开。

## API 暴露风格：混合模式

核心层使用 Class 实例管理状态和生命周期，Vue 层提供 Composable 封装：

```typescript
// --- Core / Renderer 层：最小运行时入口 ---
import { EasyInkEngine } from '@easyink/core'
import { DOMRenderer } from '@easyink/renderer'

const engine = new EasyInkEngine({
  schema: loadedSchema,
})

engine.on('schema:change', (schema) => { /* ... */ })

const renderer = new DOMRenderer({ engine })
renderer.on('diagnostic', (event) => {
  console.warn(event.code, event.message)
})

const result = renderer.render(loadedSchema, preparedDisplayData, container)

if (result.overflowed) {
  console.warn('template content exceeds declared paper height')
}

// --- Vue 层：Composable 封装 ---
import { useDesigner } from '@easyink/designer'

const {
  canvas,
  selected,
  schema,
  undo,
  redo,
} = useDesigner({
  schema: initialSchema,
})
```
