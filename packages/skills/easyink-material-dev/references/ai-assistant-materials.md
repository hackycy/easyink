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
- `bindingSpec.mode`: use `none`, `scalar`, `collection`, or `multi-scalar`. This is richer than descriptor `binding` (`none`, `single`, `multi`).
- `bindingSpec.accepts`: match runtime data shape. Array/detail-list materials should set `types: ['array']`, `isArray: true`, and often `minChildren`.
- `bindingSpec.produces`: describe the binding shape Assistant should emit, such as `scalar-field` or `collection-repeat`.
- `sizing`: values are in mm. Match factory defaults and real minimums. `growAxis` should reflect measurement/layout behavior.
- `fitness`: use stable scenario IDs already present in examples or scenario templates when possible; scores >= 0.8 appear as "Best for" in prompt context.
- `properties`: optional structured property specs. Add only when the plain `properties` string list is not enough.

If `knowledge` is omitted, Assistant can still synthesize minimal knowledge from `binding` and `properties`, but selection, sizing, binding, and compatibility will be weaker.

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
   - `buildLayoutMaterialContext()` lists type, binding, children, and sizing.
   - `buildMaterialContext()` includes category, properties, required props, binding, bindingSpec, sizing, composability, fitness, usage, schemaRules, and examples.
   - schema repair uses the same material context and must not invent unregistered types.
5. Composer Agent:
   - `createRegistryFromManifest()` builds `MaterialKnowledgeRegistry`.
   - material tools answer `query_material`, `get_binding_spec`, `check_compatibility`, and `get_material_sizing`.

## Review Checklist

- `type` exactly matches the canonical material type and factory default.
- `properties` names exist in `node.props` or material-owned top-level schema structures.
- `requiredProps` are truly required by the renderer or schema generator.
- Descriptor `binding` and `knowledge.bindingSpec.mode` match actual binding behavior.
- Array/detail-list materials use collection binding and examples with slash-separated child paths.
- `schemaRules` forbid legacy aliases or deprecated shapes when the material has specialized schema.
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
- Generated elements are too small: `knowledge.sizing` or prompt examples disagree with factory defaults.
- Custom material works in Designer but not Assistant: missing `aiDescriptor` on the Designer material entry.
