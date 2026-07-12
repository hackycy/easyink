# 6. 渲染管线

Viewer 消费 `CompiledMaterialProfile`，不从 Designer 实例复制物料，也不接受运行时可变物料注册表。宿主在创建 Viewer 前编译 profile，并把同一个 profile 边界用于加载、facet 激活与渲染。

## 6.1 阶段

当前可执行顺序为：

1. `loadDocumentWithProfile()`：按 `envelope -> resolve -> validate-input -> migrate -> normalize -> validate -> introspect -> graph` 准入并产生 sidecar。
2. binding/condition projection：只处理 ready 节点和 manifest 声明的 binding ports。
3. `runLayoutPipeline()`：读取公共 placement、repeat 和 break 约束。
4. `runPagination()`：安排页面与已提供的 fragment paginator。
5. `MaterialFacetHost`：按 `(profile, material type, surface)` 激活 Viewer facet。
6. material render tree -> browser capability -> DOM mount。

`common.layout.fragmentation = 'break-opportunities'` 只声明 core 可调度能力；完整 break API 与 Viewer layout 接线属于后续 Viewer Layout 计划。Foundation 不虚构尚未存在的分页协议。

## 6.2 Surface intersection

profile 分别发布 `editableTypes / renderableTypes / generatableTypes`。Designer 只消费 designer surface，Viewer 只消费 viewer surface；AI generation 只在 designer、viewer 与启用的 AI facet 三者交集内成立。一个 surface 激活失败只隔离对应 facet，不污染其他物料或 surface。

## 6.3 安全 render tree

物料返回语义 `ViewerRenderTree`，不能返回 HTML 字符串。普通节点由 `viewerElement / viewerText / viewerFragment` 构造，并接受深度、节点数、属性和文本预算。

SVG/markup 必须先由当前 browser capability 生成不透明 `SanitizedMarkup` token，再由同一 capability store 消费；token 不能跨 store、跨 document 或重复使用。imperative DOM 需要 manifest facet 与 host 双方声明同名 capability，mount 第一次调用必须返回 disposer。

`RenderSurface` 对 mount 逆序清理，失败仍继续其余 disposer；嵌套 material 拥有独立 capability scope 和共享总预算。facet 实例由 `MaterialFacetHost` 管理，render mount 不负责销毁共享 facet。

实现入口见 [`packages/viewer/src/runtime.ts`](../../packages/viewer/src/runtime.ts)、[`packages/viewer/src/render-surface.ts`](../../packages/viewer/src/render-surface.ts) 与 [`packages/browser-dom/src/render-viewer-tree.ts`](../../packages/browser-dom/src/render-viewer-tree.ts)。
