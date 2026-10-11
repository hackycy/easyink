# deepseek-harness 的可借鉴机制与适用限制

Type: research
Labels: wayfinder:research
Status: resolved
Assignee: Codex/harness_research
Parent: [EasyInk 物料能力装配层重构地图](../map.md)
Blocked by: none

## Question

以 [deepseek-harness 官方仓库](https://github.com/deepseek-ai/deepseek-harness)的代码与文档为一手来源，核实它如何声明、安装、组合、解析、清理和诊断插件能力。哪些机制适用于 EasyInk 的物料能力装配，哪些因运行环境或领域不同不能直接套用？

固定所读 commit，逐项给出永久链接，区分已观察事实、迁移建议和未验证内容；将关键事实存入本地证据文件，保证路线不依赖在线页面才能理解。

## Answer

已完成[官方架构与源码证据](../evidence/deepseek-harness.md)，固定提交 `5badb15009ae1756c3afe0ae0cef1faafc290ccc`，共 30 个永久来源链接。文件随本地图版本化保存，含本地可读结论、源码行为、迁移建议和未验证范围。

- 普通 Cordis 插件经命名服务、类型事件和有 owner 的 effect 组合；Loader、持久包安装、动态 Host / Client 包是不同层次。
- 基础服务同域重名拒绝，事件按注册顺序及 prepend；UI Slot 独立支持 single/list/keyed/chain 与数值 priority，其基数和覆盖规则不能泛化到全部能力。
- effect 支持失败清理与宿主销毁，但多个异步 disposer 并发执行；持久包安装不保证全部外部状态回滚，缺依赖可无限 PENDING。
- 建议借鉴能力契约 / 提供者 / 消费者分离、显式归属、UI 注册核心与渲染实现分离、诊断与文档同步；首版落实安装回滚和宿主销毁清理，运行中替换后置。

校验：171 行证据正文及来源索引；30 个引用均固定同一提交，对应文件与引用行范围存在；未执行 Harness 测试或安装依赖。
