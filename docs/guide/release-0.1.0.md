---
description: 0.1.0 breaking changes、发布前核对和人工发布步骤。
---

# 0.1.0 发行说明与手动发布

0.1.0 将物料装配统一为创建前选择的完整声明。每个 Designer/Viewer 实例拥有唯一 Host；目录、属性、文案、AI 与渲染随物料提供。Viewer 入口和声明图隔离 Designer、Vue 与 Assistant UI，chart-custom 的 Designer 实现按需加载。

本次删除旧 bundle/registrar、可写物料注册表、Contribution/Store 注入和创建后 setupViewer。创建、销毁与输出结果改为可等待协议。重复身份与核心冲突整体失败；locale 冲突保持非阻断诊断。Schema 与既有文档行为保持不变，详见[迁移指南](./migration-0.1.0)。

## 发布前核对

0.1.0 是发布者手动确定的发行版本；当前工作区保留开发版本号，不预先写入 `package.json`。发布前请由维护者按仓库流程核对所有公共包的版本、实际 manifest/exports/依赖、Go/Android 内嵌 runtime、构建 HEAD 和制品 checksum。

发布前至少执行：

```sh
pnpm build
pnpm lint
pnpm typecheck
pnpm test
pnpm docs:build
pnpm render:manifest
```

这些命令只构建和检查。源码、HEAD 或平台制品改变后，应由发布者重新核对版本、依赖、exports、真实浏览器/Go/Android 运行结果和 checksum。构建成功本身不能替代真实平台验收。

## 用户手动发布

1. 审查 67 个公共包的 manifest/依赖/exports、checksum、迁移/移除清单和平台运行结果；由发布者按仓库流程形成 0.1.0 发布版本。
2. 核对 npm 账户、scope 权限和各包首次发布前提。新增 plugin-api/runtime 需首次手动发布，并为 workflow 的 NPM_TOKEN 配置发布权限；其它尚未首次发布的包同样处理。
3. 发布者逐包执行 `npm publish <已核验的 artifact>.tgz --access public`，全部公共依赖应同批发布。上述命令是真实远端操作，只由发布者执行。
4. 如选择既有 `npm-v*` tag workflow，由发布者核对发布提交后手动创建/推送 tag。workflow 会 install、build、`changeset publish`，发布成功还会触发 Pages，含 assistant-orchestrator 时触发其镜像构建。

`pnpm release` 会生成 changeset、推进版本、commit、tag、push，执行前应核对发布流程；若已手动设置 0.1.0，重复执行可能再次 bump。当前 Changesets fixed 组只含 material-*、builtin、designer、viewer，发布者需单独核对其它公共包的目标版本。

最终发布决定和操作由用户执行。整组恢复说明见迁移指南；没有旧 API 兼容模式，也没有本轮中间 0.0.x 发布。
