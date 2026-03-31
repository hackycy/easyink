# 4. 分层架构

```
┌─────────────────────────────────────────────────────────┐
│                    Consumer Application                  │
├─────────────────────────────────────────────────────────┤
│  @easyink/designer  (设计器框架 + 行为解释器)            │
│  ┌──────────────────────────────────────────────────┐   │
│  │  设计器 UI：画布、工具栏、属性面板、图层面板      │   │
│  │  交互层：拖拽、对齐、选择、缩放、旋转            │   │
│  │  行为解释器：解释物料声明的 DesignerBehavior      │   │
│  │  数据源面板：开发方注册的字段树、数据绑定 UI        │   │
│  │  内置物料自动注册（headless + designer 全层）     │   │
│  └──────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────┤
│  @easyink/renderer  (DOM 渲染 + 输出适配器)             │
│  ┌──────────────────────────────────────────────────┐   │
│  │  DOMRenderer：Schema → DOM 节点树                │   │
│  │  PrintAdapter：iframe 隔离打印                    │   │
│  │  PDFPipeline：可插拔 PDF 生成                    │   │
│  │  ImageExporter：Canvas 截图导出                   │   │
│  │  内置物料自动注册（headless 层）                   │   │
│  └──────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────┤
│  @easyink/material-*  (物料包，每个元素类型一个包)        │
│  ┌──────────────────────────────────────────────────┐   │
│  │  /headless：ElementTypeDefinition + 渲染函数      │   │
│  │  /designer：Vue 组件 + Behavior 声明 + 编辑器     │   │
│  │  （内部消费，由 renderer/designer 统一引入）       │   │
│  └──────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────┤
│  @easyink/core  (框架无关的核心引擎)                     │
│  ┌──────────────────────────────────────────────────┐   │
│  │  SchemaEngine：Schema CRUD、校验、遍历           │   │
│  │  LayoutEngine：混合布局计算                      │   │
│  │  ExpressionEngine：沙箱化表达式求值              │   │
│  │  DataSourceManager：数据源注册、扁平字段解析          │   │
│  │  PluginManager：钩子注册、生命周期管理            │   │
│  │  CommandManager：撤销/重做栈                     │   │
│  │  UnitManager：单位存储与转换                     │   │
│  │  ElementRegistry：元素类型注册（不含内置定义）     │   │
│  │  MaterialRegistry：物料注册入口（useMaterial）     │   │
│  └──────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────┤
│  @easyink/shared  (类型 + 工具)                         │
└─────────────────────────────────────────────────────────┘
```

> **物料包自动注册**：`@easyink/material-*` 是 `@easyink/renderer` 和 `@easyink/designer` 的 `dependencies`，消费者无需单独安装。renderer 初始化时自动注册所有内置物料的 headless 层；designer 初始化时自动注册 headless + designer 全层。第三方物料通过 `useMaterial()` 手动注册。

## API 暴露风格：混合模式

核心层使用 Class 实例管理状态和生命周期，Vue 层提供 Composable 封装：

```typescript
// --- Core 层：Class 实例（仅渲染场景） ---
import { EasyInkEngine } from '@easyink/core'
import { EasyInkRenderer } from '@easyink/renderer'

// 内置物料已自动注册，无需手动导入
const engine = new EasyInkEngine({
  schema: loadedSchema,
  plugins: [watermarkPlugin()],
})

engine.on('schema:change', (schema) => { /* ... */ })
engine.setData(orderData)

const renderer = new EasyInkRenderer({ engine })
renderer.render(container)

// --- 第三方物料手动注册 ---
import { myDefinition, myRenderer } from 'my-custom-material/headless'
engine.useMaterial({ definition: myDefinition, renderer: myRenderer })

// --- Vue 层：Composable 封装（设计器场景） ---
import { useDesigner } from '@easyink/designer'

// 内置物料已自动注册，无需手动传入 materials 数组
const {
  canvas,      // ref: 画布实例
  selected,    // ref: 当前选中元素
  schema,      // reactive: 当前 Schema
  undo,        // () => void
  redo,        // () => void
} = useDesigner({
  schema: initialSchema,
  plugins: [watermarkPlugin()],
})

// 第三方物料需手动注册
import { myMaterial } from 'my-custom-material/designer'
engine.useMaterial(myMaterial)
```
