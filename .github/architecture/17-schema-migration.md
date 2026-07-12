# 17. Schema 迁移与恢复

迁移属于物料 adapter，不属于全局 codec，也不允许 schema-tools 按物料 type 写分支。

## 17.1 加载阶段

`decodeBenchmarkInput()` 把兼容 JSON 转成可准入输入；`loadDocumentWithProfile()` 使用编译 profile 执行固定阶段：

`envelope -> resolve -> validate-input -> migrate -> normalize -> validate -> introspect -> graph`

每个 migration 只连接 `from -> from + 1`。缺边、未来 modelVersion、越权写入、无效 JSON 或 adapter 异常都会 quarantine 当前节点，并在只读 `nodeStates`/diagnostics sidecar 中记录；诊断不持久化到 Schema。

## 17.2 Edit 与 history sidecar

编辑发布使用 `validateDocumentWithProfile(candidate, profile, { mode: 'edit', baselineNodeStates, affectedNodeIds })`。它只重验受影响 ready 节点，保留未触碰 quarantine，禁止修改 quarantined 节点但允许删除。

历史恢复使用 `{ mode: 'history-restore', targetNodeStates }`。目标 schema 与完整 target sidecar 必须精确匹配，不能通过重新 load 推测当时状态。

Designer 已提供 `publishSchemaCandidate()` 与 `restoreSchemaFromHistory()` 原子边界并有回归测试；把每一条 command/undo/redo 都接入该边界属于后续 Transaction 计划，本 Foundation gate 不声称该接线已完成。

## 17.3 Conformance

migration 声明 fixture 和 `declaredWritePaths`。conformance 验证确定性、逐步迁移、protected path、normalize 幂等、validate/introspect 结果和预算。legacy `props / binding / children / table` 只允许出现在 codec 或 migration fixture 中用于迁移回归。

实现见 [`packages/core/src/schema-adapter.ts`](../../packages/core/src/schema-adapter.ts)，边界见 [`packages/designer/src/store/designer-store.ts`](../../packages/designer/src/store/designer-store.ts)。
