# 4. 分层架构

EasyInk 分层的关键点是：设计器和 Viewer 是两个明确协作的上层。

```
┌─────────────────────────────────────────────────────────────┐
│                    Consumer Application                    │
├─────────────────────────────────────────────────────────────┤
│        @easyink/designer / @easyink/viewer                  │
├─────────────────────────────────────────────────────────────┤
│  @easyink/designer                                         │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ WorkbenchChrome   WindowSystem  CanvasWorkspace       │  │
│  │ SelectionOverlay  Binding UX    StatusBar             │  │
│  │ RegionNavigator   Topbar Slot   DesignerStore         │  │
│  └───────────────────────────────────────────────────────┘  │
├─────────────────────────────────────────────────────────────┤
│  @easyink/locales + @easyink/prop-schemas                  │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ Built-in Locale Messages   Built-in Base PropSchemas │  │
│  └───────────────────────────────────────────────────────┘  │
├─────────────────────────────────────────────────────────────┤
│  @easyink/viewer                                           │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ ViewerRuntime   Layout/Pagination   ThumbnailPipeline │  │
│  │ DataLoader      FontLoader    Print/Export Surface    │  │
│  └───────────────────────────────────────────────────────┘  │
├─────────────────────────────────────────────────────────────┤
│  @easyink/builtin                                          │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ Complete Designer / Viewer Material Collections     │  │
│  │ Host-isolated all / basic / none exports             │  │
│  └───────────────────────────────────────────────────────┘  │
├───────────────────────────────┬─────────────────────────────┤
│ @easyink/datasource           │ @easyink/core              │
│ ┌───────────────────────────┐ │ ┌─────────────────────────┐ │
│ │ FieldTree                 │ │ │ CommandManager          │ │
│ │ BindingMeta               │ │ │ Selection / Guides      │ │
│ │ UsageFormatter            │ │ │ Geometry / Snap         │ │
│ │ DataAdapter               │ │ │ Layout / Pagination     │ │
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

### `plugin-api` 契约层

公共声明从 core/schema/shared 复用领域协议，Designer 查询返回深只读文档、节点和选区，修改通过命令、同步 draft 事务或显式文档替换。Viewer 上下文提供本轮数据、目标 document 与资源登记，不提供编辑操作。Vue 组件声明隔离在 `@easyink/plugin-api/ui`；框架通过 `context` prop 或回调参数提供对应上下文。

这层已经可从实际构建 exports 消费，没有运行注册表或宿主实现。Designer/Viewer 分别依赖 plugin-runtime 装配自己的 Host，应用在创建前选择完整物料集合。

### `plugin-runtime` 装配层

`createHost` 在内核中同步收集并校验完整声明，维护唯一只读登记源和 Scope 所有权，等待宿主提供的核心消费者初始化。内核不解释布局、不创建 Vue 组件、不编辑文档；只依赖 plugin-api。locale 错误降级运行，登记或核心初始化错误等待整体清理后拒绝创建。

销毁先同步失效和撤销登记视图，再停用消费者、逆序清理 Scope；受管任务同时检查 Host、Scope 和任务代次，迟到资源单独释放。Viewer 与 DesignerStore.create 已通过 Promise 创建接入独立 Host，删除物料/locale 的创建后写入登记。Store 的工作台目录由内核声明只读投影，命令按登记 owner 执行；Vue 组件内部等待创建并管理卸载，旧 Contribution registry 和完整 Store 注入已删除。工作台业务与各 Render Session 已使用这一边界，类型消费和公共行为测试覆盖双宿主、异步迟到、输出持有与清理。

### `datasource` 层

- 处理字段树、数据源引用、字段推荐、格式规则、聚合规则
- 同时被 Designer 和 Viewer 使用

### `viewer` 层

- 接收 Schema 和数据，产出预览页面、缩略图、打印与导出能力
- 运行时可单独接入宿主，不依赖 Designer

### builtin 层

- `@easyink/builtin` 负责内置物料装配
- 它消费 `material-*` 包，根/all/basic 输出完整 Designer `materials`，all/viewer 和 basic/viewer 输出纯 Viewer `materials`，none 是两端可用的纯空集合
- 应用显式选择集合；Designer/Viewer 底层没有 builtin 运行依赖

### `designer` 层

- 负责工作台壳层、画布编辑、窗口系统、状态栏、概览图、历史记录
- 创建前接收完整物料/扩展，内部等待 Host 创建；应用通过插槽和 `useDesignerStore()` 接入工作台，扩展只取得受控 context。旧 `setupStore` 注入已删除
- 语言包和内置基础属性 Schema 不直接落在 designer 源码中，分别由 `@easyink/locales` 与 `@easyink/prop-schemas` 提供；designer 只消费这些资源并维持 `@easyink/designer/locale` facade

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
- `Host Integration Surface`：`#topbar` 插槽、`useDesignerStore()` 与 `interactionProvider`，供宿主接入自定义模板选择、预览、保存动作和破坏性操作确认

## 4.4 对外 API

### Designer

```vue
<template>
  <EasyInkDesigner
    v-model:schema="schema"
    :materials="materials"
    :data-sources="dataSources"
    :preference-provider="preferenceProvider"
    :interaction-provider="interactionProvider"
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
import { materials } from '@easyink/builtin/all/viewer'

const viewer = await createViewer({ mode: 'fixed', materials })

await viewer.open({
  schema,
  data,
})

await viewer.print()
await viewer.exportDocument()
await viewer.destroy()
```

API 设计要点：

- `viewer` 是独立消费面
- `viewer` 只消费 `schema + data`，不接收 `dataSources`
- `designer` 不内置 `viewer`，由宿主决定何时引入预览、打印和导出能力
- 应用给 `designer` / `viewer` 选择对应完整集合；各实例独立装配
- 数据源协议由 `datasource` 层统一，不再只通过 Designer 私有 props 传递
