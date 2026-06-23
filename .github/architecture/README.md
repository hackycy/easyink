# EasyInk Architecture

> 对标通用文档/报表设计器的前端设计器框架 -- 基于 Vue 3 + TypeScript + pnpm monorepo

当前统一基线：

- `designer` 是完整工作台，不只是画布组件
- `designer` 采用顶层双栏 + 画布内窗口系统 + 独立状态栏
- `viewer` 是独立运行时，可被设计器通过 iframe 嵌入，也可被宿主独立使用
- Schema 区分"EasyInk 内部规范模型"和"对标产品兼容输入"，避免把历史原始 JSON 噪音扩散到内部实现
- 页面模型覆盖 `mode / width / height / pages / scale / radius / offsetX / offsetY / copies / blankPolicy / grid / font / background / print / pageModel / layout / pagination / reflow`，并兼容 benchmark 输入里的 `viewer / xOffset / yOffset / blank`
- 数据源协议覆盖 `id / name / tag / title / icon / expand / headless / fields / use / props / format / displayFormat / union / bindIndex / meta`，字段节点可声明 `format / displayFormat`
- 数据绑定分为普通 `BindingRef` 和物料级 `data-contract`：普通元素消费字段路径，图表等结构化物料声明目标数据模型，binding 只保存 source path 到目标字段的映射，关系由 Resolver 推导
- 条件渲染由物料显式注册能力，Schema 以组内 AND、组间 OR 的条件组保存规则，Viewer 在绑定、测量、布局与分页前生成派生运行时 Schema
- 顶部物料栏建模为"高频直达物料 + 分组目录物料"的混合入口
- `table`、`chart`、`svg` 都是一级结构系统
- 属性面板在同一窗口壳层中互斥展示"元素属性"与"页面属性"，支持 PropertyPanelOverlay 动态叠加层
- 画布中的每个物料必须根据 props 展示近似真实的视觉效果（设计态渲染）
- 设计态渲染（`MaterialDesignerExtension.renderContent`）与 Viewer 渲染（`MaterialViewerExtension.render / measure / getRenderSize / fragmentPaginator`）是两套独立实现
- 页面属性面板区分"规范字段 / benchmark 兼容字段 / 派生 UI 字段"
- 工作台状态、模板状态、运行时状态明确分层
- `viewer` 的 `exportDocument()` 走 `ViewerExporter` 注册表，独立 `@easyink/export-runtime` 负责格式插件运行时；第三方导出依赖通过对应插件或导出器按需装载
- 物料通过 `DatasourceDropHandler` 协议自定义拖拽绑定行为
- 设计器坐标术语统一为 `screen / document / local / viewport`，其中 `document` 是 Schema 单位坐标；交互层坐标换算统一经由 GeometryService
- 破坏性用户确认通过 `DesignerInteractionProvider` 交给宿主接管，designer 内部功能与 Contribution 统一走 `DesignerInteractionService`

## 目录

| # | 文档 | 说明 |
|---|------|------|
| 1 | [项目概览](./01-overview.md) | 设计原则、职责边界、技术栈 |
| 2 | [核心场景](./02-core-scenarios.md) | 适用/不适用场景 |
| 3 | [Monorepo 包结构](./03-monorepo-structure.md) | 包拆分、依赖关系、消费方式 |
| 4 | [分层架构](./04-layered-architecture.md) | 四层架构图、API 暴露风格 |
| 5 | [Schema DSL 设计](./05-schema-dsl.md) | 规范模型、兼容编解码、页面字段、结构物料与绑定 |
| 6 | [渲染管线](./06-render-pipeline.md) | 统一 DOM 渲染、溢出诊断、输出边界 |
| 7 | [布局引擎](./07-layout-engine.md) | 坐标推移布局模型、计算流程 |
| 8 | [数据源系统](./08-datasource.md) | 字段树协议、推荐物料、union、bindIndex、显示格式模板、Provider Factory、MCP 集成 |
| 9 | [内部扩展机制](./09-plugin-system.md) | 仓库内扩展点、上下文 API、钩子体系 |
| 10 | [设计器交互层](./10-designer-interaction.md) | 工作台布局、工具组带、窗口系统、结构树、属性壳层、PropertyPanelOverlay、sectionFilter |
| 11 | [物料体系](./11-element-system.md) | 物料目录、属性矩阵、Designer/Viewer 合约、DatasourceDropHandler 协议、分阶段交付 |
| 12 | [Command 与撤销/重做](./12-command-undo-redo.md) | Command 模式、命令管理器、内置命令 |
| 13 | [单位系统](./13-unit-system.md) | 单位存储、转换、渲染时转换公式 |
| 14 | [字体管理](./14-font-management.md) | FontProvider 接口、FontManager |
| 15 | [输出链路边界](./15-pdf-pipeline.md) | 打印/导出边界、运行时依赖、宿主适配方式 |
| 16 | [国际化](./16-i18n.md) | 外部化 + 默认中文 |
| 17 | [Schema 版本迁移](./17-schema-migration.md) | SemVer 语义、迁移注册表 |
| 18 | [构建与产物](./18-build-artifacts.md) | 构建工具链、产物格式、导出配置 |
| 19 | [测试策略](./19-testing.md) | 单元测试、E2E 测试 |
| 20 | [性能策略](./20-performance.md) | 架构层预留、性能目标 |
| 21 | [安全模型](./21-security.md) | 数据路径安全、富文本安全、渲染安全 |
| 22 | [编辑行为架构](./22-editing-behavior.md) | EditingSession、类型化 Selection、Geometry 协议、Behavior 中间件、Surfaces 与 Transaction |
| 23 | [Contribution 机制](./23-contribution.md) | ContributionRegistry、注入方式、响应式 Props、生命周期、命名空间 |
| 24 | [页面布局正交体系](./24-page-layout-orthogonal-system.md) | 页面模型、布局策略、分页策略、测量重排引擎四层解耦 |
| 25 | [AI Assistant 平台](./25-ai-assistant.md) | 物料知识声明、数据流链路、Orchestrator 工作流、ComposerAgent、知识与推理层 |
| 26 | [条件渲染系统](./26-conditional-rendering.md) | 组内 AND、组间 OR 的条件组、Dialog 编辑协议、集合判断与 Viewer 布局语义 |

## 补充说明

- EasyInk 当前优先对齐 `fixed-page` 文档/报表场景，并保留连续流式页面架构
- 设计器中的工作台布局、面板开关、激活面板和工具组带布局属于工作台状态，不进入 Schema
- 预览器独立完成字体加载、数据加载、分页、缩略图、打印和导出适配器加载，不复用画布 DOM
- 数据绑定保存数据源引用、字段路径、显示格式和多参数绑定位次；`data-contract` 物料额外保存目标字段映射。字段可提供自有显示格式模板，Designer 只在创建或编辑该字段的绑定格式时采用
- 表格类和容器类物料拥有独立内部模型
- 样例资产既用于演示，也可作为回归测试资产库
- 未识别物料、缺失数据、缺失字体、渲染失败都必须以可见诊断暴露，不允许静默吞掉
- 对标产品的原始 JSON 字段命名存在历史噪音，EasyInk 提供无损兼容编解码层
- `DocumentSchema.unit`、纸张预设、页面类型显示名称这类信息在属性面板中可见，但不固化进 `page` 规范字段
- `@easyink/assistant-*` 是当前仓库中的 Assistant 平台包族，通过 Contribution 机制接入 Designer
- 数据源系统支持运行时动态注册；核心设计器/Viewer 数据流不依赖具体 Assistant 实现

## 快速导航

- **想了解项目定位?** -> [01-overview](./01-overview.md) + [02-core-scenarios](./02-core-scenarios.md)
- **想了解代码结构?** -> [03-monorepo-structure](./03-monorepo-structure.md) + [04-layered-architecture](./04-layered-architecture.md)
- **想了解模板模型?** -> [05-schema-dsl](./05-schema-dsl.md) + [08-datasource](./08-datasource.md)
- **想了解预览与分页?** -> [06-render-pipeline](./06-render-pipeline.md) + [07-layout-engine](./07-layout-engine.md) + [24-page-layout-orthogonal-system](./24-page-layout-orthogonal-system.md)
- **想了解条件渲染?** -> [26-conditional-rendering](./26-conditional-rendering.md)
- **想了解设计器工作台?** -> [10-designer-interaction](./10-designer-interaction.md)
- **想了解物料体系?** -> [11-element-system](./11-element-system.md)
- **想了解命令与历史?** -> [12-command-undo-redo](./12-command-undo-redo.md)
- **想了解 Contribution 机制?** -> [23-contribution](./23-contribution.md)
- **想了解 AI Agent 平台?** -> [25-ai-assistant](./25-ai-assistant.md)
