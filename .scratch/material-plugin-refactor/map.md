# EasyInk 物料能力装配层重构地图

Labels: wayfinder:map
Status: resolved
Updated: 2026-10-13

## Destination

在保持现有文档 Schema、编解码、迁移和正常渲染语义不变的前提下，形成可交给开发实施的物料能力装配层架构路线：完整物料集中维护能力，框架内部明确模型、Designer/Viewer renderer、UI 与 AI 的分工、组合和验证。实现目的为完整重构后统一交付 0.1.0，删除旧装配 API；地图负责决策和实施门禁，不直接交付重构代码。

## Notes

- 当前为**完整重构和 0.1.0 候选的实际实现验收已完成，交用户手动发布**。67 个公共包、隔离 tarball 消费、浏览器、Go/Android、资源与正式文档证据见[最终交接](./implementation/G6.md)。全部 Gate 的正式检查/新鲜度与最终通过状态以 runbook 为准；尚未执行发布。
- 已确认要求：Schema 不动；只重构其上的能力装配层；插件只贡献能力；本地图自包含；实现分阶段但不发布中间态。
- 用户侧保留现有 all/basic 组合导出，默认 all，可按完整物料导出自行组合，不改成物料名称列表；物料维护者集中定义能力，由框架装配，不把内部能力拆分变成用户的插件拼装负担。
- 用户于 2026-10-10 明确改为：不保留旧 API、不做兼容层；完整重构和全量验收后手动发布 0.1.0，不继续以 0.0.x 发布本次重构。
- 首版保证安装失败回滚、宿主销毁清理、会话代次和输出资源所有权；运行中替换后置；更换集合通过销毁并重建 Host。
- 阶段顺序、契约落点、删除清单、0.1.0 交接见[物料能力装配层交付路线](./roadmap.md)。维护规则见[地图维护与交接约定](./tracker.md)。
- 执行合同见 [Implementation Plan](./implementation-plan.md)，按 G0–G6 线性推进；当前进度见 [Goal Runbook](./goal/runbook.md)，后续每轮使用[固定接续提示词](./goal/prompt.md)。G0–G5 已通过；G6 最终候选与交接已验收，正式 Gate 收口由控制器完成。
- 只有已确认且 resolved 的 Answer 是有效决议；open/claimed 票中的补充设计为候选方案，保留其中已明确确认的约束。审查发现及处置见[架构完备性审查](./architecture-audit.md)。
- 后续工作遵循[领域术语](../../GLOSSARY.md)、wayfinder/domain-modeling/codebase-design 的边界与所有权原则；[正式架构文档](../../.github/architecture/README.md)只描述已落地代码，实现每推进一阶段同步更新。
- 研究基线：`0b43cb752ddd13b1802bbbb0d3b2993a3a8fd3be`；审查基线：`042619cd952c9c32ffe66dab874193b7c99e27d6`。

## Decisions so far

- [当前物料装配、UI 扩展与包依赖的真实边界](./issues/01-current-assembly.md)：两端已脱离具体物料依赖；重构重点是单一能力来源和完整资源所有权。
- [Schema 保持不变时的渲染状态与未知物料约束](./issues/02-rendering-schema.md)：保持 codec 与渲染语义，运行状态留在宿主/会话，未知节点保留并可见诊断。
- [deepseek-harness 的可借鉴机制与适用限制](./issues/03-harness-reference.md)：借鉴贡献者/消费者分离、受管清理和独立 UI Slot；不照搬其包安装语义。
- [确定能力契约、宿主裁剪与包依赖方向](./issues/04-contract-boundaries.md)：完整物料与 all/basic 集合、Viewer 专用入口、直接受控上下文和每实例唯一装配内核。
- [确定插件安装事务、所有权与清理语义](./issues/05-host-lifecycle.md)：核心启动失败整体回滚、翻译问题非阻断、可等待清理与实例资源隔离，首版不提供插件依赖排序配置。
- [确定物料能力的单一来源与 builtin 组合职责](./issues/06-material-contributions.md)：完整物料统一维护共享模型、宿主 renderer、目录、文案和 AI；单物料与 all/basic 使用宿主隔离出口。
- [确定 UI Slot、宿主服务与旧 Contribution 的迁移边界](./issues/07-ui-slots.md)：五类 Designer UI 消费、直接回调与 context prop、局部故障隔离；保留应用预览壳层，取消无消费者的通用插槽。
- [确定 Render Session 与复杂物料状态传递协议](./issues/08-render-session.md)：按轮快照和最后提交、局部物料占位、可选会话状态、资源就绪与不写入 Schema 的片段运行引用。
- [确定 0.1.0 破坏性切换、旧 API 删除与手动发布边界](./issues/09-compatibility-cutover.md)：全消费者直接切换完整物料入口，保留非装配能力；公共 npm 包统一 0.1.0，候选制品验收后交用户手动发布。
- [确定验收门禁、发布标准与持续文档归属](./issues/10-quality-documentation.md)：四层门禁、真实宿主与候选包验证、文档单一权威；本次暂不建立性能基线，出现可复现回归时再针对性补测；未验证发布必需项不能交接可发布状态。

## Not yet specified

当前没有额外尚无法准确描述的决策问题。实现与候选验收已落地，下一步由用户核对交接并手动发布；性能基线暂不属于前置工作，实施中若出现可复现性能回归再补测。若改变公共契约、所有权、失败语义、资源寿命或发布策略，必须重开对应决议。

## Out of scope

- 首版新增 Viewer UI 包、UI adapter 或通用 viewer.overlay 扩展点；[UI 范围决议](./issues/07-ui-slots.md#已确认viewer-保留应用预览壳层)确认保留应用预览壳层。
- 首版新增整个属性面板的通用前后插槽；[属性面板范围决议](./issues/07-ui-slots.md#已确认不新增属性面板通用前后插槽)保留物料专属界面和现有编辑会话能力。
- 修改文档 Schema、codec、migration 或把插件身份写入文档。
- 自动 commit、release、publish、tag 或 push；实际发布由用户执行。
- 编辑/渲染过程中任意安装、卸载、替换、自动依赖重启或 HMR；插件集合变更通过销毁并重建 Host。
- 包市场、远程安装、权限沙箱、动态代码执行、完整照搬 Cordis/Harness loader。
- 借机重做表格布局、通用嵌套渲染、整个工作台停靠系统、AI 编排、数据源或打印/导出插件平台。已有子系统只迁移必要装配点。
- 修复与装配无关的历史 codec 损失或改变模板默认值；研究发现单独记录。
