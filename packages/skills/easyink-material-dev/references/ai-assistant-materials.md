# AI and Assistant Material Knowledge

Use this reference when a material should be generated, selected, repaired, or reasoned about by EasyInk Assistant.

## Current Implementation Map

- `packages/shared/src/ai-generation.ts`: source types for `AIMaterialDescriptor` and `MaterialKnowledgeDescriptor`.
- `packages/designer/src/materials/registry.ts`: stores each registered Designer material's optional `aiDescriptor`.
- `packages/builtin/src/designer.ts`: built-in Designer registration must pass `aiDescriptor` on the material entry.
- `packages/builtin/src/ai.ts`: built-in descriptor list used by Assistant material knowledge consumers.
- `packages/assistant/designer-bridge/src/material-manifest.ts`: exports the live Designer store as `AssistantMaterialManifest`; props are serialized and `material.aiDescriptor` becomes `manifest.materials[].ai`.
- `packages/assistant/designer-bridge/src/contribution.ts`: passes `materialManifest` through a getter so Assistant sees newly registered materials without restart.
- `packages/assistant/capabilities/src/types.ts`: runtime zod shape for `AssistantMaterialManifest` and `AssistantAIMaterialDescriptorSchema`.
- `packages/assistant/orchestrator/src/prompts.ts`: linear Assistant pipeline turns manifest `ai` and `ai.knowledge` into layout/schema/repair prompts.
- `packages/assistant/material-knowledge/src/from-manifest.ts`: builds `MaterialKnowledgeRegistry` from `entry.knowledge` or `entry.ai.knowledge`, falling back to synthesized minimal knowledge from plain `ai`.
- `packages/assistant/tool-registry/src/tools/material-tools.ts`: exposes registry-backed material queries, binding specs, compatibility, and sizing.
- `packages/assistant/orchestrator/src/composer/agent.ts`: Composer Agent builds a registry from `input.materialManifest` and calls material/data/layout/schema tools.

Useful architecture docs:

- `.github/architecture/25-ai-assistant.md`
- `docs/advanced/custom-materials.md#ai-knowledge`
- `docs/advanced/contributions.md` for reactive manifest passing from Designer contributions.

## Descriptor Shape

Every AI-visible material should have `src/ai.ts`:

```ts
import type { AIMaterialDescriptor } from '@easyink/shared'

export const xAIMaterialDescriptor = {
  type: X_TYPE,
  description: 'Short concrete purpose.',
  properties: ['content', 'fontSize'],
  requiredProps: ['content'],
  binding: 'single',
  usage: [
    'Use for scalar labels or values.',
    'Use props.content for static text and binding for runtime values.',
  ],
  schemaRules: [
    'Do not use legacy aliases.',
  ],
  examples: [
    { content: 'Example', fontSize: 4.23 },
  ],
  knowledge: {
    category: 'typography',
    composability: {
      canBeChildOf: ['container', '*'],
      canContain: [],
      exclusiveWith: [],
      preferredCompanions: ['line'],
    },
    bindingSpec: {
      mode: 'scalar',
      accepts: { types: ['string', 'number'], isArray: false },
      produces: { kind: 'scalar-field', fieldCount: 'single', pathPattern: '{fieldPath}' },
    },
    sizing: {
      minWidth: 10,
      minHeight: 4,
      growAxis: 'y',
      defaultSize: { width: 40, height: 6 },
    },
    fitness: [
      { scenario: 'key-value-pair', score: 0.9, reason: 'scalar field display' },
    ],
  },
} satisfies AIMaterialDescriptor
```

Keep `description`, `usage`, `schemaRules`, `examples`, and `knowledge` short and deterministic. They are prompt input, not user docs.

## Knowledge Semantics

- `category`: one of `data`, `layout`, `decoration`, `typography`, `visualization`; used in prompts and registry queries.
- `composability.canBeChildOf`: include `'*'` only when the material really works at top level or in any container-like parent.
- `composability.canContain`: list child material types only when the schema and Designer/Viewer support children.
- `bindingSpec.mode`: use `none`, `scalar`, `collection`, or `multi-scalar`. This is richer than descriptor `binding` (`none`, `single`, `multi`, `data-contract`).
- `bindingSpec.accepts`: match runtime data shape. Array/detail-list materials should set `types: ['array']`, `isArray: true`, and often `minChildren`.
- `bindingSpec.produces`: describe the binding shape Assistant should emit, such as `scalar-field`, `collection-repeat`, or a `data-contract` mappings shape.
- `sizing`: values are in mm. Match factory defaults and real minimums. `growAxis` should reflect measurement/layout behavior.
- `fitness`: scenario-based scoring that drives material selection. See "Fitness and Scenario Coverage" below.
- `properties`: optional structured property specs. Add only when the plain `properties` string list is not enough.

If `knowledge` is omitted, Assistant can still synthesize minimal knowledge from `binding` and `properties`, but selection, sizing, binding, and compatibility will be weaker.

## Fitness and Scenario Coverage

The `fitness` array declares which document scenarios a material is suitable for. The orchestrator's Planner Agent infers a free-form `scenario` string from the user's prompt, and `buildMaterialContext()` uses it to prioritize materials whose fitness matches.

### How it works

1. Planner infers `scenario` (e.g. `'invoice'`, `'h5-landing'`, `'poster'`, `'prototype'`).
2. `buildMaterialContext(manifest, scenario)` filters each material's fitness:
   - If scenario is set: show entries matching that scenario + all entries with score >= 0.8.
   - If no scenario: show entries with score >= 0.8.
3. Matching fitness entries appear as "Best for: ..." in the Schema Agent prompt.

### Scenario naming conventions

Use stable, lowercase, hyphenated scenario IDs:

| Category | Scenarios |
|----------|-----------|
| Print/business | `invoice`, `receipt`, `report`, `certificate`, `label`, `shipping-label`, `product-label` |
| Screen/digital | `h5-landing`, `poster`, `prototype`, `dashboard` |
| Structural | `invoice-header`, `invoice-items`, `receipt-items`, `receipt-footer`, `key-value-pair`, `grouped-elements` |

New scenarios can be added freely. The system does not validate scenario strings against a fixed enum.

### Adding fitness to a material

```ts
// in knowledge.fitness array:
const fitness = [
  // Print scenarios
  { scenario: 'invoice-header', score: 0.9, reason: 'titles and labels' },
  // Screen scenarios
  { scenario: 'h5-landing', score: 0.85, reason: 'headings and call-to-action text' },
  { scenario: 'poster', score: 0.9, reason: 'title and body copy' },
  { scenario: 'prototype', score: 0.85, reason: 'UI labels and placeholder text' },
]
```

### Guidelines

- Score 0.9-1.0: primary/best choice for this scenario.
- Score 0.7-0.89: works well but another material may be better.
- Score 0.5-0.69: usable but not ideal.
- Below 0.5: don't list it; absence means "not recommended".
- Every material should cover both print and screen scenarios where applicable.
- `reason` should be one short phrase explaining WHY the material fits, not WHAT it does.

### Unit awareness

The Planner also infers `page.unit` (`mm` | `px` | `pt`) based on the scenario:
- Print scenarios → `mm` (default)
- Screen scenarios → `px`

The `sizing` field in knowledge is always declared in mm (internal reference). The prompt system converts sizing references to the active unit when presenting to the LLM. Materials do not need to declare px-based sizing separately.

## Registration Rules

Built-in materials:

1. Export `xAIMaterialDescriptor` from the material package.
2. Add `aiDescriptor: xAIMaterialDescriptor` to the material entry in `packages/builtin/src/designer.ts`.
3. Add the descriptor to `builtinAIMaterialDescriptors` in `packages/builtin/src/ai.ts`.
4. Keep Designer capabilities, prop schemas, Viewer behavior, and AI descriptor claims aligned.

Custom host materials:

1. Pass `aiDescriptor` on the `registerMaterialBundle()` material entry.
2. Register the matching Viewer material in the host.
3. Do not depend on `packages/builtin/src/ai.ts`; live Assistant sees the Designer store manifest through `createAssistantMaterialManifest()`.
4. Provide host locale messages for any Designer-facing labels in prop schemas or material UI.

## Assistant Data Flow

Current flow:

1. Material registration stores `aiDescriptor`.
2. `createAssistantMaterialManifest(store)` emits `{ type, name, capabilities, props, ai }`.
3. `AssistantPanel` sends `materialManifest` with each task.
4. Linear pipeline:
   - Planner infers `scenario` (free string) and `page.unit` (`mm` | `px` | `pt`) from user prompt.
   - `buildMaterialContext(manifest, scenario)` includes category, properties, required props, binding, bindingSpec, sizing, composability, fitness (filtered by scenario), usage, schemaRules, and examples.
   - `buildSchemaSystemPrompt(materialContext, ctx)` assembles prompt segments based on `PromptContext { unit, mode, scenario }`.
   - `buildLayoutMaterialContext()` lists type, binding, children, and sizing.
   - Schema repair uses the same material context and prompt context; must not invent unregistered types.
5. Composer Agent:
   - `createRegistryFromManifest()` builds `MaterialKnowledgeRegistry`.
   - material tools answer `query_material`, `get_binding_spec`, `check_compatibility`, and `get_material_sizing`.

## Review Checklist

- `type` exactly matches the canonical material type and factory default.
- `properties` names exist in `node.props` or material-owned top-level schema structures.
- `requiredProps` are truly required by the renderer or schema generator.
- Descriptor `binding` and `knowledge.bindingSpec.mode` match actual binding behavior.
- Data-contract materials set descriptor `binding: 'data-contract'`, include examples with `binding.kind='data-contract'`, and preserve full source paths in `mappings.*.select.path`.
- Array/detail-list materials use collection binding and examples with slash-separated child paths.
- `schemaRules` describe the canonical schema shape when the material has specialized schema.
- `knowledge.sizing.defaultSize` matches `createXNode()` defaults in mm.
- `knowledge.sizing.growAxis` matches Viewer `measure()` and page layout behavior.
- `composability` does not promise child support unless the material supports children end to end.
- Built-ins are registered in Designer, Viewer, and `packages/builtin/src/ai.ts` when Assistant should see them.
- Custom materials register `aiDescriptor` with Designer.
- Assistant manifest tests cover descriptor preservation when changing serialization behavior.

## Failure Signals

- Assistant invents `table`, `rich-text`, or other aliases: descriptor/context is missing or schemaRules are too weak.
- Assistant chooses a decorative material for data: category, bindingSpec, or fitness is misleading.
- Assistant emits a scalar binding for array data: `binding` or `knowledge.bindingSpec.mode` is wrong.
- Assistant misses target-field mappings for chart-like data: data-contract descriptor examples or schemaRules are incomplete.
- Generated elements are too small: `knowledge.sizing` or prompt examples disagree with factory defaults.
- Custom material works in Designer but not Assistant: missing `aiDescriptor` on the Designer material entry.
