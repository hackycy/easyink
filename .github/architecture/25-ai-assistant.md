# 25. AI Assistant

Assistant 消费编译 profile 的 portable manifest v1 projection，不读取 Designer renderer、store 私有状态或历史 `props` 拓扑。

## 25.1 Projection v1

`createAssistantMaterialManifest(profile)` 输出：

```ts
interface AssistantMaterialManifest {
  version: 1
  profileId: string
  engineVersion: string
  materials: AssistantMaterialEntry[]
}
```

每个 entry 只投影 JSON 数据：type/modelVersion、common 展示信息、默认尺寸、binding port/data-contract 摘要、property descriptor 与 accessor target paths，以及 AI generation 的 `modelSchema / bindingShape / requiredModelPaths / examples`。投影会 detached clone 并深冻结，不携带 factory、Vue component、命令或函数。

## 25.2 Surface intersection

只有 `generation.enabled` 且同时拥有 designer 与 viewer facets 的物料进入 `generatableTypes`。AI 合同只来自 manifest 的显式 portable facet，并由 Assistant capabilities schema 再校验；任何宿主 UI 或运行时对象都不是生成合同来源。

生成结果必须满足 projection v1 中的 model schema、binding shape 和 required model paths，随后仍经过 normal document/profile admission。Assistant 不能绕过 namespace、binding port、migration、property accessor 或 quarantine 规则。

## 25.3 Knowledge

material knowledge 可以从 portable descriptor 合成检索信息，但它不是 canonical schema，也不拥有物料模型。属性目标使用 accessor paths，binding 使用 port contract；私有 model 结构只通过显式 generation schema 暴露。

实现见 [`packages/assistant/designer-bridge/src/material-manifest.ts`](../../packages/assistant/designer-bridge/src/material-manifest.ts)、[`packages/assistant/capabilities/src/types.ts`](../../packages/assistant/capabilities/src/types.ts) 与 [`packages/assistant/capabilities/src/validation.ts`](../../packages/assistant/capabilities/src/validation.ts)。
