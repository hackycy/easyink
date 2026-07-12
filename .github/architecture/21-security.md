# 21. 安全模型

物料平台把所有外部输入、物料代码和 DOM 能力视为不同信任边界。安全约束由 profile compile、schema admission、facet host、render capability 和 isolated conformance 共同执行。

## 21.1 数据准入

- manifest/package 在 compile 前做 accessor-safe snapshot、版本、namespace、JSON、路径和预算校验。
- 文档按固定 adapter phase 准入；失败节点进入只读 quarantine sidecar，不把错误对象写进 Schema。
- 私有 model 只由所属 adapter 解释；宿主依赖 binding ports 与 introspection。
- JSON pointer 拒绝危险 token，图遍历受深度/节点/字符串预算约束。

## 21.2 DOM capability

物料不能提交 raw/trusted HTML。sanitized markup 是 browser capability 生成的不透明 token，只能由原 store、原 document、一次性消费。imperative DOM 同时要求 facet 声明与 host allow-list；每次 mount 必须返回 disposer，替换、失败和 shutdown 都按确定顺序清理。

嵌套 material 不继承所有者的 DOM 权限。每个 facet 拥有独立 capability scope，但计入同一个总 render budget，防止通过嵌套逃逸限制。

## 21.3 Facet 与 conformance 隔离

`MaterialFacetHost` 对激活递归、异常、恶意 thrown value 和 disposer 失败 fail closed，并只 quarantine 对应 surface key。声明为 `async-isolated` 的 facet 只能在显式 trusted isolate 中执行。

内置物料 conformance 在子进程运行，使用握手认证、最小环境、deadline、报告大小/issue 数预算和 crash/timeout 稳定错误码。conformance 覆盖 migration、normalize、properties、identity/reference、surface intersection、render、mount 和 disposer。

安全证明见 [`packages/core/src/material-conformance.test.ts`](../../packages/core/src/material-conformance.test.ts)、[`packages/builtin/src/testing/isolated-material-conformance.test.ts`](../../packages/builtin/src/testing/isolated-material-conformance.test.ts) 与 [`packages/browser-dom/src/render-viewer-tree.test.ts`](../../packages/browser-dom/src/render-viewer-tree.test.ts)。
