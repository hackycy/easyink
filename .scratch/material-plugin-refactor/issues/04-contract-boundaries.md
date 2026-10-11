# 确定能力契约、宿主裁剪与包依赖方向

Type: grilling
Labels: wayfinder:grilling
Status: resolved
Assignee: Codex
Parent: [EasyInk 物料能力装配层重构地图](../map.md)
Blocked by: 01, 02, 03

## Question

如何将物料模型、两端 renderer 和 UI 的贡献落实为类型化契约、明确包入口与单一宿主内核，并避免 Viewer 引入 Designer / Vue？

## Answer

> 本票经逐轮讨论已收敛。以下为已确认架构边界及其代码职责落点，取代此前混有未确认细节的接口草案。具体生命周期、完整物料、UI、渲染、切换和验收契约分别以相应已确认票据为准；类型实现仍待代码阶段验证。

### 已确认：依赖方向与首版范围

- api/runtime 分包；schema/core 不反向依赖插件层；Designer/Viewer 保持导入隔离；插件不获得完整 Store。
- 首版只开放框架已定义、已有实际消费者的能力点，支持第三方物料、renderer、UI 和命令。不公开任意 extension point 或宿主服务注册框架。
- Schema、codec、migration、文档版本与节点创建语义保持。完整重构后手动发布 0.1.0，删除旧装配 API，不提供兼容层，不发布本次重构的 0.0.x 中间版本。

确认来源：保留原 2026-10-08 的边界；用户于 2026-10-10 确认首版扩展范围，并明确破坏性版本策略。

### 已确认：完整物料与集合入口

普通使用者以完整物料或完整集合为选择单位。维护者在一个物料包集中维护领域定义、两端渲染及属性、目录、文案、AI 等已有能力，由框架负责内部装配；不要求用户或作者列出一串模型/renderer/UI 插件。能力的内部分工不等于要求每个能力具有独立公共插件身份。

| 入口 | 用途 |
| --- | --- |
| `@easyink/builtin/all` | 保留全量内置集合入口 |
| `@easyink/builtin/basic` | 保留基础内置集合入口 |
| `@easyink/builtin/all/viewer` | 新增纯 Viewer 全量集合入口 |
| `@easyink/builtin/basic/viewer` | 新增纯 Viewer 基础集合入口 |

这些入口属于同一 builtin 包，不增加安装包。两端对应集合保持相同物料种类，输出对应宿主所需的完整组合。all/basic 成员按现有行为保持；默认 all，保留 none 空集合语义，支持基于完整物料导出自行组合。不改为物料名称字符串列表，不恢复旧 bundle 或 register API。

一个物料包和一个物料身份不意味着一个同时引用两端实现的运行时对象。领域定义和集合成员关系各维护一份，由库的入口/构建层组织两端输出。具体生成工具可以按实现需要选择，但不得要求维护者重复填写两份领域定义或两份集合成员表。

Viewer 专用入口只引用模型及运行态所需实现；JavaScript 与声明依赖图均不得引入 Designer/Vue。动态 loader 可以服务惰性渲染，但不能替代入口隔离。具体导出变量名、单物料入口和完整声明字段见已确认的[确定物料能力的单一来源与 builtin 组合职责](./06-material-contributions.md)，集合导出使用 `materials`。

确认来源：用户明确纠正过度拆分使用方式，要求默认全部并保留 all/basic；在解释新增 Viewer 入口后回复“可以那我接受”。

### 已确认：框架直接提供能力上下文

框架在调用能力实现时直接提供类型明确的受控上下文，物料作者填写对应实现即可：

- Designer 属性、命令等能力取得所需的只读状态查询和编辑操作；修改经过宿主统一变更流程，不直接改内部 Store。
- Viewer 渲染能力取得节点、渲染数据及会话内资源管理能力，不取得 Designer 编辑操作。
- 非物料的 UI/命令扩展按自身契约取得对应上下文，不需要伪造物料类型。

作者不重复声明 points/services 允许清单，不用 service token 查找框架已确定要提供的操作；内部描述符、校验和资源所有权由框架处理。只提供已有消费者实际需要的操作，不预设通用服务容器。

具体 UI 上下文操作在[确定 UI Slot、宿主服务与旧 Contribution 的迁移边界](./07-ui-slots.md)定义；渲染上下文及资源寿命在[确定 Render Session 与复杂物料状态传递协议](./08-render-session.md)定义。此处不提前决定同步/异步创建、setup 或销毁签名。

确认来源：用户于 2026-10-10 对“框架直接提供所需能力”的推荐回复“接受”。此前公共 PluginContext.service/optionalService、强制 points/services 清单的方案撤回，不作为实施要求。

### 已确认：内核与宿主消费者的分工

采用唯一装配内核：每个 Designer 或 Viewer 实例各有独立 Host，plugin-runtime 在该 Host 内拥有唯一有效的能力登记源，负责登记、校验、归属记录及通用生命周期管理。它不解释物料的布局算法，不实例化 Vue，不自行编辑文档。

Designer/Viewer 根据已经登记的能力执行编辑、渲染、UI 挂载等业务，并提供各自的受控上下文。宿主可以保留渲染器实例缓存、界面状态和会话状态，但这些是派生运行状态，不再维护第二套可写注册表。两端共享内核实现，不共享全局可变 Host 或注册表。

上述已确认分工对应的代码职责落点如下；类型和函数签名随相关票据细化：

| 代码落点 | 职责与依赖 |
| --- | --- |
| `packages/plugin-api` | 公共能力契约与上下文类型；无宿主实现、无运行注册表 |
| `@easyink/plugin-api/material` | 领域及完整物料相关契约，允许复用 schema/core/shared 类型 |
| `@easyink/plugin-api/designer` | 设计态能力及受控编辑契约，不依赖 designer 实现 |
| `@easyink/plugin-api/viewer` | 运行态渲染契约，不依赖 viewer 实现或 Vue |
| `@easyink/plugin-api/ui` | 引用 Vue 的 UI 契约独立入口；无 UI 的根/Viewer 入口不得重导出它 |
| `packages/plugin-runtime` | 通用装配与生命周期实现；不依赖具体物料、Designer、Viewer 或 Vue |
| `packages/designer` | 设计态消费者和上下文实现，复用 core 编辑协议 |
| `packages/viewer` | 运行态消费者和上下文实现，复用 core 渲染/布局协议 |
| `packages/materials/*` | 集中维护完整物料，提供宿主隔离的完整输出 |
| `packages/builtin` | 选择、组合完整物料，维护集合成员关系，不复制物料领域定义 |

纯 Viewer 的 UI 消费范围由 [UI 范围决议](./07-ui-slots.md#已确认viewer-保留应用预览壳层)确定，首版保留应用预览壳层，不新增 Viewer UI 包或 adapter。内部 descriptor、keyed/list 存储和私有方法名可在上述分工内设计，不构成第三方通用扩展平台。

具体事务、冲突和清理语义由[确定插件安装事务、所有权与清理语义](./05-host-lifecycle.md)决定，不能以本分工决议提前冻结安装接口。

确认来源：用户对“插件内核统一登记、校验和生命周期；两端只消费能力与提供上下文；每个实例独立状态”的推荐回复“接受”。本票据此关闭，后续按依赖顺序讨论生命周期与完整物料声明。

### 验收方向

- Designer 使用完整集合；纯 Viewer 使用对应专用集合；自行组合使用完整物料。均不要求调用方手工补齐能力插件。
- 同一物料在两端可用，物料模型与集合成员关系各只有一份维护来源。
- 能力回调直接获得所需上下文；Viewer 类型不包含编辑操作；作者无需服务清单或服务查找。
- 检查实际 JavaScript 产物与声明依赖图，确保纯 Viewer 无 Designer/Vue/Assistant UI；源码搜索或 builtin external 配置不能独立证明隔离。
- 验证多 Host 独立、宿主缓存不是另一套注册来源，并删除旧注册 Map，不能用旧 API 转发到新内核。

本票的文档校验不等于上述代码验收已完成。

## Comments

### 源码依据

当前 Designer 核心与 Viewer/打印核心已经分离。`packages/viewer/package.json` 不依赖 Designer/Vue；打印集成通过 Viewer 生成输出。`packages/builtin/src/all.ts` 同时导出两端集合，`packages/builtin/src/types.ts` 引用 Vue Component；因此仍需隔离物料入口与声明。

`internal-packages/viewer-runtime/vite.config.ts` 使用单个 IIFE 和 `cssCodeSplit: false`，动态 import 可能内联；`packages/builtin/tsdown.config.ts` 将 easyink 包 external，只是把裁剪责任留给最终消费者。

产品默认全部不等于底层 runtime 自动导入 builtin：当前 playground 显式传入 all，Designer 只消费传入集合。重构保留产品默认行为，不让底层宿主反向依赖 builtin。

### 被替代的提案

- 按模型、renderer、属性、UI 插件逐项手工拼装；用户因使用和维护复杂度否定。
- 用物料名称字符串列表替代 all/basic 导出；用户要求保留现有组合导出。
- 通过同一完整对象的两端动态 loader 保证 Viewer 隔离；构建依据不足，已采用专用入口。
- 强制作者声明 points/services 并查找 service token；已由框架直接提供受控上下文取代。

此前草案中的 model-only/renderer-only 公共消费要求及独立 AI/UI 必选开关已经撤回，不得转化为用户拼装负担。同步完整声明、受管异步初始化和 Promise 创建由[生命周期决议](./05-host-lifecycle.md)确定；内部测试按[验收决议](./10-quality-documentation.md)落实。
