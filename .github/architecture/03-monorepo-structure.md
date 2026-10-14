# 3. Monorepo 包结构

包结构以“文档模型、数据源、核心能力、设计器、Viewer、物料系统、导出/打印、Assistant”几条主轴组织。

```
easyink/
├── packages/
│   ├── shared/                 # @easyink/shared — 通用类型、工具、常量
│   ├── schema/                 # @easyink/schema — Schema 类型、默认值、迁移、序列化、校验
│   ├── core/                   # @easyink/core — 命令、选择、几何、分页、字体、物料协议
│   ├── plugin-api/             # @easyink/plugin-api — 物料和扩展公共声明，UI 类型独立入口
│   ├── plugin-runtime/         # @easyink/plugin-runtime — 每 Host 声明事务、只读登记源和受管生命周期
│   ├── datasource/             # @easyink/datasource — 字段树、数据源引用、绑定格式模板
│   ├── viewer/                 # @easyink/viewer — ViewerRuntime、预览、打印、导出、缩略图
│   ├── export/
│   │   ├── runtime/            # @easyink/export-runtime — 导出任务状态机、插件注册（不绑定具体格式实现）
│   │   └── plugin/
│   │       └── dom-pdf/        # @easyink/export-plugin-dom-pdf — 浏览器 DOM 截图转 PDF 插件（html2canvas + jsPDF）
│   ├── print/
│   │   ├── core/              # @easyink/print-core — 打印驱动共享纯工具
│   │   ├── integration-easyink-printer/ # @easyink/print-integration-easyink-printer — EasyInk.Printer 客户端与 Viewer 驱动
│   │   └── integration-hiprint/         # @easyink/print-integration-hiprint — HiPrint 客户端与 Viewer 驱动
│   ├── builtin/                # @easyink/builtin — 内置完整物料集合与宿主隔离入口
│   ├── designer/               # @easyink/designer — 设计器工作台 Vue 组件
│   ├── locales/                # @easyink/locales — 设计器内置语言包
│   ├── prop-schemas/           # @easyink/prop-schemas — 内置物料基础属性 Schema
│   ├── ui/                     # @easyink/ui — 面板、表单、工作台基础组件
│   ├── icons/                  # @easyink/icons — 图标资产
│   ├── schema-tools/           # @easyink/schema-tools — Schema 校验、DataSource 对齐
│   ├── samples/                # @easyink/samples — 示例 schema、data 与 datasource
│   ├── assistant/              # @easyink/assistant-* — Assistant 平台包族
│   └── materials/
│       ├── text/
│       ├── image/
│       ├── barcode/
│       ├── qrcode/
│       ├── line/
│       ├── rect/
│       ├── ellipse/
│       ├── chart/
│       ├── table/
│       │   ├── data/          # @easyink/material-table-data — 动态数据表格物料
│       │   ├── static/        # @easyink/material-table-static — 静态单元格表格物料
│       │   └── kernel/        # @easyink/material-table-kernel — 表格共享几何、渲染、编辑与测量工具
│       └── svg/
├── playground/
```

## 3.1 包职责

### `@easyink/schema`

- 定义文档 Schema
- 提供默认值工厂、输入归一化、迁移器、兼容层
- 只关心模板模型，不关心运行时加载和 UI

### `@easyink/core`

- CommandManager、SelectionModel
- 历史（undo/redo）由 CommandManager 内部栈管理，无独立 HistoryModel
- 几何计算、辅助线、吸附、分页计划、区域模型

### `@easyink/plugin-api`

- `./material` 提供共享模型、binding、静态能力、condition/pageAware、locale 和 AI 声明。
- `./designer` 提供完整 Designer 物料、只读查询、受控编辑及参数/结果关联的命令；`./viewer` 提供同步 renderer、受管 loader 与可选会话实现声明。
- `./ui` 单独引用 Vue，声明物料目录、专属属性组件及独立工具栏、右键和弹层扩展。根、material、designer、viewer 入口不重导出 UI。
- 依赖 core/schema/shared 的领域协议及 datasource 描述类型，不依赖 Designer/Viewer 实现；底层包不反向依赖 plugin-api。
- 公共声明与消费夹具已落地，全部物料、Designer UI、Render Session 和实际宿主使用每实例 Host。

### `@easyink/plugin-runtime`

- 同步收集完整物料与扩展，按 Scope 暂存；最终组合通过才构建每 Host 的只读 registry，并等待核心消费者初始化后交付实例。
- 只由 runtime 写入登记源，重复身份或唯一 key 争用整体失败；登记异常被捕获仍不能提交，异步 setup 不受支持。
- locale 选择应用非空覆盖或稳定首值，保持整树语言 fallback；不同文本和无效叶子记录非阻断诊断。
- Scope 及任务资源按实例归属；destroy 同步失效，先停消费者再逆序释放，汇总清理错误并复用完成 Promise，迟到资源自清理。
- 只依赖 plugin-api，无 Vue 或 Designer/Viewer 实现；ViewerRuntime 与 DesignerStore.create 每实例拥有独立 Host，Store 不再维护物料/locale 写入注册表。Vue 组件内部等待 Promise 创建，失败反馈并清理卸载后迟到实例；旧 Contribution registry 与完整 Store 注入已删除。

### `@easyink/builtin`

- 聚合完整物料：根/all/basic 导出 Designer `materials`，all/viewer 与 basic/viewer 导出纯 Viewer `materials`，none 导出两端可用的空集合
- 应用在创建前选择集合；底层 Designer/Viewer 不自动导入 builtin，产品层显式选择 all
- 旧 bundle 输出尚未删除，但未接入新 Host；成员清单生成统一与完整业务对照在后续物料 Gate 验收

### `@easyink/datasource`

- 只处理数据源描述、字段树、命名空间、绑定格式模板和规范化
- 不依赖 `@easyink/viewer`

### `@easyink/viewer`
- 独立 Viewer 运行时
- 负责预览、缩略图、打印、导出文档入口
- 负责数据绑定投影、字体加载、页面计划与最终页面渲染
- 通过 `ViewerExporter` / `PrintDriver` 承接外部导出和打印运行时；打印驱动由 `driverId` 显式选择，未指定时回退浏览器打印
- Promise 创建前选择完整物料，产品层显式选择 all，底层仅消费所传集合；省略或空数组为 none；活动后不能增删或覆盖物料，destroy 返回同一 Promise 与清理结果

### `@easyink/export-runtime`

- 框架无关的导出运行时内核
- 只提供 `createExportRuntime()`、plugin registry、`ExportDispatchState` 状态机、进度与诊断回调
- 不绑定任何具体导出格式；不依赖 `html2canvas` / `jspdf` 等第三方实现

### `@easyink/export-plugin-dom-pdf`

- 内置默认 PDF 导出插件：浏览器 DOM 截图（`html2canvas`） + `jsPDF` 组装
- 暴露 `createDomPdfExportPlugin()` 与 `renderPagesToPdfBlob()` 两个入口
- `html2canvas` / `jspdf` 通过动态 `import()` 按需装载，不进入 runtime / core / schema
- 资源加载失败默认产生 warning 诊断并继续导出，避免静默吞掉问题
- 后续其他 PDF 链路（服务端渲染、矢量导出等）应作为同级独立 plugin 包发布，不再回灌到 runtime

### `@easyink/print-core`

- 打印驱动共享纯工具层，不绑定具体打印服务或 UI 框架
- 提供 Viewer 页面提取、打印尺寸解析、单位转换、方向/偏移解析和诊断桥接
- 被官方打印驱动包消费，宿主通常不直接依赖

### `@easyink/print-integration-easyink-printer`

- EasyInk.Printer 官方前端客户端和 Viewer PrintDriver
- 封装 HTTP/WebSocket、PDF 分块上传、任务查询、默认打印机选择和 Viewer DOM 转 PDF
- 驱动默认 `pageSizeMode: 'fixed'`

### `@easyink/print-integration-hiprint`

- HiPrint 官方前端客户端和 Viewer PrintDriver
- 封装 electron-hiprint 连接、打印机发现、逐页 HTML 打印和按设备开启的 `pageSize` 策略
- 驱动默认 `pageSizeMode: 'driver'`

### `@easyink/designer`

- 顶部工具栏、画布、面板系统、概览图、历史记录
- 管理设计态工作台状态
- 应用通过插槽和 `useDesignerStore()` 接入工作台；物料/独立扩展创建前传完整声明，扩展仅取得受控 context，不再使用 `setupStore` 或旧 Contribution activate。Designer 不在包级直接依赖 `@easyink/viewer`。
- 应用创建前显式选择完整物料，产品默认选择 builtin all；底层省略或空数组为 none，重复物料身份失败，不按顺序覆盖
- 依赖 `@easyink/locales` 和 `@easyink/prop-schemas` 获取内置语言包与基础属性 Schema；对外仍通过 `@easyink/designer/locale` 透出语言包
- 独立 UI/命令使用 plugin-api 的 `DesignerExtension` 声明和受控 context；旧 Contribution API 已删除，不直接依赖 Assistant 集成包或 `@easyink/schema-tools`
- 对外发布时保持 `vue` 为 peerDependencies，避免宿主拿到重复 Vue runtime；`codemirror` 属于 designer 自身运行时组成部分，必须作为 dependencies 随包安装，保证开箱即用

### `@easyink/locales`

- 维护设计器内置 `zhCN` / `enUS` 语言包与 `LocaleMessages` 类型
- 作为静态资源包被 `@easyink/designer` 消费；宿主应用推荐继续从 `@easyink/designer/locale` 引入，避免把资源包路径变成应用层长期合同
- 翻译新增、改文案、补 locale key 通常只影响该包，不应被误判为 Designer 工作台行为变更

### `@easyink/prop-schemas`

- 维护内置物料的基础属性面板 Schema，例如 text / image / barcode / qrcode / table / flow-row 等公共字段矩阵
- 只依赖 `@easyink/core` 的 `PropSchema` 类型，不反向依赖 `@easyink/designer`
- 物料包仍可通过自身 `propSchemas` 提供 material-owned 追加项；Designer 注册时先取基础 Schema，再合并物料包追加 Schema
- 属性字段、分组、枚举、显示条件等维护通常只影响该包；只有属性面板协议、Store、提交行为或画布交互变化才属于 Designer 核心层变化

### `@easyink/material-*`

- 每种物料一个独立包
- 包内同时提供 Schema 默认值、属性描述、Designer 交互、Viewer 渲染器
- 先服务内置体系，第三方开放后再稳定契约

### `@easyink/schema-tools`

- Schema 三层校验器（structure / semantic / binding），`validate()` 无副作用，`autoFix()` 操作 deep clone
- DataSource 字段对齐工具，支持模糊匹配
- 无 Vue 依赖，可被 Assistant capabilities、orchestrator 和批处理脚本消费
- 依赖 `datasource`、`schema`、`shared`

## 3.2 物料包内部结构

以 `@easyink/material-table-data` 为例：

```
packages/materials/table/data/
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
shared          icons
  ↑               ↑
schema            ui ─── icons + shared
  ↑
core        datasource
  ↑           ↑
  ├── viewer ─┘           samples ─── datasource + schema + shared
  │
material-* ── core + schema + shared (+ datasource 按需)
  ↑
builtin ───── material-* + plugin-api (+ core/schema/shared)

plugin-api ─── core + datasource + schema + shared (Vue 类型仅 ui 子入口)
plugin-runtime ─── plugin-api
designer ─── plugin-api + plugin-runtime + core + datasource + schema + shared + ui + icons + locales + prop-schemas
locales ─── (no runtime deps)
prop-schemas ─── core
viewer ─── plugin-api + plugin-runtime + core + schema + shared
export-runtime ─── shared
export-plugin-dom-pdf ─── export-runtime + shared + html2canvas + jspdf
print-core ─── viewer + export-runtime
print-integration-easyink-printer ─── print-core + viewer + export-plugin-dom-pdf
print-integration-hiprint ─── print-core + viewer + vue-plugin-hiprint

assistant-* ── 多个 assistant 包彼此依赖，形成独立 Assistant 平台子图

playground ── designer + viewer + export-runtime + samples + schema
```

依赖原则：

- `designer` 依赖 `plugin-api`、`plugin-runtime`、`core`、`datasource`、`schema`、`shared`、`ui`、`icons`、`locales` 与 `prop-schemas`；仅测试 fixture 通过 devDependencies 选择 builtin 和单物料，不形成宿主运行依赖
- `locales` 与 `prop-schemas` 是 Designer 静态资源边界包：前者维护内置语言包，后者维护基础属性 Schema。它们可独立构建、测试和发布，但应用层稳定入口仍优先使用 `@easyink/designer` 及其 `./locale` facade
- 已被 designer 内部直接使用且宿主不应手动补齐的第三方运行时依赖（如 `codemirror`）必须声明为 `dependencies`；只有需要与宿主单例对齐的框架依赖（当前为 `vue`）才保留为 `peerDependencies`
- `viewer` 依赖 `plugin-api`、`plugin-runtime`、`core`、`schema`、`shared`；所选完整物料创建前传入，不提供创建后 `registerMaterial`。`viewer` 无 datasource 运行依赖
- `export-runtime` 仅依赖 `shared`，不绑定任何导出格式实现，不依赖 `viewer`、`designer` 或 Vue
- `export-plugin-dom-pdf` 依赖 `export-runtime`、`shared` 与按需装载的 `html2canvas` / `jspdf`；任何具体导出链路一律走独立 plugin 包，不再回灌到 runtime
- `print-core` 只承接打印驱动共享逻辑；具体打印通道放在 `packages/print/*` 下独立包中
- `print-integration-easyink-printer` 依赖 `print-core`、`viewer` 与 `export-plugin-dom-pdf`；负责 EasyInk.Printer 通道的协议和 Viewer 驱动
- `print-integration-hiprint` 依赖 `print-core`、`viewer` 与 `vue-plugin-hiprint`；负责 HiPrint 通道的协议和 Viewer 驱动
- `builtin` 依赖全部内置 `material-*` 包，集中维护 Designer / Viewer / Assistant 三侧共享的默认物料清单
- `ui` 依赖 `icons` 和 `shared`，不依赖 `designer`；方向为 designer 依赖 ui
- `samples` 依赖 `datasource`、`schema`、`shared`，不依赖 `designer`
- `schema-tools` 仅依赖 `datasource`、`schema`、`shared`；无 Vue 依赖；可在 Node 与浏览器双端运行
- `assistant-*` 形成独立平台子图，通过 DesignerExtension 与 typed commands 接入 Designer，核心 Designer / Viewer 不反向依赖 Assistant 包

## 3.4 对外消费方式

```typescript
import { EasyInkDesigner } from '@easyink/designer'
import { createViewer } from '@easyink/viewer'
import { materials as designerMaterials } from '@easyink/builtin/all'
import { materials as viewerMaterials } from '@easyink/builtin/all/viewer'

// Vue template
// <EasyInkDesigner v-model:schema="schema" :materials="designerMaterials" />

const viewer = await createViewer({ mode: 'fixed', materials: viewerMaterials })
await viewer.open({ schema, data })
await viewer.destroy()
```

公开入口的目标是两个：

- 宿主可单独使用 `viewer`
- 宿主可直接挂载 `designer`，再按需引入 `viewer` 组成预览/打印工作流
