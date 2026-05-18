# 核心概念

## Schema（文档模板）

Schema 是 EasyInk 的核心数据结构，描述了文档的完整结构：页面尺寸、元素列表、数据绑定、分页配置等。它是设计器和预览器之间的唯一桥梁。

```ts
interface DocumentSchema {
  version: string
  meta?: DocumentMeta
  unit: 'mm' | 'pt' | 'px' | 'inch'
  page: PageSchema
  guides: GuideSchema
  elements: MaterialNode[]
  groups?: ElementGroupSchema[]
  extensions?: Record<string, unknown>
  compat?: BenchmarkCompatState
}
```

设计器编辑 Schema，预览器消费 Schema。模板的导入导出、持久化、历史记录都围绕 Schema 进行。宿主传给设计器的 `schema` 可以是空对象或部分字段，框架会先补齐默认值；设计器内部、自动保存和预览器拿到的始终是完整 `DocumentSchema`。

## 三种状态模型

EasyInk 明确区分三种状态，避免混乱：

| 状态 | 存储位置 | 是否可撤销 | 是否可持久化 |
|------|----------|-----------|-------------|
| **模板状态** | Schema | 是 | 是（导入导出、历史栈） |
| **工作台状态** | WorkbenchState | 否 | 是（用户偏好） |
| **运行时状态** | ViewerRuntime | 否 | 否（生命周期短） |

- **模板状态**：页面、元素、绑定、动画、分页配置
- **工作台状态**：窗口显隐、位置、层级、活动面板、缩放参数
- **运行时状态**：Viewer 当前页、缩略图缓存、字体加载状态、打印任务

## 物料（Material）

物料是文档中的可编辑元素类型（文本、图片、条码、表格等）。每个物料由四部分组成：

1. **Schema 定义** -- 元素在 Schema 中的数据结构
2. **Designer 交互** -- 设计态的属性面板、拖拽行为、双击编辑
3. **Viewer 渲染** -- 预览态的 DOM 渲染逻辑
4. **目录注册** -- 在物料面板中的分类和图标

物料通过 `capabilities` 声明自身能力：是否可绑定数据（`bindable`）、是否可旋转（`rotatable`）、是否可缩放（`resizable`）、是否支持子元素（`supportsChildren`）、是否支持动画（`supportsAnimation`）、是否支持联合拖放（`supportsUnionDrop`）、是否可分页感知（`pageAware`）、是否支持多重绑定（`multiBinding`）、是否保持宽高比（`keepAspectRatio`）。

## Designer 包边界

`@easyink/designer` 负责工作台、画布、属性面板、注册协议和状态管理。为了让维护边界更清楚，设计器相关的静态资源拆成独立包：

- `@easyink/locales`：维护内置 `zhCN` / `enUS` 语言包。应用侧仍推荐从 `@easyink/designer/locale` 引入，设计器负责向外透出。
- `@easyink/prop-schemas`：维护内置物料的基础属性 Schema，例如文本、图片、表格、条码等属性面板字段。

因此，修改翻译或内置物料属性项通常只影响这些资源包；只有属性面板协议、注册流程、Store 行为、画布交互等变化才属于 Designer 核心层变化。

## 数据源（DataSource）

数据源定义了可绑定到元素上的字段树。每个数据源包含一组字段，字段有路径、标签和类型（text/image/number 等）。

用户通过拖拽数据源字段到元素上完成绑定。Viewer 渲染时根据绑定关系将运行时数据填充到元素中。

## 分页模式

| 模式 | 说明 |
|------|------|
| `fixed` | 固定页面模式，每页尺寸固定，元素绝对定位 |
| `stack` | 堆叠流式模式，元素按 Y 轴排列，自动分页 |
| `label` | 标签模式，多列多行网格布局 |

## 扩展机制

EasyInk 提供两个层面的扩展：

- **物料扩展**：通过 `registerMaterialBundle` 注册自定义物料类型
- **贡献扩展**：通过 `Contribution` API 注入自定义面板、工具栏按钮和命令
