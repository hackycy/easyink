---
description: 0.1.0 的物料声明、宿主生命周期和输出 API 变化。
---

# 0.1.0 发行说明

0.1.0 将物料装配统一为创建前选择的完整声明。每个 Designer/Viewer 实例拥有唯一 Host；目录、属性、文案、AI 与渲染随物料提供。Viewer 入口和声明图隔离 Designer、Vue 与 Assistant UI，chart-custom 的 Designer 实现按需加载。

本次删除旧 bundle/registrar、可写物料注册表、Contribution/Store 注入和创建后 setupViewer。创建、销毁与输出结果改为可等待协议。重复身份与核心冲突整体失败；locale 冲突保持非阻断诊断。

文档 Schema、codec、migration、单位和节点默认值保持原语义，已有模板无需进行 Schema 迁移。旧调用的替换方式、输出行为和整组恢复步骤见[迁移指南](./migration-0.1.0)。

文档维护、构建和发布约定见 [仓库 Agent 指引](https://github.com/hackycy/easyink/blob/main/docs/AGENTS.md)。
