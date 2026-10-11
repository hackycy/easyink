# 物料重构路线的代码架构完备性审查

审查日期：2026-10-10。审查对象：[重构地图](./map.md)、交付路线、决策票据及对应源码。
当前源码：`042619cd952c9c32ffe66dab874193b7c99e27d6`。与地图研究基线相比，本次核对的 core、designer、viewer、builtin、materials 和 internal viewer runtime 目录没有提交差异。

## 本次补齐的处置索引

2026-10-10 用户要求补齐本报告，并明确以完整重构后手动发布 0.1.0 取代渐进兼容。2026-10-11 更新：架构、切换和质量/文档决议已经逐票讨论并确认。下方保留补齐前的审查快照，不能作为当前实施指令。应用实现和测试仍未执行。

| 原发现 | 有效决议所在票据 |
| --- | --- |
| 事务冲突与校验时机 | [安装事务、核心冲突与失败状态](./issues/05-host-lifecycle.md#事务与冲突) |
| condition/pageAware 唯一来源 | [逐字段 owner 与消费矩阵](./issues/06-material-contributions.md#逐字段-owner-与消费矩阵) |
| 会话/片段状态与清理接口 | [Render Session 最终决议](./issues/08-render-session.md#本票最终决议)、[资源与提交屏障](./issues/08-render-session.md#资源与提交屏障) |
| 旧入口与启动事务衔接 | [破坏性切换](./issues/09-compatibility-cutover.md#answer)：取消旧入口及桥接设计，统一新启动流程 |
| 最小类型/exports/UI 宿主 | [契约与入口](./issues/04-contract-boundaries.md#answer)、[UI 契约与实际消费者](./issues/07-ui-slots.md#answer) |
| locale 同级冲突 | [locale 的确定规则](./issues/05-host-lifecycle.md#locale-的确定规则) |

实现阶段按[防止实施偏移](./roadmap.md#防止实施偏移)逐项提供“决议 → 文件/导出 → 验证证据”。本报告只索引发现及处置位置；确认情况以票据状态和讨论记录为准，规划决议不能代替实现证据。

### 2026-10-11 路线收口复核

十张票据均已 resolved，无未决票或未定义事项。已核对完整物料/集合出口、依赖方向、字段归属、启动与分级故障、UI 消费范围、会话/片段/输出寿命、全宿主切换与手动发布门禁；清除上游仍称下游未决的过时提示。路线中“所选物料缺核心能力也占位继续”的歧义已按有效决议修正：配置缺陷导致创建失败，文档未知物料和可隔离运行故障才降级。

`check-map.mjs validate`：19 份文档、10 张已决票、0 张 open、0 张 claimed、0 个错误；前沿为空。此结果仅为路线结构/链接及本次文本复核证据，不是应用测试结果。下一步按交付路线进入阶段零：冻结源码与行为夹具，形成旧 API 删除与实际消费者清单；性能基线暂不作为前置条件，真实实现、包消费和多平台验收仍待执行。

## 补齐前的结论（历史快照）

**架构方向已经决策，但尚未达到“实施者无需再选择关键架构”的完备程度。** 地图的十张票据均为 resolved，结构校验通过；仍存在决议内部矛盾、跨票据衔接缺口，以及尚未固定到代码契约的关键选择。不能仅凭 closed/resolved 状态把整条路线视为已经完成代码架构冻结。

本次是审查，不重新代替用户作设计决定，不修改原票据状态或应用代码。以下建议尚未成为最终决议；处理时应回填所属票据的 Answer，避免让本报告成为第二份架构规范。

## 已经明确、应继续遵守的方向

- Schema、codec、migration 与节点工厂语义保持不变，插件身份不进入持久化节点。
- plugin-api / plugin-runtime 分包；schema / core 不反向依赖插件层；新插件上下文不暴露完整 Store。
- 模型、两端 renderer、palette、properties、locale、AI 独立贡献，builtin 只负责组合。
- Designer / Viewer 入口隔离，Viewer renderer 不强制引入 Vue 或 Designer / Assistant UI。
- 安装事务、owner token、代次失效、逆序清理；首版切换集合通过重建 Host。
- 使用会话绑定的原 renderer 协议适配器，渐进迁移且保持唯一权威存储。

不需要在实现前冻结每个私有函数名或目录名。需要冻结的是公共 Interface、能力归属、状态转换、跨模块数据通路和失败行为。

## 实施前需要补齐的事项

### 1. 高优先级：安装事务的失败判据自相矛盾

[确定插件安装事务、所有权与清理语义](./issues/05-host-lifecycle.md#answer) 的“安装与发布”规定任何注册失败都回滚整个安装事务；“失败状态验收”却规定“同一 Scope 第二次注册相同 key”后“第一次 owner 保持有效”。同一 Scope 尚在暂存中的首次贡献，与另一个已激活 Scope 的贡献，不能使用同一条验收规则。

这会直接让实现者分别写出“第二次失败但第一次提交”或“整个插件失败”两种行为；插件捕获注册异常后继续执行 setup 时，是否仍可提交也未明确。

补齐要求：分别规定同事务重复、跨 owner 重复、setup 捕获注册异常三个场景。建议同事务冲突使本次事务不可提交；跨 Scope 冲突保留既有有效 owner、回滚新安装。该建议需要写入原决议后才能作为验收。

此外，“每个插件发布前检查必需能力”需要区分插件依赖和最终宿主能力检查：若模型与 renderer 由不同插件提供，最终能力组合何时校验、可选插件被必需插件依赖时如何处理，必须有确定结果。

### 2. 高优先级：condition / pageAware 仍未逐字段指定唯一 owner

[确定物料能力的单一来源与 builtin 组合职责](./issues/06-material-contributions.md#answer) 同时把 condition 列入模型语义和 Viewer renderer contribution；最终表述仍是“Viewer renderer / material model 的明确贡献”，没有分别指定两个字段的归属与覆盖规则。

源码当前确有两端表达：[Designer MaterialDefinition / MaterialCapabilities](../../packages/designer/src/types.ts) 包含 condition 与 pageAware，[Viewer registry](../../packages/viewer/src/material-registry.ts) 从 renderer 读取它们。仅规定“不可有漂移副本”无法指导拆分。

具体歧义：同一模型换一个 Viewer renderer 后，条件能力和逐页复制行为是否允许变化？只安装模型的 Designer 从哪里取得这些能力？renderer 与模型声明不同值时是失败、覆盖还是忽略？

补齐要求：逐字段列出唯一领域定义、运行态承载位置、两端投影方式、默认值及冲突处理；形成“旧字段 → 新贡献字段 → 消费者”的完整表。物料包是来源，不等于包内每种 contribution 的职责已经确定。

### 3. 高优先级：Render Session 的状态通路与输出清理入口未封口

[确定 Render Session 与复杂物料状态传递协议](./issues/08-render-session.md#本票最终决议) 已确定会话状态通过可选 factory、RuntimeRef 和非持久化 LayoutFragment/page item 进入 Viewer 运行管线；具体字段拼写留给实现。

源码约束：

- [现有 renderer 协议](../../packages/core/src/material-viewer.ts) 的 measure / render / fragmentPaginator 参数没有会话状态接口；ViewerRenderOutput 也没有资源 disposer。
- [table-data renderer](../../packages/materials/table/data/src/viewer.ts) 的 measure、paginate、render 通过模块级 runtimeLayoutCache 传递行状态；仅在 Viewer 外围增加一个 Session Map 无法移除这条内部依赖。
- [Viewer 的 toPagePlan](../../packages/viewer/src/runtime.ts) 将 fragment 转成 fragment.node；只挂在 fragment 上的状态不会自动进入最终 render。

补齐要求：选择并画出物料包创建会话适配器、宿主获得原协议实例、运行实例绑定、源节点到各 fragment、fragment 到最终 page element 的完整通路；明确状态与 resolved props 的继承位置。必须给出至少一个 table-data 契约示例，证明不需要修改 Schema 或在 Viewer 中增加 table 专用分支。

同时固定 prepare 的位置、同步性、异常处理，以及临时计算资源与已提交输出资源各自的释放入口。现有答案说 cancel 会释放图表实例，又要求仍显示的 DOM 保留；取消新任务是否会释放上一轮可见输出的资源，必须明确。无需立即公开全新的 renderer API，但内部适配协议必须先定。

### 4. 高优先级：旧注册入口与新 Host 启动事务之间缺少桥接时序

[确定渐进迁移、兼容入口与退出条件](./issues/09-compatibility-cutover.md#answer) 已确定单向适配和唯一存储，但未固定 legacy owner、事务批次、启动完成点及新旧身份去重规则。

现有 [createViewer](../../packages/viewer/src/index.ts) 同步返回 runtime，调用者随后通过 [registerMaterial](../../packages/viewer/src/runtime.ts) 逐项注册，再 open。runtime 还公开可写的 materialRegistry；[registerMaterialBundle](../../packages/designer/src/materials/registry.ts) 则连续调用多个 Store 注册方法。

这与“Host 创建时完成必需插件安装并校验，失败不返回半可用宿主”之间还需要明确的适配流程。否则开发者必须自行选择延迟启动、每次旧调用独立安装、一个长生命周期 legacy Scope 或其他方案。

补齐要求：分别给出新 API 与旧 API 的 create → register/setup → validate → activate → open/render → destroy 时序，明确启用后旧注册的支持范围。说明 legacy owner / contribution identity 如何生成，如何确认新旧声明为同一来源，以及公开 registry 的可写方法如何进入相同所有权体系。不能仅用相同 material type 判为同一 provider。

### 5. 中优先级：包方向已定，公共契约与 exports 尚未成为可验证的交接件

[确定能力契约、宿主裁剪与包依赖方向](./issues/04-contract-boundaries.md#answer) 已决定 api/runtime 分包与 typed extension point，但尚无最小类型草案来固定：Plugin、PluginContext、ExtensionPoint 的身份与泛型关系，Host 对受支持点的声明，注册/读取/服务请求的权限区分，以及 required/optional contribution 的表达。

票据把 exports 交给后续决策；后续票据仍未给出最终入口矩阵。[UI 决议](./issues/07-ui-slots.md#answer) 给出了七个 slot 名称，但 Viewer UI 宿主归哪个包或应用入口、payload 与 context 的具体类型归属仍未明确。`designer.properties.before-after` 如何指定前置或后置也没有字段说明。

补齐要求：在原票据附上标为“拟实施”的最小 TypeScript 契约及入口矩阵，列明契约归属、运行实现归属和允许依赖。至少用 model-only、renderer-only、纯 UI、text 双宿主四种消费例子检查接口是否闭合；规划类型不冒充已发布 API。

验证重点是“能否使用并强制边界”，不要求现在实现 runtime。后续重命名可以是普通实现细节，改变依赖、权限或生命周期则必须回到决策。

### 6. 中优先级：locale 的同级冲突规则仍是未兑现的要求

[生命周期决议](./issues/05-host-lifecycle.md#answer) 在审查时要求明确同级插件词条冲突；[物料能力决议](./issues/06-material-contributions.md#answer) 当时只固定宿主 locale 优先和保持既有查找顺序，没有确定新插件之间重复词条的处理方式。

补齐要求：固定完整优先级、同级冲突的失败或选择规则、legacy 覆盖的兼容范围，以及撤销某个 owner 后如何恢复被遮蔽词条。它应成为一个具体多插件场景的预期结果，不能继续留给实现者决定。

## 建议的补齐顺序与停止条件

1. 先补“能力契约、宿主裁剪与包依赖方向”和“插件安装事务、所有权与清理语义”，固定最小 Interface 与一致状态表。内核实施前完成。
2. 补“物料能力的单一来源与 builtin 组合职责”，锁定字段 owner 与四种消费例子。简单物料切片前完成。
3. 补“UI Slot、宿主服务与旧 Contribution”和“Render Session”各自的契约与数据通路，再核对兼容启动流程。各自阶段进入前完成。
4. 在交付路线明确：签名、依赖方向、owner、事务边界、状态传递或输出资源寿命发生变化，必须回填或重开相关决策；私有文件组织和算法内部实现可由实施任务决定。

不必重做整张地图。建议修订原票据中的冲突，并将尚需选择的问题按 tracker 约定显式重新打开、复核下游阻塞关系；逐项收敛后再恢复“无首版未决事项”。每次关闭需要有实际决议，不能仅补状态。

## 本次验证

- 已读取十张票据中的地图索引，详细核对能力契约、生命周期、物料、UI、渲染会话、兼容和质量决议，以及相关固定研究证据和当前源码。
- `node .scratch/material-plugin-refactor/check-map.mjs validate`：通过；初始检查为 18 份文档、10 张 resolved 票据、0 个错误。
- `node .scratch/material-plugin-refactor/check-map.mjs frontier`：无可领取票据。此结果来自票据状态，不能消除上述语义缺口。
- 未运行应用 build / lint / typecheck / Vitest；本次没有应用代码变更，也没有把测试文件存在或结构校验通过记作重构行为已通过。
