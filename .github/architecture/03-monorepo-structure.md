# 3. Monorepo 包结构

新包结构以“文档模型、数据源、设计器、Viewer、物料系统”五条主轴组织，而不是仅围绕一个渲染器展开。

```
easyink/
├── packages/
│   ├── shared/                 # @easyink/shared — 通用类型、工具、常量
│   ├── schema/                 # @easyink/schema — Schema 类型、默认值、迁移、序列化
│   ├── core/                   # @easyink/core — 命令、选择、几何、分页、辅助线、历史
│   ├── datasource/             # @easyink/datasource — 字段树、数据源引用、绑定规则、格式规则
│   ├── viewer/                 # @easyink/viewer — iframe Viewer、预览、打印、导出、缩略图
│   ├── designer/               # @easyink/designer — 设计器工作台 Vue 组件
│   ├── ui/                     # @easyink/ui — 面板、表单、工作台基础组件
│   ├── icons/                  # @easyink/icons — 图标资产
│   ├── samples/                # @easyink/samples — 内置模板库与演示数据
│   └── materials/
│       ├── text/
│       ├── image/
│       ├── barcode/
│       ├── qrcode/
│       ├── line/
│       ├── rect/
│       ├── ellipse/
│       ├── table-static/
│       ├── table-data/
│       ├── container/
│       ├── chart/
│       ├── svg/
│       └── relation/
├── playground/
├── examples/
└── e2e/
```

## 3.1 包职责

### `@easyink/schema`

- 定义文档 Schema
- 提供默认值工厂、迁移器、兼容层
- 只关心模板模型，不关心运行时加载和 UI

### `@easyink/core`

- CommandManager、HistoryModel、SelectionModel
- 几何计算、辅助线、吸附、分页计划、区域模型
- 不直接渲染 DOM，不依赖 Vue

### `@easyink/datasource`

- 字段树协议
- 数据源引用与适配器注册
- 绑定格式规则、聚合规则、批量投放元数据
- 给 `designer` 和 `viewer` 共用，而不是只属于其中一边

### `@easyink/viewer`

- 独立 Viewer 运行时
- 负责预览、缩略图、打印、导出文档入口
- 负责数据加载、字体加载、页面计划与最终页面渲染

### `@easyink/designer`

- 顶部工具栏、画布、面板系统、模板库、概览图、历史记录
- 管理设计态工作台状态
- 通过 iframe 嵌入 `viewer` 做预览，不直接承担全部运行时职责

### `@easyink/material-*`

- 每种物料一个独立包
- 包内同时提供 Schema 默认值、属性描述、Designer 交互、Viewer 渲染器
- 先服务内置体系，第三方开放后再稳定契约

## 3.2 物料包内部结构

以 `@easyink/material-table-data` 为例：

```
packages/materials/table-data/
├── src/
│   ├── schema.ts              # 默认 props、迁移补丁、能力声明
│   ├── designer.ts            # 单元格选区、列宽拖拽、行列编辑、属性桥接
│   ├── viewer.ts              # 表格分页、重复头、合计区渲染
│   ├── datasource.ts          # 绑定提示、字段推荐、union 规则
│   └── index.ts
└── package.json
```

## 3.3 依赖关系

```
shared
  ↑
schema
  ↑
core        datasource
  ↑           ↑
material-* ───┘
  ↑
viewer
  ↑
designer
  ↑
ui / icons / samples
```

依赖原则：

- `designer` 依赖 `viewer`，因为预览由 Viewer 提供
- `viewer` 依赖 `schema`、`core`、`datasource` 和内置物料
- `datasource` 独立于 `designer`，避免把运行时数据接入绑死在 UI 层
- `samples` 作为产品能力的一部分存在，不只是 demo 目录

## 3.4 对外消费方式

```typescript
import { EasyInkDesigner } from '@easyink/designer'
import { createViewer } from '@easyink/viewer'

const viewer = createViewer({ mode: 'fixed' })
await viewer.open({ schema, data })
```

公开入口的目标是两个：

- 宿主可单独使用 `viewer`
- 宿主可直接挂载 `designer`，并在内部复用同一套 Viewer 能力
