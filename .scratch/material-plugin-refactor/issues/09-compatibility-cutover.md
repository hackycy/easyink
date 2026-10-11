# 确定 0.1.0 破坏性切换、旧 API 删除与手动发布边界

Type: grilling
Labels: wayfinder:grilling
Status: resolved
Assignee: Codex
Parent: [EasyInk 物料能力装配层重构地图](../map.md)
Blocked by: 07, 08

## Question

如何完整替换物料能力装配层、直接删除旧 API，在全部实现和验收完成后一次手动发布 0.1.0，避免长期兼容维护和中间态泄漏？

## Answer

> 2026-10-11 用户对完整切换方案回复“接受”，本票 resolved。确认范围包括全部实际消费者迁移、完整物料入口与非装配导出保留、公共 npm 包统一 0.1.0，以及候选制品齐备后由用户手动发布。以下为最终决议；上游完整物料/宿主/生命周期/输出契约继续有效。具体质量与文档门禁仍由下一票讨论。

**确认来源：用户于 2026-10-10 明确要求实现不再保留旧 API、不做兼容层，完整重构后手动发布 0.1.0，不继续以 0.0.x 版本发布本次重构。** 本决议取代 2026-10-08 的渐进兼容、N/N+1 窗口和 N+2 删除方案。

### 实施与发布策略

- 分阶段组织实现和评审，但整轮只交付一套新的装配 API。中间阶段不发布为可供外部消费的稳定版本，不承诺旧调用继续编译。
- 不写 legacy adapter、旧 registry façade、旧 bundle 派生视图、旧 Store Contribution 桥、旧 owner 去重、双注册存储或运行时弃用提示机制。
- 0.1.0 的目标是完整切换，发布前所有内置物料、实际宿主、Assistant 接入、playground、文档示例及内嵌制品都使用新入口。
- SDK API 的破坏性变更不等于文档 Schema 升级。Schema 字段/版本、codec、migration、单位/默认值与既有文档读取语义保持不变；不创建“0.1.0 文档迁移”。
- 本地图及当前任务只修订规划。实际版本号写入在完整实现的发布准备阶段完成；本次不改 package.json、打 tag、执行 publish 或自动发布。

### 旧入口删除与替代矩阵

| 删除的装配入口 / 机制 | 唯一新路径 | 发布前证明 |
| --- | --- | --- |
| `runtimeConfig.materials.bundles`、物料注册型 setupStore | Designer 创建配置一次接受完整 `materials`；默认 all，也可 basic/none/自选数组 | playground/示例改用新启动；不在 setupStore 暗中装物料 |
| `registerMaterialBundle`、DesignerMaterialBundle 与相关注册类型 | 完整物料集中声明共享模型、对应宿主 renderer 及可选 properties/palette/locale/AI，由框架内部装配 | 作者和使用者均不逐项注册能力；已有功能保持，旧导出消失 |
| Designer Store 面向扩展者的 material/factory/catalog/locale 注册方法 | runtime 唯一 registry；Store 和 UI 通过受控查询/操作消费 | 原可写 Map 与公开写入口删除；不公开另一套 contribute/register 操作让物料作者补装 |
| `ViewerRuntime.registerMaterial`、公开可写 materialRegistry、MaterialRendererRegistry 装配导出 | `await createViewer({ materials, ... })` 创建时完成安装 | 不能在创建后补注册；render 查询唯一 registry |
| builtin all/basic/none 的旧 bundles、registrar、registerBuiltinViewerMaterials | root/all/basic 导出 Designer `materials`；all/viewer、basic/viewer 导出 Viewer `materials`；none 为两端可用空集合 | 成员与行为快照一致；同一成员定义生成两端输出，无生成旧 bundle 的代码 |
| 旧 Contribution、activate(ctx)、ctx.store、Designer contributions prop | 独立扩展直接声明已确认的 Designer UI 能力；context prop/回调参数提供受控上下文 | Assistant 直接迁移，无旧桥、完整 Store 或用户手填 point/service 清单 |
| 物料根入口中混合两端能力的旧装配导出 | 单物料根入口输出 Designer 完整物料，`/viewer` 输出 Viewer 完整物料，如两端都导出 `text` | 不要求应用拼装 model/ui/ai 子入口；最小 Viewer 的源码/产物/声明导入图隔离 |
| 旧同步销毁调用假设 | `await handle.destroy()` | 托管打印、iframe、UI unmount 的关闭路径能观察清理完成 |
| Viewer render/open/updateData 的旧返回假设、Viewer print/exportDocument 的 throwOnError 分支 | 按 [任务返回决议](./08-render-session.md#打印导出与任务返回) 区分完成、取消与整体失败 | 直接调用路径及适配器正确分支，局部降级保留诊断，不能误将取消或旧结果当成本次完成 |

旧接口相关类型、重导出、测试 setup、文档和生成 README 源同时迁移。非物料的 setupStore 职责、print/export driver、数据源、编辑命令与算法 helper 不因同名或含 register 字样被机械删除；这些 API 若需要调整，须证明与新所有权或宿主创建流程直接相关。

具体物料包目前从根入口导出节点工厂和模型类型，例如 `createTextNode`、`TextProps`、`TEXT_DEFAULTS` 与 image 的对应导出。保留这些非装配导出的根入口可用性；Viewer 有需要时从 `/viewer` 同步导出同一纯实现/类型，不经过 Designer 根聚合，不另强制引入 `/model` 使用步骤。公开纯 helper 逐项核对实际依赖后保留到适用入口；不复制工厂实现，不改变默认值。builtin 目前并不重导出这些工厂，不为迁移额外扩大 builtin 的职责。

删除清单覆盖根和 all/basic/none 的所有旧 bundle、sets、bundle 构造器、具名与通用 registrar 及关联装配类型，不能仅搜索 `registerBuiltinViewerMaterials`。实际清单由源码 exports 与消费 fixture 共同锁定。

旧 renderer 的纯计算函数可以作为实现复用，但不导出一套旧装配 façade；新公共契约以[能力契约](./04-contract-boundaries.md)和[Render Session](./08-render-session.md)为准。

### 统一的创建和销毁

```text
选好完整 materials 集合及独立扩展
  -> Viewer 程序化创建等待 createViewer；Vue Designer 由组件内部管理启动
  -> 框架提供宿主上下文，校验和必需初始化完成后可用
  -> open / render / 编辑 / print / export
  -> await destroy
```

应用要换物料/扩展集合就先销毁再创建。打印 core 原 setupViewer 的装配职责移到**创建前**的 Viewer 配置提供入口，传完整 materials 与所需 Viewer 选项；宿主上下文由框架提供，不让应用构造 Host profile 或服务清单。输出 driver 等既有非物料初始化职责仍可保留但不得注册物料。不再通过回调拿已创建 Viewer 逐项注册。UI 框架 unmount 无法直接 await 时，由宿主控制器保留关闭 Promise；托管打印/资源计数验收必须真正等待。不为本次迁移额外要求用户改用程序化 createDesigner。

按 [UI 范围决议](./07-ui-slots.md#已确认viewer-保留应用预览壳层)，首版不新增 Viewer UI adapter，预览界面继续由应用壳层负责。独立内嵌 runtime 在自己的 document 中构造 Host，跨进程/消息边界只传 Schema、data 和可序列化选择配置，不传物料函数、Vue 组件、Host 或 registry；runtime 内选择本地完整物料集合。这个内部协议不把普通应用的 materials 数组改成物料名称字符串，也不强制同源预览增加一层消息协议。

### 必须完成的消费范围

playground Designer、PreviewOverlay/Viewer 组合、Assistant designer-bridge；`packages/print/core`、相关打印/导出调用和集成样例；`internal-packages/viewer-runtime`、render-api-service；Go Render 与 Android 的内嵌浏览器制品链路及实际示例；全部内置物料与 builtin 三种集合；docs 自定义物料/Contribution/Viewer 教程及 README 生成源。迁移只调整新装配、创建/销毁和输出结果契约涉及的调用，不顺便重写平台 SDK、传输协议或无关算法。

开发检查点沿用路线：冻结基线与清单 → 契约和 Host → text/image 双宿主切片 → UI 与复杂会话 → 全部物料和宿主 → 版本与制品验收。可以分批评审提交，整轮完成前不对外发布；未迁移代码不能靠兼容桥接进入新 Host。

0.1.0 面向外部使用者明确发布 breaking change 和新调用示例。外部用户自行迁移代码，不以无法确认外部调用方为由恢复兼容窗口或桥接。现有 0.0.x 制品仍是历史版本，不在 0.1.0 内携带其实现。

### 版本、人工发布与回退

本轮现有 EasyInk 公共 workspace 包与新增 plugin-api/plugin-runtime 统一为 0.1.0，即使 schema 等包行为不变也随本次公共发行同步版本。阶段零列出逐包清单；发布准备核对 workspace 依赖打包后的实际范围，避免候选包仍指向旧装配实现。private 应用不作为 npm 公共包发布，嵌入 runtime/Go/Android 制品记录匹配的 SDK 版本、构建提交和产物校验信息，不机械把各平台独立版本方案改成 npm 版本。只约定本次整组切换，不借此强制永久扩大 Changesets fixed 分组。

核对到的发布现状（2026-10-11，只读）：

- 当前公共 workspace 包为 0.0.31；[Changesets 配置](../../../.changeset/config.json)的 fixed 组仅包含 material-*、builtin、designer、viewer，不能假定一次 bump 会自动覆盖所有公共包。实施时明确本次版本清单、处理已有 changeset，核对最终恰为 0.1.0，不直接假定 major/minor 命令的结果。
- [发布脚本](../../../scripts/release.mjs)会创建 changeset、推进版本、提交、打 npm-v 时间戳 tag 并推送；[npm workflow](../../../.github/workflows/publish-npm.yml)收到该 tag 会自动执行 publish。脚本不是只读校验，也不是候选产物生成器；不能在已准备 0.1.0 后原样再跑而重复推进版本。workflow 还注明新包首次需手动发布并配置权限，新增 plugin 包的发布准备需要注明这一前提。
- [Render manifest 示例](../../../lib/EasyInk.Render/manifests/runtime-manifest.sample.json)已有 host/runtime 0.1.0 字样，而 private viewer-runtime 包仍为 0.0.0；示例版本文字不能证明本轮 SDK 已完成或制品已匹配。

发布准备与实际发布明确分开。实施任务生成并校验版本/依赖修改、候选包和发布说明，必要时调整 release 脚本使准备结果可直接交接，不重复 bump；不自动调用其提交、tag、push 或 publish 步骤。现有 tag/workflow 的事实不要求本轮另造发布系统，也不授予代理触发权限；用户最终自行选择并执行手动发布入口，若选择推送发布 tag，应明确它会继续触发远端发布。

发布准备阶段生成 release notes、包/exports 清单、tarball 或等效候选产物、内嵌 manifest 和迁移指南；使用这些候选产物完成验收，全部门禁通过后连同结果交给用户手动发布。构建/测试允许自动化，发布决定和实际推送制品由用户执行；不得因路线标记 resolved 自动触发 release、npm publish、changeset publish 或 tag。

交接至少包含完整包清单、移除/替代 API 对照、可运行迁移示例、候选产物与构建提交对应关系、内嵌制品匹配表、发布操作说明和实际验证记录；不能用 sample manifest 或工作区链接构建成功替代候选包消费验证。具体测试层次、环境和门禁见已确认的[确定验收门禁、发布标准与持续文档归属](./10-quality-documentation.md)。

开发阶段回退是恢复某个 Git 提交/分支检查点并重新构建，不提供运行中的旧 API 模式。发布后如需退回 0.0.x，必须将应用代码、整组依赖与嵌入制品一起回退到匹配版本并重建 Host；仅降一个 npm 包版本不是支持的回退路径。

### 发布退出门禁

- 所有实际消费者和文档示例已迁移且可构建、可运行；没有混用新旧装配。
- 旧导出在类型与 package export 消费测试中不可用；运行产物无兼容层/第二 registry。源码扫描是辅助，不替代产物验收。
- 阶段零冻结的 Schema 与编辑/渲染基线通过，未知物料行为按新诊断规则验收。
- UI/Session/Scope 资源所有权、双 Host、取消与异步迟到测试通过；真实打印/导出/内嵌 runtime 冒烟通过。
- 版本清单、0.1.0 候选产物、破坏性 API 迁移说明、人工发布交接齐备。

## 决策历史

2026-10-08 选择旧 API 暂时转发及两版本观察窗口；2026-10-10 用户明确推翻该发布策略。本文件保留原 tracker 身份和文件路径，标题及有效 Answer 已更新；旧窗口与兼容矩阵不再作为实施依据。
