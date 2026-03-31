# 4. 分层架构

```
┌─────────────────────────────────────────────────────────┐
│                    Consumer Application                  │
├─────────────────────────────────────────────────────────┤
│  @easyink/designer  (Vue 组件 + Composables)            │
│  ┌──────────────────────────────────────────────────┐   │
│  │  设计器 UI：画布、工具栏、属性面板、图层面板      │   │
│  │  交互层：拖拽、对齐、选择、缩放、旋转            │   │
│  │  数据源面板：开发方注册的字段树、数据绑定 UI        │   │
│  └──────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────┤
│  @easyink/renderer  (DOM 渲染 + 输出适配器)             │
│  ┌──────────────────────────────────────────────────┐   │
│  │  DOMRenderer：Schema → DOM 节点树                │   │
│  │  PrintAdapter：iframe 隔离打印                    │   │
│  │  PDFPipeline：可插拔 PDF 生成                    │   │
│  │  ImageExporter：Canvas 截图导出                   │   │
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
│  └──────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────┤
│  @easyink/shared  (类型 + 工具)                         │
└─────────────────────────────────────────────────────────┘
```

## API 暴露风格：混合模式

核心层使用 Class 实例管理状态和生命周期，Vue 层提供 Composable 封装：

```typescript
// --- Core 层：Class 实例 ---
import { EasyInkEngine } from '@easyink/core'

const engine = new EasyInkEngine({
  schema: loadedSchema,
  plugins: [barcodePlugin(), watermakrPlugin()],
})

engine.on('schema:change', (schema) => { /* ... */ })
engine.setData(orderData)
const layout = engine.layout()

// --- Vue 层：Composable 封装 ---
import { useDesigner } from '@easyink/designer'

const {
  canvas,      // ref: 画布实例
  selected,    // ref: 当前选中元素
  schema,      // reactive: 当前 Schema
  undo,        // () => void
  redo,        // () => void
} = useDesigner({
  schema: initialSchema,
  plugins: [barcodePlugin()],
})
```
