# 4. 分层架构

EasyInk 分层的关键点是：设计器和 Viewer 是两个明确协作的上层。

```
┌─────────────────────────────────────────────────────────────┐
│                    Consumer Application                    │
├─────────────────────────────────────────────────────────────┤
│  @easyink/designer                                         │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ WorkbenchChrome   WindowSystem  CanvasWorkspace       │  │
│  │ SelectionOverlay  Binding UX    StatusBar             │  │
│  │ RegionNavigator   Topbar Slot   DesignerStore         │  │
│  └───────────────────────────────────────────────────────┘  │
├─────────────────────────────────────────────────────────────┤
│  @easyink/viewer                                           │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ ViewerRuntime   PagePlanner   ThumbnailPipeline       │  │
│  │ DataLoader      FontLoader    Print/Export Surface    │  │
│  └───────────────────────────────────────────────────────┘  │
├───────────────────────────────┬─────────────────────────────┤
│ @easyink/datasource           │ @easyink/core              │
│ ┌───────────────────────────┐ │ ┌─────────────────────────┐ │
│ │ FieldTree                 │ │ │ CommandManager          │ │
│ │ BindingMeta               │ │ │ Selection / Guides      │ │
│ │ UsageFormatter            │ │ │ Geometry / Snap         │ │
│ │ DataAdapter               │ │ │ Pagination / Regions    │ │
│ └───────────────────────────┘ │ └─────────────────────────┘ │
├─────────────────────────────────────────────────────────────┤
│  @easyink/schema + @easyink/material-* + @easyink/shared   │
└─────────────────────────────────────────────────────────────┘
```

## 4.1 分层职责

### `schema` 层

- 只回答“模板长什么样”
- 不回答“工作台怎么摆”“数据怎么取”“页面怎么打印”

### `core` 层

- 处理命令、历史、选区、几何、辅助线、分页计划、区域划分
- 处理与 UI 无关的纯规则

### `datasource` 层

- 处理字段树、数据源引用、字段推荐、格式规则、聚合规则
- 同时被 Designer 和 Viewer 使用

### `viewer` 层

- 接收 Schema 和数据，产出预览页面、缩略图、打印与导出能力
- 运行时可单独接入宿主，不依赖 Designer

### `designer` 层

- 负责工作台壳层、画布编辑、窗口系统、状态栏、概览图、历史记录
- 通过插槽和 store 暴露宿主扩展面，不把 Viewer、模板选择和导出入口塞进包内

## 4.2 三种状态模型

EasyInk 明确区分三种状态：

### 模板状态

- 页面、辅助线、元素、绑定、动画、分页配置
- 存在 Schema 中
- 可导入导出、可迁移、可进入历史栈

### 工作台状态

- 窗口显隐、位置、尺寸、层级、折叠态、活动面板、缩放与吸附参数
- 不进入 Schema
- 不进入撤销/重做
- 允许本地持久化

### 运行时状态

- Viewer 当前页、缩略图缓存、字体加载状态、数据请求状态、打印任务状态
- 不回写模板
- 生命周期短于模板状态

## 4.3 设计器子层

`@easyink/designer` 内部进一步拆分为：

- `WorkbenchChrome`：两层顶部栏，包含物料直达入口、物料分组入口、全局动作和可配置工具组带
- `CanvasWorkspace`：设计画布、标尺、辅助线、选区和拖拽层
- `WindowSystem`：数据源、属性、结构树、历史、动画、调试、资源、暂存等可拖拽窗口
- `StatusBar`：焦点、网络、暂存、自动保存等工作台状态反馈
- `RegionNavigator`：多编辑区或区段型文档的区域切换与区块选择入口
- `Host Integration Surface`：`#topbar` 插槽与 `useDesignerStore()`，供宿主接入自定义模板选择、预览和保存动作

## 4.4 对外 API

### Designer

```vue
<template>
  <EasyInkDesigner
    v-model:schema="schema"
    :data-sources="dataSources"
    :preference-provider="preferenceProvider"
  >
    <template #topbar>
      <button @click="openPreview">
        预览
      </button>
    </template>
  </EasyInkDesigner>
</template>
```

### Viewer

```typescript
import { createViewer } from '@easyink/viewer'

const viewer = createViewer({ mode: 'fixed' })

await viewer.open({
  schema,
  data,
  dataSources,
})

await viewer.print()
await viewer.exportDocument()
```

API 设计要点：

- `viewer` 是独立消费面
- `designer` 不内置 `viewer`，由宿主决定何时引入预览、打印和导出能力
- 数据源协议由 `datasource` 层统一，不再只通过 Designer 私有 props 传递
