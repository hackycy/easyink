# EasyInk Architecture

> 对标通用文档/报表设计器的前端设计器框架 -- 基于 Vue 3 + TypeScript + pnpm monorepo

本目录记录 2026-04-03 基线重构后的 EasyInk 架构。经过对 `report-designer` 的深度实测，EasyInk 的方向从“极简打印模板库”调整为“通用文档/报表设计器框架”，首要目标是把设计器工作台、预览器、数据源系统和表格能力搭稳。

当前架构基线：

- `designer` 是完整工作台，不只是画布组件
- `designer` 采用顶层双栏 + 画布内窗口系统，而不是固定三栏布局
- `viewer` 是独立运行时，可被设计器通过 iframe 嵌入，也可被宿主独立使用
- Schema 是文档模型，覆盖页面、辅助线、元素、绑定、动画和分页语义
- 数据源系统同时服务字段树展示、绑定、格式规则和批量投放元数据
- data-table、container、chart、svg、relation 是一级物料类别
- 模板库是覆盖式工作台能力，第二层工具栏是可配置工具组带
- 工作台状态、模板状态、运行时状态明确分层，避免混写

## 目录

| # | 文档 | 说明 |
|---|------|------|
| 0 | [对标产品分析](./00-benchmark-report-designer.md) | report-designer 实测结论与约束输入 |
| 1 | [项目概览](./01-overview.md) | 设计原则、职责边界、技术栈 |
| 2 | [核心场景](./02-core-scenarios.md) | 适用/不适用场景 |
| 3 | [Monorepo 包结构](./03-monorepo-structure.md) | 包拆分、依赖关系、消费方式 |
| 4 | [分层架构](./04-layered-architecture.md) | 四层架构图、API 暴露风格 |
| 5 | [Schema DSL 设计](./05-schema-dsl.md) | 顶层结构、页面设置、物料节点、数据绑定 |
| 6 | [渲染管线](./06-render-pipeline.md) | 统一 DOM 渲染、溢出诊断、输出边界 |
| 7 | [布局引擎](./07-layout-engine.md) | 坐标推移布局模型、计算流程 |
| 8 | [数据源系统](./08-datasource.md) | 开发方注册、字段树、运行时数据契约 |
| 9 | [内部扩展机制](./09-plugin-system.md) | 仓库内扩展点、上下文 API、钩子体系 |
| 10 | [设计器交互层](./10-designer-interaction.md) | 工作台布局、窗口系统、画布预览、属性编辑 |
| 11 | [物料体系](./11-element-system.md) | 物料类型定义、PropSchema、交互策略、内置物料 |
| 12 | [Command 与撤销/重做](./12-command-undo-redo.md) | Command 模式、命令管理器、内置命令 |
| 13 | [单位系统](./13-unit-system.md) | 单位存储、转换、渲染时转换公式 |
| 14 | [字体管理](./14-font-management.md) | FontProvider 接口、FontManager |
| 15 | [输出链路边界](./15-pdf-pipeline.md) | DOM 输出职责、外部打印/PDF/image 扩展边界 |
| 16 | [国际化](./16-i18n.md) | 外部化 + 默认中文 |
| 17 | [Schema 版本迁移](./17-schema-migration.md) | SemVer 语义、迁移注册表 |
| 18 | [构建与产物](./18-build-artifacts.md) | 构建工具链、产物格式、导出配置 |
| 19 | [测试策略](./19-testing.md) | 单元测试、E2E 测试 |
| 20 | [性能策略](./20-performance.md) | 架构层预留、性能目标 |
| 21 | [安全模型](./21-security.md) | 数据路径安全、富文本安全、渲染安全 |
| 22 | [关键设计决策记录](./22-design-decisions.md) | 当前统一 ADR 基线与已废弃前提 |

## 补充说明

- EasyInk 当前优先对齐 `fixed-page` 文档/报表场景，连续流式和标签模式保留在同一架构内扩展
- 设计器中的工作台布局、面板开关、激活面板、模板库状态属于工作台状态，不进入 Schema
- 预览器会独立完成字体加载、数据加载、分页、缩略图和打印导出，不复用画布 DOM
- 数据绑定不再只记录裸路径；模板中应保存数据源引用、字段路径和格式规则元数据
- 表格类物料拥有独立内部模型，不按“普通矩形元素 + 文本子元素”处理
- 样例模板库是产品能力的一部分，同时也是回归测试资产库
- 未识别物料、缺失数据、缺失字体、渲染失败都必须以可见诊断暴露，不允许静默吞掉

## 快速导航

- **想先看为什么重构?** -> [00-benchmark-report-designer](./00-benchmark-report-designer.md)
- **想了解项目定位?** -> [01-overview](./01-overview.md) + [02-core-scenarios](./02-core-scenarios.md)
- **想了解代码结构?** -> [03-monorepo-structure](./03-monorepo-structure.md) + [04-layered-architecture](./04-layered-architecture.md)
- **想了解模板模型?** -> [05-schema-dsl](./05-schema-dsl.md) + [08-datasource](./08-datasource.md)
- **想了解预览与分页?** -> [06-render-pipeline](./06-render-pipeline.md) + [07-layout-engine](./07-layout-engine.md)
- **想了解设计器工作台?** -> [10-designer-interaction](./10-designer-interaction.md)
- **想了解物料体系?** -> [11-element-system](./11-element-system.md)
- **想了解命令与历史?** -> [12-command-undo-redo](./12-command-undo-redo.md)
- **想了解关键取舍?** -> [22-design-decisions](./22-design-decisions.md)
