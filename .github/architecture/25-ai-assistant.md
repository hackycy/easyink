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
│  │ + plugins[] → Assistant plugin center                  │ │
│  └────────────────────────────┬───────────────────────────┘ │
└───────────────────────────────┼─────────────────────────────┘
                                │ HTTP / in-process
                                │ AssistantTaskInput
                                │ { materialManifest, pluginSelection }
                                ▼
┌─────────────────────────────────────────────────────────────┐
│  Orchestrator Service                                       │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ LangGraph Pipeline (linear)                          │   │
│  │ Intake→Source→Planner→Contract→Materials→Layout      │   │
│  │ →Schema→Validate→Repair→Review                       │   │
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
  plugins/            # Assistant 插件协议（manifest/action/result/context）
  plugin-placeholder-images/   # 官方可选插件：Picsum 占位图提示词
  plugin-prototype-designer/   # 官方可选插件：专业原型设计师角色
  plugin-receipt-designer/     # 官方可选插件：专业小票设计师角色
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
         plugins ───────────────┤
         tool-registry ─────────┘
```

Designer 不依赖任何 assistant 包。assistant-designer-bridge 单向注入 Designer 的 Contribution 数组。

官方插件包不由 `designer-bridge` 默认注册。宿主需要显式传入 `createAssistantContribution({ plugins })`，以便按产品场景选择启用哪些官方或第三方插件。

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
    composability: { canBeChildOf: ['*'], canContain: [], ... },
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
5a. 线性管道：buildMaterialIndexContext() 生成轻量物料索引
      ↓
5b. Material Router Agent 选择本次任务需要的最小物料集合
      ↓
5c. selectMaterialManifest() 裁剪出 selected manifest
      ↓
5d. Layout/Schema/Repair 只加载 selected manifest 的详细物料上下文
5e. ComposerAgent：createRegistryFromManifest() 构建运行时 registry
```

### 25.4.1 渐进式物料加载（线性管道）

线性管道不再把所有注册物料的完整 `knowledge` 一次性注入 Schema Agent。物料消费分两段：

1. `buildMaterialIndexContext()` 为 Material Router Agent 提供轻量索引，只包含选型所需的名称、类型、分类、能力、绑定概要、场景适配和简短描述。
2. Material Router Agent 输出 `selectedMaterials`，`selectMaterialManifest()` 根据这些类型裁剪 manifest。
3. `buildLayoutMaterialContext()` / `buildMaterialContext()` 只把 selected manifest 的详细使用规则交给 Layout、Schema 和 Repair。

详细物料上下文包含：

- `category` → 物料分类标签
- `bindingSpec.mode` + `accepts` + `produces` → 绑定模式说明
- `sizing.defaultSize` + `minWidth/minHeight` + `growAxis` → 尺寸参考
- `composability.canContain` + `preferredCompanions` → 组合建议
- `fitness` → 按当前 scenario 过滤匹配项 + 高分项作为 "Best for" 推荐

因此，注册物料数量增加时，Orchestrator 的 prompt 规模主要受本次任务选中的物料集合影响，而不是受全局物料注册表线性放大。

### 25.4.2 Registry 构建（ComposerAgent）

`createRegistryFromManifest()` 在 `material-knowledge/src/from-manifest.ts` 中：

1. 遍历 manifest.materials
2. 有 `knowledge` 字段 → 直接构建 `MaterialKnowledge` 注册到 registry
3. 无 `knowledge` 但有 `ai` → `synthesizeFromDescriptor()` 推断最小知识
4. 都没有 → 跳过

Registry 供 ToolRegistry 中的工具使用：`query_material`、`check_bounds`、`align_fields` 等。

## 25.5 Assistant 插件系统

插件系统用于在不改 Orchestrator 核心流程的前提下，为 Assistant 注入可选的提示词、角色、策略、外部上下文和用户选择结果。

### 25.5.1 协议边界

插件协议定义在 `packages/assistant/plugins`。插件不是固定的素材库 Provider，也不控制 Assistant UI；插件只声明元数据和可选动作，动作以 Promise 返回结构化结果：

```ts
interface AssistantPlugin {
  manifest: AssistantPluginManifest
  invoke?: (request: AssistantPluginInvokeRequest) => Promise<AssistantPluginResult>
}

interface AssistantPluginManifest {
  id: string
  name: string
  version: string
  category?: string
  defaultEnabled?: boolean
  staticContributions?: AssistantPluginContribution[]
  actions?: AssistantPluginAction[]
}

interface AssistantPluginResult {
  contributions?: AssistantPluginContribution[]
  contextItems?: AssistantPluginContextItem[]
  state?: unknown
  warnings?: string[]
}
```

设计约束：

- 插件中心只负责展示、启用、调用动作和收集结果。
- 第三方 UI、素材选择器、保存提示词选择器等由插件或宿主自行处理，Assistant 只接收 Promise 结果。
- `contextItems.kind` 是开放字符串，图片素材、保存提示词、品牌规范、参考链接都只是上下文条目的一种。
- 第一阶段只支持 prompt/context 注入，不允许插件注册任意执行代码进入 Orchestrator。

### 25.5.2 任务输入

`AssistantTaskInput` 增加 `pluginSelection`：

```ts
interface AssistantTaskInput {
  prompt: string
  source?: AssistantSourceInput
  currentSchema?: unknown
  materialManifest?: AssistantMaterialManifest
  pluginSelection?: AssistantPluginSelection
}
```

UI 在提交任务时，将已启用插件的 `staticContributions` 与 `invoke()` 返回的 `contributions/contextItems/warnings/state` 合并为 `pluginSelection`。任务记录保存的是结构化结果，不保存插件实现。

### 25.5.3 插件中心 UI

插件中心是 Assistant 面板内部与历史、设置同级的视图：

- 入口位于 Composer 工具区，仅当宿主传入 `plugins.length > 0` 时显示。
- 列表展示 `manifest.name / description / category`。
- 每个插件通过开关启用或停用。
- `manifest.actions` 渲染为动作按钮；点击后调用 `plugin.invoke()`。
- 动作返回的 `contextItems` 和贡献数量在卡片内展示为摘要。
- 启用状态和动作结果由浏览器侧本地持久化；提交任务时再编译进 `pluginSelection`。

插件列表不再为每个插件显示统一图标，避免官方和第三方插件视觉重复。

### 25.5.4 Orchestrator 注入

Orchestrator 使用 `buildAssistantPluginContext(selection, { target })` 将启用插件编译为 Prompt 片段。注入点按 Agent 阶段分发：

| target | 注入位置 | 典型用途 |
|--------|----------|----------|
| `intake` | Intake Agent | 判断是否需要澄清时的领域约束 |
| `planner` | Planner Agent | 专业角色、场景推断、页面偏好 |
| `contract` | Contract Agent | 数据契约命名和字段偏好 |
| `materials` | Material Router Agent | 物料偏好、能力过滤、强制或规避某类物料 |
| `layout` | Layout Agent | 版式策略、空间组织、密度要求 |
| `schema` | Schema Agent | 生成规则、素材引用、占位图规则 |
| `repair` | Validator/Repair Agent | 修复时必须保留或修正的约束 |
| `all` | 所有目标 | 全局规则 |

冲突处理仍遵循 Schema prompt 中的优先级：用户当前 prompt 最高，其次是 planningBrief，再是 currentSchema。插件贡献应作为上下文和偏好，不应覆盖用户明确要求。

### 25.5.5 官方插件分包

官方插件以独立包发布，宿主按需注册：

```ts
import { createAssistantContribution } from '@easyink/assistant-designer-bridge'
import { placeholderImagesPlugin } from '@easyink/assistant-plugin-placeholder-images'
import { prototypeDesignerPlugin } from '@easyink/assistant-plugin-prototype-designer'
import { receiptDesignerPlugin } from '@easyink/assistant-plugin-receipt-designer'

createAssistantContribution({
  plugins: [
    placeholderImagesPlugin,
    prototypeDesignerPlugin,
    receiptDesignerPlugin,
  ],
})
```

官方插件职责：

| 包 | 插件 | 能力 |
|----|------|------|
| `@easyink/assistant-plugin-placeholder-images` | 占位图助手 | 原型/H5/海报缺少图片素材时，提示 Schema Agent 使用 `https://picsum.photos/{width}/{height}` |
| `@easyink/assistant-plugin-prototype-designer` | 专业原型设计师 | 强化屏幕原型、H5、产品 UI 的页面单位、层级、占位内容和视觉完整度 |
| `@easyink/assistant-plugin-receipt-designer` | 专业小票设计师 | 强化热敏小票的连续纸、窄纸宽、金额对齐、信息密度和打印可读性 |

接入方式和运行示例见 [docs/designer/assistant.md](../../docs/designer/assistant.md)。

## 25.6 Orchestrator 工作流

### 25.6.1 线性管道（LangGraph）

```
Intake → Source → Planner → Contract → Materials → Layout → Schema → Validate → Repair → Review
```

| Agent | 职责 |
|-------|------|
| Intake | 判断是否需要澄清 |
| Source | 解析外部数据源，提取字段语义 |
| Planner | 推断文档意图、scenario、unit、页面约束、所需区块 |
| Contract | 定义数据契约（字段树 + sampleData） |
| Materials | 基于轻量物料索引选择本次模板需要的最小 Designer 物料集合，并生成 selected manifest |
| Layout | 规划空间布局骨架 |
| Schema | 生成完整 DocumentSchema + expectedDataSource |
| Validate | 校验 Schema 合法性 |
| Repair | 自动修复校验错误（最多 3 轮） |
| Review | 最终确认 |

### 25.6.2 ComposerAgent（ReAct 模式）

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

## 25.7 知识与推理层

### 25.7.0 Scenario 驱动的 Prompt 组装

线性管道的 Schema Agent prompt 不再硬编码打印场景假设，而是根据 Planner 推断的 `scenario` + `unit` + `page.mode` 动态组装规则片段。

#### 核心数据流

```
用户 prompt
    ↓
Source → 解析外部数据源
    ↓
Planner → 推断 scenario (自由字符串) + page.unit (mm|px|pt) + page.mode (fixed|continuous)
    ↓
Contract → 定义字段树与 sampleData
    ↓
Material Router → 读取轻量物料索引，输出 selected manifest
    ↓
buildPromptContext(planningBrief) → PromptContext { unit, mode, scenario }
    ↓
buildSchemaSystemPrompt(selectedMaterialContext, ctx) → 按 unit/mode 和已选物料组装规则片段
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
| `buildMaterialSelectionSegment(scenario)` | 配合 selected material context 强化场景适配 | 物料选择 |
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

物料通过 `knowledge.fitness` 声明适用场景。`buildMaterialIndexContext()` 会把 fitness 摘要放进轻量索引，Material Router Agent 先用它选择候选物料；随后 `buildMaterialContext()` 只对 selected manifest 展开详细规则，并继续优先展示当前 scenario 匹配项：

```ts
// scenario 匹配时，展示该 scenario 的 fitness + 所有高分项
const top = scenario
  ? knowledge.fitness.filter(f => f.scenario === scenario || f.score >= 0.8)
  : knowledge.fitness.filter(f => f.score >= 0.8)
```

新场景只需物料在 `fitness` 数组中添加对应条目，无需修改 orchestrator 代码。Material Router 会先感知这些适配信息，再决定是否加载该物料的完整使用说明。

### 25.7.1 material-knowledge

纯运行时包，不含硬编码物料数据：

- `MaterialKnowledgeRegistry` — 注册表（register、query、checkCompatibility、forScenario）
- `createRegistryFromManifest(manifest)` — 从 manifest 动态构建 registry
- 类型定义（MaterialKnowledge、MaterialConstraint 等）

### 25.7.2 constraint-engine

可执行约束引擎，提供实时验证和自动修复：

- 通用约束（必填属性、尺寸下限）
- 物料特定约束（table-data topology、flow-row columns）
- `check()` + `autoFix()` 函数式约束

### 25.7.3 schema-builder

Schema 构建 DSL，供 ComposerAgent 的工具调用：

- `emitText()` / `emitTableData()` / `emitTableStatic()` / `emitElement()`
- 即时验证（每次 emit 后检查约束）
- `buildSchema()` 输出最终 DocumentSchema

### 25.7.4 type-aligner

类型驱动数据对齐：

- `infer(sample, name)` — 从样本数据推断字段签名
- `demand(materialType)` — 获取物料的数据需求
- `align(signature, demand)` — 对齐字段
- `generateBindings(signature, materialType)` — 自动生成 binding 路径

### 25.7.5 scenario-templates

场景模板库：

- `ScenarioClassifier.classify(prompt)` — 从用户 prompt 分类场景
- `getFocusedContext(scenario)` — 获取场景的渐进式上下文（骨架、物料建议）

### 25.7.6 tool-registry

Agent 工具注册表：

- `ToolDefinition` — 工具定义（name、parameters、execute）
- `ToolRegistry` — 注册、查找、执行、生成 manifest
- 工厂函数：`createMaterialTools`、`createDataTools`、`createLayoutTools`、`createSchemaTools`

## 25.8 Designer Bridge

通过 Contribution 机制接入 Designer（详见 [23-contribution](./23-contribution.md)）。

`createAssistantContribution()` 注册：

- 命令：`assistant.open`、`assistant.close`、`assistant.applyResult`、`assistant.applyPatch`、`assistant.rollback` 等
- 工具栏按钮：AI 助手开关
- 面板：异步加载的 AssistantPanel
- 可选插件：`plugins?: AssistantPlugin[]`，透传给 Assistant UI 的插件中心

关键设计：`materialManifest` 通过 getter 实现响应式传递。用户注册新物料后，面板下次读取时自动获得最新完整 manifest（含 knowledge）；Orchestrator 再在每个任务内通过 Material Router 裁剪出本次生成需要的 selected manifest。

## 25.9 技术选型

| 能力 | 选型 | 落地包 |
|------|------|--------|
| Agent 编排 | LangGraph.js | orchestrator |
| HTTP 服务 | Hono | orchestrator |
| 输入/输出校验 | Zod | 全部 assistant 包 |
| LLM 接入 | 官方 SDK + assistant/llm 适配 | llm |
| 日志 | pino | orchestrator |
| 测试 | Vitest | 全部 assistant 包 |

## 25.10 与周边架构的关系

- `@easyink/schema-tools`：继续保留，被 orchestrator 和 capabilities 消费
- Contribution 机制：继续使用，是 assistant 接入 Designer 的唯一通道
- Assistant 插件系统：仅增强 Assistant 任务上下文，不替代 Designer Contribution、物料注册或导出插件体系

如果你要从产品接入角度开始，先看 [Designer Assistant 教程](../../docs/designer/assistant.md)；如果你要改协议、改 Orchestrator 或改插件注入规则，再回到本架构文档对齐边界。
