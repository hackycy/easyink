# 19. 测试与完成矩阵

本页是 Material Platform Foundation 的权威 completion matrix。状态只依据当前公开导出和可执行测试，不从历史计划推导。

## 19.1 Completion matrix

| 合同 | 状态 | 实现/导出 | 证明测试 |
| --- | --- | --- | --- |
| compile profile、冻结 snapshot、surface sets | 已完成 | [`material-profile.ts`](../../packages/core/src/material-profile.ts) | [`material-profile.test.ts`](../../packages/core/src/material-profile.test.ts) |
| namespace 与 optional package 原子 quarantine | 已完成 | [`material-profile.ts`](../../packages/core/src/material-profile.ts) | [`material-profile.test.ts`](../../packages/core/src/material-profile.test.ts) |
| canonical node 与 empty `model/slots/bindings/output` | 已完成 | [`types.ts`](../../packages/schema/src/types.ts)、[`material-profile.ts`](../../packages/core/src/material-profile.ts) | [`material-profile.test.ts`](../../packages/core/src/material-profile.test.ts)、[`node-envelope.test.ts`](../../packages/builtin/src/node-envelope.test.ts) |
| codec 无物料/table 分支 | 已完成 | [`codec.ts`](../../packages/schema/src/codec.ts) | [`codec.test.ts`](../../packages/schema/src/codec.test.ts) |
| load phase order 与 load sidecar | 已完成 | [`schema-adapter.ts`](../../packages/core/src/schema-adapter.ts) | [`schema-adapter.test.ts`](../../packages/core/src/schema-adapter.test.ts) |
| edit/history validation sidecars | 已完成 | [`schema-adapter.ts`](../../packages/core/src/schema-adapter.ts) | [`schema-adapter.test.ts`](../../packages/core/src/schema-adapter.test.ts) |
| Designer publish/restore 原子边界 | 边界已完成 | [`designer-store.ts`](../../packages/designer/src/store/designer-store.ts) | [`designer-store.test.ts`](../../packages/designer/src/store/designer-store.test.ts) |
| 全 command/history 接入 publish/restore | 后续依赖 | Transaction 计划 | 不在 Foundation 完成范围 |
| binding ports 与 private model | 已完成 | [`material-binding.ts`](../../packages/core/src/material-binding.ts) | [`material-manifest.test.ts`](../../packages/core/src/material-manifest.test.ts) |
| identity scopes、introspection、graph clone/validation | 已完成 | [`material-introspection.ts`](../../packages/core/src/material-introspection.ts) | [`material-introspection.test.ts`](../../packages/core/src/material-introspection.test.ts) |
| property accessor canonical paths | 已完成 | [`material-properties.ts`](../../packages/core/src/material-properties.ts) | [`material-properties.test.ts`](../../packages/core/src/material-properties.test.ts) |
| direct v1 `TableModel` in `node.model` | 已完成 | [`table/kernel/model.ts`](../../packages/materials/table/kernel/src/model.ts) | [`schema-adapter.test.ts`](../../packages/materials/table/kernel/src/schema-adapter.test.ts)、[`manifest.test.ts`](../../packages/materials/table/data/src/manifest.test.ts) |
| `break-opportunities` core scheduling declaration | 已完成 | [`material-manifest.ts`](../../packages/core/src/material-manifest.ts)、[`layout-plan.ts`](../../packages/core/src/layout-plan.ts) | [`material-manifest.test.ts`](../../packages/core/src/material-manifest.test.ts) |
| 完整 Viewer break API/layout 接线 | 后续依赖 | Viewer Layout 计划 | 不在 Foundation 完成范围 |
| facet host 与 surface-local quarantine | 已完成 | [`material-facet-host.ts`](../../packages/core/src/material-facet-host.ts) | [`material-facet-host.test.ts`](../../packages/core/src/material-facet-host.test.ts) |
| sanitized token 与 imperative lifecycle | 已完成 | [`viewer-render-tree.ts`](../../packages/core/src/viewer-render-tree.ts)、[`render-surface.ts`](../../packages/viewer/src/render-surface.ts) | [`render-viewer-tree.test.ts`](../../packages/browser-dom/src/render-viewer-tree.test.ts)、[`render-surface.test.ts`](../../packages/viewer/src/render-surface.test.ts) |
| Assistant manifest v1 portable projection | 已完成 | [`material-manifest.ts`](../../packages/assistant/designer-bridge/src/material-manifest.ts) | [`material-manifest.test.ts`](../../packages/assistant/designer-bridge/src/material-manifest.test.ts)、[`schema.test.ts`](../../packages/assistant/capabilities/src/schema.test.ts) |
| isolated built-in conformance gate | 已完成 | [`isolated-material-conformance.ts`](../../packages/builtin/src/testing/isolated-material-conformance.ts) | [`conformance.test.ts`](../../packages/builtin/src/conformance.test.ts)、[`isolated-material-conformance.test.ts`](../../packages/builtin/src/testing/isolated-material-conformance.test.ts) |

## 19.2 Gate

Foundation 合并门禁为：focused tests、根 `pnpm test`、`pnpm build`、`pnpm lint`、`pnpm typecheck`、package `publint`、dependency ownership scan、forbidden scans 和 `git diff --check` 全部通过。

forbidden scan 覆盖已移除的可变物料入口、旧 DOM 信任入口、旧节点访问器/命令、canonical 根级兼容字段、schema-tools 物料分支和 Assistant 的隐式物料推导。唯一允许的旧格式数据是迁移测试 fixture，扫描用精确 glob 排除 `**/testing/fixtures/**` 与对应 `*.test.ts`，不能宽泛排除生产目录。
