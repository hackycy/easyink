# 5. Schema DSL 设计

EasyInk 的持久化 Schema 是文档模型，不是某个渲染器的参数集合。外部兼容输入先由 `@easyink/schema` codec 解码，再由已编译的物料 profile 准入；canonical 文档只保存能够稳定回放的字段。

## 5.1 文档与节点

`DocumentSchema` 持有 `version / unit / page / guides / elements`。canonical `MaterialNode` 的公共 envelope 固定为：

```ts
interface MaterialNode<TModel = Record<string, unknown>> {
  id: string
  type: string
  x: number
  y: number
  width: number
  height: number
  modelVersion: number
  model: TModel
  slots: Record<string, MaterialNode[]>
  bindings: Record<string, MaterialBinding>
  output: MaterialOutput
  editorState?: MaterialEditorState
}
```

`model` 是物料私有模型；`slots`、`bindings`、`output` 是跨包可解释的公共协议。即使为空，`model / slots / bindings / output` 也必须物化为 canonical map/object，不以缺省值表达第二种形态。节点不持有 `props`、根级 `binding / children / table / hidden / locked / renderCondition / print`，也不持有根级 `unit`。

表格 v1 直接把 `StaticTableModel` 或 `DataTableModel` 放在 `node.model`；全局 schema/codec 不包含 table 分支。复杂表格剩余能力由独立 Complex Table 计划推进，不改变这一 envelope。

## 5.2 Binding 与结构

`bindings` 以稳定 port 为键。manifest 的 `MaterialBindingDefinition` 声明 exact、prefix 或从私有 model 路径解析的 port policy，并区分 display/semantic role 与 value shape。宿主只解释 port 契约，不读取物料私有 model 的业务字段。

子节点只通过 `slots` 出现。slot policy 声明坐标系、布局参与方式和 reparent 规则；任意私有嵌套结构则通过 adapter introspection 暴露 identity、reference、resource、binding 和 structure slot。

Identity 分为 `document` 与 `material` scope。克隆、引用重写和图校验使用 introspection sidecar，不扫描未知私有字段。

## 5.3 Codec、加载与验证

`decodeBenchmarkInput()` 只完成兼容形态解码并保留未知 JSON；`loadDocumentWithProfile()` 才执行物料准入。固定阶段顺序是：

`envelope -> resolve -> validate-input -> migrate -> normalize -> validate -> introspect -> graph`

加载返回 `{ schema, diagnostics, nodeStates }`。`nodeStates` 是只读 load sidecar，状态为 `ready` 或 `quarantined`；诊断不写回 Schema。

编辑增量调用 `validateDocumentWithProfile(..., { mode: 'edit', baselineNodeStates, affectedNodeIds })`。历史恢复调用 `mode: 'history-restore'`，并必须提供与目标快照精确对应的 `targetNodeStates`；不得退回重新 admission 猜测历史状态。

## 5.4 迁移约束

每个 `SchemaAdapter` 拥有自己的 `currentModelVersion` 和逐版本 migration。只接受精确的一步边；migration、normalize、validate 和 introspect 都受路径、JSON、预算及不变性检查约束。旧字段只存在于兼容输入和迁移 fixture，不能重新成为 canonical API。

公开入口以 [`packages/schema/src/index.ts`](../../packages/schema/src/index.ts) 与 [`packages/core/src/schema-adapter.ts`](../../packages/core/src/schema-adapter.ts) 为准。
