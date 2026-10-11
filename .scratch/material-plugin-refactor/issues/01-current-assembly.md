# 当前物料装配、UI 扩展与包依赖的真实边界

Type: research
Labels: wayfinder:research
Status: resolved
Assignee: Codex/assembly_research
Parent: [EasyInk 物料能力装配层重构地图](../map.md)
Blocked by: none

## Question

当前物料能力在哪里定义、装配、消费和清理？Designer / Viewer / builtin / core / locales / prop-schemas / Assistant 各有哪些真实依赖与兼容入口？哪些现有能力需要保留，哪些概括与源码不符？

研究必须给出可定位的源码证据、迁移触点、现有测试及高风险遗漏；不修改应用代码，不替用户作架构决策。

## Answer

已完成[当前装配层源码证据](../evidence/current-assembly.md)，基线 `0b43cb752ddd13b1802bbbb0d3b2993a3a8fd3be`。

- Designer/Viewer 已无 builtin 或具体物料生产依赖；宿主已显式装配。物料自己的 prop-schemas/locale 及 Assistant 活动物料 manifest 也已存在，不应重复规划为首次解耦。
- 尚待拆分的是 builtin 集中登记与 basic 重复清单、binding 与 AI 的归属、Designer/Viewer 两套 registry 和统一装配生命周期。core 当前拥有协议，没有统一物料注册表。
- 当前 UI 扩展只有 topbar Vue slot、Contribution 按钮/Teleport 面板、属性 overlay 和编辑临时面板。工作区浮窗及属性 sections 仍由固定组件分支消费；Viewer UI 位于 playground，通用 UI slot registry 是新增设计。
- 高风险缺口：bundle disposer 只撤 locale，factory 替换不清缓存，lazy 无过期隔离，catalog 重复追加，Contribution 无逐插件 owner/失败回滚，Viewer 的 pageAware 替换与 owner 条件删除未受保护。
- 证据包含 locale 真实查找优先级、属性 read/commit、编辑/渲染/分页能力、旧公开入口、内嵌 Viewer 宿主、现有测试和建议验证矩阵。源码链接均已检查存在；本研究未执行应用构建或测试。
