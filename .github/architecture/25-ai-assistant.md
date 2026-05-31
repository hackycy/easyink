# 25. AI Assistant 平台

本文档描述 EasyInk AI Assistant 平台的实际实现架构：从物料知识声明到 Agent 驱动的模板生成全链路。

> 本文替代旧版设计规划文档，反映当前已落地的实现。

## 25.1 架构总览

```
┌─────────────────────────────────────────────────────────────┐
│  Designer (Vue)                                             │
│  ┌───────────────────┐  ┌─────────────────────────────────┐ │
│  │ MaterialRegistry  │  │ ContributionRegistry            │ │
│  │ (物料 + knowledge)│  │ (assistant contribution)        │ │
│  └────────┬──────────┘  └──────────────┬──────────────────┘ │
│           │                            │                    │
│           ▼                            ▼                    │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ designer-bridge: createAssistantMaterialManifest()     │ │
│  │ → materialManifest { materials[].ai.knowledge }        │ │
│  └────────────────────────────┬───────────────────────────┘ │
└───────────────────────────────┼─────────────────────────────┘
                                │ HTTP / in-process
                                ▼
┌─────────────────────────────────────────────────────────────┐
│  Orchestrator Service                                       │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ LangGraph Pipeline (linear)                          │   │
│  │ Intake→Planner→Source→Contract→Layout→Schema→Repair  │   │
│  └──────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ ComposerAgent (ReAct loop + Tool Use)                │   │
│  │ → createRegistryFromManifest(manifest)               │   │
│  │ → ToolRegistry → SchemaBuilder → TypeAligner         │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

## 25.2 包结构

```text
packages/assistant/
  orchestrator/       # 主服务：LangGraph 管道 + ComposerAgent + Hono HTTP
  material-knowledge/ # 物料知识注册表运行时（registry + createRegistryFromManifest）
  constraint-engine/  # 可执行约束引擎（验证 + 自动修复）
  schema-builder/     # Schema 构建 DSL（高层工具 + 即时验证）
  type-aligner/       # 类型驱动数据对齐（自动 binding 生成）
  scenario-templates/ # 场景模板库（分类器 + 渐进式上下文）
  tool-registry/      # Agent 工具注册表
  llm/                # Provider 无关的 LLM 网关
  capabilities/       # Schema 验证、diff、patch、preview
  adapters/           # 外部数据源适配器
  store/              # 任务、版本、草稿存储
  designer-bridge/    # Designer Contribution 桥接
  ui/                 # Vue 任务面板 UI
```

### 25.2.1 依赖方向

```
designer ← designer-bridge ← orchestrator
                                ↑
         material-knowledge ────┤
         constraint-engine ─────┤
         schema-builder ────────┤
         type-aligner ──────────┤
         scenario-templates ────┤
         tool-registry ─────────┘
```

Designer 不依赖任何 assistant 包。assistant-designer-bridge 单向注入 Designer 的 Contribution 数组。

## 25.3 物料知识声明

每个物料在 `ai.ts` 中通过 `AIMaterialDescriptor.knowledge` 声明结构化知识：

```ts
// packages/materials/text/src/ai.ts
import type { AIMaterialDescriptor } from '@easyink/shared'

export const textAIMaterialDescriptor = {
  type: 'text',
  description: '...',
  properties: [...],
  binding: 'single',
  knowledge: {
    category: 'typography',
    composability: { canBeChildOf: ['container', '*'], canContain: [], ... },
    bindingSpec: { mode: 'scalar', accepts: { types: ['string', 'number'] }, ... },
    sizing: { minWidth: 10, minHeight: 4, defaultSize: { width: 40, height: 6 } },
    fitness: [{ scenario: 'invoice-header', score: 0.9, reason: '...' }],
  },
} satisfies AIMaterialDescriptor
```

### 25.3.1 MaterialKnowledgeDescriptor 类型

定义在 `packages/shared/src/ai-generation.ts`：

| 字段 | 类型 | 作用 |
|------|------|------|
| `category` | `'data' \| 'layout' \| 'decoration' \| 'typography' \| 'visualization'` | 物料分类 |
| `composability` | `{ canBeChildOf, canContain, exclusiveWith, preferredCompanions }` | 组合规则 |
| `bindingSpec` | `{ mode, accepts, produces, examples? }` | 数据绑定规格 |
| `sizing` | `{ minWidth, minHeight, aspectRatio?, growAxis?, defaultSize }` | 尺寸约束 |
| `fitness?` | `Array<{ scenario, score, reason }>` | 场景适用性评分 |
| `properties?` | `Array<{ key, type, required, ... }>` | 属性规格 |

`knowledge` 是可选的。没有声明的物料仍可被 AI 使用，系统从 `binding`、`properties` 等字段推断最小知识。

### 25.3.2 第三方物料接入

第三方物料只需在 `aiDescriptor` 中添加 `knowledge` 字段，注册后 AI 自动感知：

```ts
registerMaterialBundle(store, {
  materials: [{
    type: 'my-widget',
    aiDescriptor: myWidgetAIMaterialDescriptor,  // 含 knowledge
    ...
  }],
})
```

## 25.4 数据流：物料 → Agent

```
1. 物料 ai.ts 声明 knowledge
      ↓
2. builtin 包注册物料到 Designer（aiDescriptor 含 knowledge）
      ↓
3. designer-bridge 调用 createAssistantMaterialManifest(store)
   → material.aiDescriptor 直接作为 manifest.materials[].ai
      ↓
4. manifest 传入 Orchestrator（AssistantTaskInput.materialManifest）
      ↓
5a. 线性管道：buildMaterialContext() 将 knowledge 注入 LLM prompt
5b. ComposerAgent：createRegistryFromManifest() 构建运行时 registry
```

### 25.4.1 Prompt 注入（线性管道）

`buildMaterialContext()` 在 `orchestrator/src/prompts.ts` 中将 knowledge 格式化为 prompt：

- `category` → 物料分类标签
- `bindingSpec.mode` + `accepts` + `produces` → 绑定模式说明
- `sizing.defaultSize` + `minWidth/minHeight` + `growAxis` → 尺寸参考
- `composability.canContain` + `preferredCompanions` → 组合建议
- `fitness` → 按当前 scenario 过滤匹配项 + 高分项作为 "Best for" 推荐

### 25.4.2 Registry 构建（ComposerAgent）

`createRegistryFromManifest()` 在 `material-knowledge/src/from-manifest.ts` 中：

1. 遍历 manifest.materials
2. 有 `knowledge` 字段 → 直接构建 `MaterialKnowledge` 注册到 registry
3. 无 `knowledge` 但有 `ai` → `synthesizeFromDescriptor()` 推断最小知识
4. 都没有 → 跳过

Registry 供 ToolRegistry 中的工具使用：`query_material`、`check_bounds`、`align_fields` 等。

## 25.5 Orchestrator 工作流

### 25.5.1 线性管道（LangGraph）

```
Intake → Planner → Source → Contract → Layout → Schema → Validate → Repair → Review
```

| Agent | 职责 |
|-------|------|
| Intake | 判断是否需要澄清 |
| Planner | 推断文档意图、scenario、unit、页面约束、所需区块 |
| Source | 解析外部数据源，提取字段语义 |
| Contract | 定义数据契约（字段树 + sampleData） |
| Layout | 规划空间布局骨架 |
| Schema | 生成完整 DocumentSchema + expectedDataSource |
| Validate | 校验 Schema 合法性 |
| Repair | 自动修复校验错误（最多 3 轮） |
| Review | 最终确认 |

### 25.5.2 ComposerAgent（ReAct 模式）

ComposerAgent 是新一代生成引擎，采用 ReAct 循环 + Tool Use：

```ts
const composer = new ComposerAgent({ llm })
const result = await composer.compose({
  prompt: '生成一张商超小票',
  materialManifest: manifest,
  sourceData: sampleData,
  pageMode: 'continuous',
})
```

自动从 `materialManifest` 构建 registry，通过 ToolRegistry 暴露工具给 LLM：

- `classify_scenario` — 场景分类
- `plan_region` — 空间规划
- `query_material` — 查询适合的物料
- `infer_contract` — 推断数据契约
- `align_fields` — 对齐数据字段
- `emit_text` / `emit_table_data` / `emit_element` — 逐个生成元素
- `validate_schema` — 校验约束
- `check_bounds` — 边界检查

## 25.6 知识与推理层

### 25.6.0 Scenario 驱动的 Prompt 组装

线性管道的 Schema Agent prompt 不再硬编码打印场景假设，而是根据 Planner 推断的 `scenario` + `unit` + `page.mode` 动态组装规则片段。

#### 核心数据流

```
用户 prompt
    ↓
Planner → 推断 scenario (自由字符串) + page.unit (mm|px|pt) + page.mode (fixed|continuous)
    ↓
buildPromptContext(planningBrief) → PromptContext { unit, mode, scenario }
    ↓
buildSchemaSystemPrompt(materialContext, ctx) → 按 unit/mode 组装不同规则片段
    ↓
Schema Agent → 生成适配场景的 schema
```

#### PromptContext 接口

```ts
interface PromptContext {
  unit: 'mm' | 'px' | 'pt'
  mode: 'fixed' | 'continuous'
  scenario?: string
}
```

#### Prompt 片段化

`buildSchemaSystemPrompt()` 由以下 segment 函数组装：

| Segment | 驱动条件 | 作用 |
|---------|----------|------|
| `buildPersonaSegment(unit)` | unit=px → 屏幕设计师; unit=mm/pt → 打印设计师 | 设定 LLM 角色 |
| `buildCriticalRulesSegment(unit)` | 强制 schema.unit 与 unit 一致 | 核心约束 |
| `buildSizingSegment(unit)` | 按 unit 输出对应的字号参考和换算 | 尺寸规范 |
| `buildLayoutSanitySegment(unit, mode)` | 按 mode 输出布局策略 | 布局约束 |
| `buildMaterialSelectionSegment(scenario)` | 按 scenario 过滤 fitness 推荐 | 物料选择 |
| `buildBindingSegment()` | 通用 | 数据绑定规则 |
| `buildSchemaStructureSegment(unit)` | 按 unit 输出示例数值 | 结构示例 |

#### PlanningBrief 扩展

```ts
interface PlanningBrief {
  scenario?: string              // 自由字符串：'invoice', 'h5-landing', 'poster', 'prototype' 等
  page?: {
    unit: 'mm' | 'px' | 'pt'   // 不再固定为 'mm'
    mode?: 'fixed' | 'continuous'
    width?: number
    height?: number
    reason?: string
  }
  // ...existing fields
}
```

#### 场景推断示例

| 用户 prompt | scenario | unit | page |
|-------------|----------|------|------|
| "做一个 H5 活动页" | h5-landing | px | fixed 375x667 |
| "A4 报价单" | invoice | mm | fixed 210x297 |
| "热敏小票 58mm" | receipt | mm | continuous 58x∞ |
| "手机海报" | poster | px | fixed 1080x1920 |
| "产品标签 40x30mm" | label | mm | fixed 40x30 |

#### 物料 fitness 匹配

物料通过 `knowledge.fitness` 声明适用场景。`buildMaterialContext()` 接受 `scenario` 参数，优先展示与当前 scenario 匹配的物料：

```ts
// scenario 匹配时，展示该 scenario 的 fitness + 所有高分项
const top = scenario
  ? knowledge.fitness.filter(f => f.scenario === scenario || f.score >= 0.8)
  : knowledge.fitness.filter(f => f.score >= 0.8)
```

新场景只需物料在 `fitness` 数组中添加对应条目，无需修改 orchestrator 代码。

### 25.6.1 material-knowledge

纯运行时包，不含硬编码物料数据：

- `MaterialKnowledgeRegistry` — 注册表（register、query、checkCompatibility、forScenario）
- `createRegistryFromManifest(manifest)` — 从 manifest 动态构建 registry
- 类型定义（MaterialKnowledge、MaterialConstraint 等）

### 25.6.2 constraint-engine

可执行约束引擎，提供实时验证和自动修复：

- 通用约束（必填属性、尺寸下限）
- 物料特定约束（table-data topology、flow-row columns）
- `check()` + `autoFix()` 函数式约束

### 25.6.3 schema-builder

Schema 构建 DSL，供 ComposerAgent 的工具调用：

- `emitText()` / `emitTableData()` / `emitTableStatic()` / `emitElement()`
- 即时验证（每次 emit 后检查约束）
- `buildSchema()` 输出最终 DocumentSchema

### 25.6.4 type-aligner

类型驱动数据对齐：

- `infer(sample, name)` — 从样本数据推断字段签名
- `demand(materialType)` — 获取物料的数据需求
- `align(signature, demand)` — 对齐字段
- `generateBindings(signature, materialType)` — 自动生成 binding 路径

### 25.6.5 scenario-templates

场景模板库：

- `ScenarioClassifier.classify(prompt)` — 从用户 prompt 分类场景
- `getFocusedContext(scenario)` — 获取场景的渐进式上下文（骨架、物料建议）

### 25.6.6 tool-registry

Agent 工具注册表：

- `ToolDefinition` — 工具定义（name、parameters、execute）
- `ToolRegistry` — 注册、查找、执行、生成 manifest
- 工厂函数：`createMaterialTools`、`createDataTools`、`createLayoutTools`、`createSchemaTools`

## 25.7 Designer Bridge

通过 Contribution 机制接入 Designer（详见 [23-contribution](./23-contribution.md)）。

`createAssistantContribution()` 注册：

- 命令：`assistant.open`、`assistant.close`、`assistant.applyResult`、`assistant.applyPatch`、`assistant.rollback` 等
- 工具栏按钮：AI 助手开关
- 面板：异步加载的 AssistantPanel

关键设计：`materialManifest` 通过 getter 实现响应式传递。用户注册新物料后，面板下次读取时自动获得最新 manifest（含 knowledge）。

## 25.8 技术选型

| 能力 | 选型 | 落地包 |
|------|------|--------|
| Agent 编排 | LangGraph.js | orchestrator |
| HTTP 服务 | Hono | orchestrator |
| 输入/输出校验 | Zod | 全部 assistant 包 |
| LLM 接入 | 官方 SDK + assistant/llm 适配 | llm |
| 日志 | pino | orchestrator |
| 测试 | Vitest | 全部 assistant 包 |

## 25.9 与周边架构的关系

- `@easyink/schema-tools`：继续保留，被 orchestrator 和 capabilities 消费
- Contribution 机制：继续使用，是 assistant 接入 Designer 的唯一通道
