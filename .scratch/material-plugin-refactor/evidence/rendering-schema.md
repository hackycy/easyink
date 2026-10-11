# Schema、渲染状态与宿主装配调查

调查日期：2026-10-08。范围：当前仓库源码与已有测试；没有修改应用代码，没有执行本页列出的回归命令。
源码基线：`0b43cb752ddd13b1802bbbb0d3b2993a3a8fd3be`。
本文的“事实”来自列出的源码；“建议”是重构约束；“待验证”不能视作现有承诺。
用户已确认渐进迁移；首版保证安装失败回滚和宿主销毁清理，运行中替换后置。

## 1. Schema 冻结的准确边界

- **事实**：`DocumentSchema` 是持久化文档，`MaterialNode.type` 是开放 `string`；`props`、`binding`、`children`、`extensions`、`compat` 已有独立字段。见 [types.ts](../../../packages/schema/src/types.ts)，`DocumentSchema`（第 22 行）、`MaterialNode`（第 357 行）。
- **事实**：当前 `SCHEMA_VERSION = '1.0.0'`。见 [constants.ts](../../../packages/shared/src/constants.ts)，第 31 行。
- **事实**：`validateSchemaIssues` 校验文档、页面、条件等，没有查询物料注册表，也没有拒绝未注册 `node.type`。见 [validation.ts](../../../packages/schema/src/validation.ts)，第 97、153、163 行。
- **事实**：canonical `serializeSchema` 直接 `JSON.stringify`；`deserializeSchema` 使用 `JSON.parse`、验证和主版本兼容检查后返回原对象，不从物料定义重建节点。见同文件，第 429、437、465、471 行。
- **事实**：`normalizeDocumentSchema` 展开输入并原样保留 `elements` 数组，但重写版本为当前版本、补充默认值、规范化页面；`normalizePage` 明确选取页面字段。见 [defaults.ts](../../../packages/schema/src/defaults.ts)，第 62、258 行。
- **事实**：`MigrationRegistry.migrate` 对当前或更高主版本先校验并返回对象；旧主版本执行显式迁移函数。它与 `deserializeSchema` 的兼容判断不是同一入口。见 [migration.ts](../../../packages/schema/src/migration.ts)，第 46、78 行。
- **事实**：benchmark codec 把未知 element 字段放入 `props`，编码时再展开；未知顶层字段经 `compat.passthrough` 保存。见 [codec.ts](../../../packages/schema/src/codec.ts)，`decodeBenchmarkInput`、`decodeBenchmarkElement`、`encodeToBenchmark`、`encodeBenchmarkElement`。
- **边界**：不能把上述行为写成“任何输入字节级无损”。benchmark 解码收集 `page.*` passthrough，编码恢复循环却只恢复不以 `page.` 开头的键；表格兼容路径还会转换结构。见同文件 `knownPageKeys` 和 `Restore passthrough` 两段。
- **建议**：本轮冻结版本、节点 type/字段/存储布局及既有兼容入口；不把 plugin id、renderer id、session state、resolved props、分页虚拟节点写入 Schema。
- **建议**：“未知物料可原样保存”限定为缺少能力不会删改 canonical 节点及其 JSON 可表达的 props/binding/children/extensions/compat；默认化既有行为与历史 codec 损失单独记录。
- **建议**：冻结夹具同时保存原始输入、经既有入口规范化后的期望与序列化结果；对比语义树和明确的默认化差异，不以 JSON 排版或键顺序充当兼容性。
- **待验证**：现有测试未覆盖“未安装插件→打开→保存→重新安装”完整 Designer 路径；不能只靠 schema 包测试宣称全链路已无损。

## 2. 当前 Viewer 真实阶段

主入口是 [runtime.ts](../../../packages/viewer/src/runtime.ts) 的 `ViewerRuntime.open`（第 62 行）和 `render`（第 101 行）。

| 顺序 | 当前工作 | 必须保持的语义 |
| --- | --- | --- |
| Open | `validateSchema` → `beforeSchemaNormalize` → `normalizeDocumentSchema` | 能力缺席不能被当作 schema 无效；输入规范化不等于物料准备 |
| 1 | `resolveConditionalSchema` | 先派生 include/remove/reserve，保留原始文档作为 reflow 基线 |
| 2 | `loadFonts`，可能 await | 使用宿主 document；异步边界必须纳入本轮数据与销毁处理 |
| 3 | `resolveAllBindings` | 遍历节点，把值投影到本轮 props map；不改持久化 props |
| 4 | `beforePagePlan` | 现有 hook 的顺序及失败诊断不能静默改变 |
| 5 | `measureRuntimeElements` | 用解析后的 props 测量顶层节点；错误诊断后沿用声明尺寸 |
| 6 | `runLayoutPipeline` | 应用测量值，按原始节点位置重排，构造 LayoutFragment |
| 7 | `runPagination` | 根据策略分页，通过物料 fragment paginator 拆分超高片段 |
| 8 | `resolveRepeatedPageElements` | 将每页重复元素作为 overlay 加回，注入页号/总页数 |
| 9 | `renderPages` | 用宿主 DOM 绘制，保留独立 render-size 回调与错误占位 |

**事实**：当前没有通用物料 `prepare` 回调；`ViewerExporter.prepare` 是导出器接口，不能与拟议 RenderSession 的准备阶段混为一谈。见 [material-viewer.ts](../../../packages/core/src/material-viewer.ts) 与 [types.ts](../../../packages/viewer/src/types.ts)。
**建议**：新增 `prepare` 必须说明它消费声明节点还是条件/binding 派生节点。推荐在条件过滤、binding 投影完成后准备物料状态，测量前完成依赖就绪；不得颠倒条件先于 binding/measure/paint 的现有行为。
**事实**：条件与测量处理顶层 `schema.elements`，binding 使用 `traverseNodes` 递归；不能把本次装配层重构顺带宣称为完整嵌套容器渲染能力。见 [conditional-schema.ts](../../../packages/viewer/src/conditional-schema.ts) 第 24 行与 `runtime.ts` 第 523、579 行。

## 3. 条件、binding 与未知物料

- **事实**：`resolveConditionalSchema` 返回派生 schema、diagnostics 和 states；remove 删除本轮元素，reserve 浅拷贝为 hidden，原输入不变。见 [conditional-schema.ts](../../../packages/viewer/src/conditional-schema.ts)，第 13、42、54 行。
- **事实**：`hidden` 的 reserve 优先级高于条件配置；条件能力未声明时启用默认 remove/reserve，只有显式 `false` 关闭。见 [condition.ts](../../../packages/core/src/condition.ts)，第 28、35、113 行。
- **注意**：未注册 renderer 的 `getCondition` 同样传入 undefined，因此目前未知类型仍可执行默认条件；不要误写为“能力缺失时条件总被跳过”。见 [material-registry.ts](../../../packages/viewer/src/material-registry.ts)，`getCondition`。
- **事实**：`projectBindings` 在未声明格式时保留原始值类型；`applyBindingsToProps` 只处理 `ordinary`，按 primaryProp/indexedProps 映射，跳过 undefined，`custom`/缺失映射保持原 props。见 [binding-projector.ts](../../../packages/viewer/src/binding-projector.ts)。
- **事实**：table-data、flow-row 的集合展开与单元格 binding 是物料自身渲染逻辑，不能简化为统一 primaryProp 投影。见 [table/data/viewer.ts](../../../packages/materials/table/data/src/viewer.ts)，`expandRepeatTemplateRows`；[flow-row/viewer.ts](../../../packages/materials/flow-row/src/viewer.ts)，`resolveFlowRows` 调用。
- **事实**：未注册 renderer 返回转义类型名的 `[Unknown: type]` 占位；没有在该路径发出结构化 unknown diagnostic。`measure` 缺失返回 null，render size 缺失回退声明 width/height。见 [material-registry.ts](../../../packages/viewer/src/material-registry.ts)，第 34、42、49、87 行。
- **建议**：把未知物料的持久化保留、Designer 显示/可编辑行为、Viewer 占位/诊断分别验收；新增诊断是可见行为变化，应有稳定 code 与断言。
- **建议**：条件能力归属可以调整，但默认值、显式 false、remove/reserve、缺失数据诊断以及未知类型行为必须兼容。

## 4. Renderer 合约不能缩减为 render + measure

公共合约是 [material-viewer.ts](../../../packages/core/src/material-viewer.ts)，`MaterialViewerExtension`（第 86 行）：

| 能力 | 当前用途 | 迁移限制 |
| --- | --- | --- |
| `render` | 返回宿主 DOM 或 TrustedViewerHtml | 不假定所有物料都输出字符串 |
| `measure` | 返回 layout width/height/overflow | 保持声明尺寸与测量尺寸的区别 |
| `getRenderSize` | 返回绘制 wrapper 尺寸 | 不能用测量结果替代，否则 overflow 文本、旧 line 裁切 |
| `fragmentPaginator` | canPaginate + paginateFragment | 必须可获得本轮准备/测量状态，支持继续拆分 nextPage |
| `pageAware` | 输出每页重复元素 | 不参与流高度、页数计算；分页后获得总页数 |
| `condition` | 默认/关闭/自定义隐藏效果 | 不与是否注册 DOM renderer 隐式混淆 |

- **事实**：`renderPages` 给 renderer 传 `context.document`、原始 data、resolvedProps、pageIndex、unit、zoom；随后才调用 `getRenderSize` 构建 wrapper。见 [render-surface.ts](../../../packages/viewer/src/render-surface.ts)，第 55、81、101 行。
- **事实**：render 抛错经 `safeRender` 生成诊断和占位；目前 `getRenderSize` 调用在该保护之外。迁移可统一错误边界，但不要把它描述成既有保护。见同文件第 84、101 行。
- **事实**：text 的 `getTextRenderSize` 根据 visible overflow/nowrap 放大绘制范围；这和 auto-height 的布局测量是两个问题。见 [text/viewer.ts](../../../packages/materials/text/src/viewer.ts)，第 31、42 行。
- **事实**：line 用 `getLineRenderSize` 支持旧模板 height=0、lineWidth 作为厚度。见 [line/viewer.ts](../../../packages/materials/line/src/viewer.ts)，第 31、35、53 行。
- **事实**：flow-row 在 measure/render 两次调用 `resolveFlowRows`，测量高度至少保留声明 frame；准备状态复用可以优化，但不能改变该下限。见 [flow-row/viewer.ts](../../../packages/materials/flow-row/src/viewer.ts)。
- **事实**：page-number 从 resolved props 读取 `__pageNumber`/`__totalPages`。这些是运行时注入值，不应持久化。见 [page-number/viewer.ts](../../../packages/materials/page-number/src/viewer.ts) 第 13 行与 `runtime.ts` 第 476 行。
- **事实**：barcode 用 `context.document` 创建节点，确保 iframe 文档归属。见 [barcode/viewer.ts](../../../packages/materials/barcode/src/viewer.ts)，第 24、28 行。
- **事实**：chart Viewer 的 SVG 生成会创建 ECharts SSR 实例并立即 dispose；Designer mount 则持有 ResizeObserver、animation frame 和实例句柄。两种资源生命周期不同。见 [chart/kernel/core.ts](../../../packages/materials/chart/kernel/src/core.ts)，第 17、46 行。

## 5. LayoutFragment、重排和分页

- **事实**：`LayoutFragment` 含 id、sourceNodeId、node、box、flow、measured；sourceNodeId 与片段 id 不是同一身份。见 [layout-plan.ts](../../../packages/core/src/layout-plan.ts)，第 23、63 行。
- **事实**：flow 信息来自新 `placement`/`break` 字段及旧 props 回退；每页重复来自 `repeat.scope` 或物料 pageAware。见同文件 `readNodeFlowConstraints`、`readNodeRepeatScope`。
- **事实**：`runLayoutPipeline` 先浅拷贝应用测量尺寸，再用 `originalSchema` 重排；构造 fragment 时保留测量结果。见 [layout-strategy.ts](../../../packages/core/src/layout-strategy.ts)，第 12、36 行。
- **事实**：`runFlowYReflow` 使用原始 y/x 次序、同 y band、累积高度差；条件移除会贡献负高度差，fixed 节点不位移，新发生的重叠产生诊断。见 [reflow-engine.ts](../../../packages/core/src/reflow-engine.ts)，第 27 行。
- **事实**：auto-sheets 的 while 循环可对返回的 nextPage 再次分页，移动 fragment 时同时更新 node.y/box.y。见 [pagination-engine.ts](../../../packages/core/src/pagination-engine.ts)，第 111、141、155、290 行。
- **事实**：fixed-sheets 的越界只诊断，continuous-paper 不按显式 break 切页且可保留原模板尾部间距。不能只覆盖 auto-sheets。见同文件 `createFixedSheets`、`createContinuousSheet`。
- **事实**：当前 `toPagePlan` 最终转为 page.elements，后续渲染主要读取 node；新状态若只存在 fragment 而未在该桥接保留，会在渲染阶段丢失。见 [runtime.ts](../../../packages/viewer/src/runtime.ts)，`toPagePlan`。
- **建议**：所有虚拟片段须有稳定源节点身份、独立片段身份、渲染 state 引用和页上下文；复制/移动/再分页/最终 plan 适配均有明确传递规则。
- **建议**：虚拟片段也要继承源节点本轮 resolved props；当前渲染 map 按 node.id 查找，泛化到可分页的 ordinary binding 物料时，不能生成新 id 后回退到未绑定的声明 props。现有 table-data 使用 custom binding，未证明通用情况。
- **建议**：保存逻辑只读源 schema；fragment.node 的虚拟 table/尺寸/id 不得回写。fragment paginator 必须取得物料拥有的片段状态，通用宿主只调度，不解释 table 行。
- **待验证**：自定义 paginator 可返回不推进的 nextPage；现有引擎没有通用循环次数/收敛保护。新合约应定义终止条件并测试，而不是声称当前已防护。

## 6. table-data WeakMap 是隐式会话协议

证据集中在 [table/data/viewer.ts](../../../packages/materials/table/data/src/viewer.ts)：`ResolvedRuntimeLayout`（第 57 行）、`runtimeLayoutCache`（第 63 行）、`measureTableData`（第 120 行）、`tableDataFragmentPaginator`（第 133 行）、`renderTableData`（第 174 行）。

1. 缓存属于模块，键是 `node.table` 对象身份，值为展开且可见的 rows、每行 rowHeights、totalHeight。
2. `resolveRuntimeLayout` 根据运行时 data 展开 repeat-template、解析 staticBinding、过滤 header/footer，再根据**原始声明 element height**计算设计器缩放基线。
3. `computeAutoRowHeights` 使用表格宽度、基线行高、props 计算最终高度；其内部先处理普通单行 cell，再处理 rowSpan 造成的缺口。见 [kernel/measure.ts](../../../packages/materials/table/kernel/src/measure.ts)，第 107 行。
4. measure 写 WeakMap；layout 浅拷贝尺寸，仍共享 table；render 取同一行高，避免用已扩张 node.height 再次放大。
5. paginator 读取该缓存拆分：保留表头到后继页，footer 放后继部分，至少必须放得下一条 body；不足时返回 `TABLE_DATA_FRAGMENT_OVERFLOW`。
6. `createVirtualTableFragment` 创建新的 table 身份和虚拟 node id，给新 table 再写缓存，同时保留原 sourceNodeId 与 flow。见同文件第 296、338 行。
7. render 无缓存时直接求值，主要供独立调用/测试；该 fallback 不能在已有测量后的节点上丢失声明高度。
8. WeakMap 没有会话结束或 destroy 清理；键无外部引用时才可被 GC。只要宿主/调用者仍持有原 table，值就可能继续存活。

**建议**：用显式 RenderSession 状态替代该协议时，保存的不是一个 totalHeight；至少包含当前展开 rows、rowHeights、总高度和保持缩放语义的声明尺寸输入。拆分应产出新的片段状态，后续 render/getRenderSize 能直接读取。
**建议**：状态由会话拥有，插件只定义生产和消费逻辑；用 renderer/物料身份与节点或片段身份隔离，不能用全局 node.id 缓存。
**建议**：源节点状态与 fragment 状态不可共用可变 rows 数组而互相覆盖；允许只读结构共享，但每次拆分需独立状态身份。
**待验证**：当前“两个 Viewer 共享同一 table 对象”在普通同步 measure→render 路径不必然串数据；模块级缓存缺少隔离是结构事实，具体并发污染不能宣称已复现。

## 7. 重复测量、并发与销毁

- **事实**：当前每次 `render()` 有一次顶层 measure 循环；多轮 render/updateData 会重新 measure；table kernel 内部两遍行高解析，text render-size 还会再次量字。没有通用迭代式 layout 收敛环。
- **建议**：RenderSession 不能把“prepare once”误作“measure 只能调用一次”。重复测量应确定、幂等，始终以声明尺寸为基线；若宽度/数据/字体等输入改变，需失效或新建适当粒度状态。
- **建议**：首次迁移保留现有调用次数与次序；是否增加通用多轮 layout 求解另立决策，定义约束键、版本与收敛限制后再实现。
- **事实**：`open`/`updateData` 写 `_schema`/`_data`；render 在条件求值之后 await fonts，后续仍读取实例 `_data`，没有 render generation、AbortSignal 或提交屏障。见 [runtime.ts](../../../packages/viewer/src/runtime.ts)，第 62、93、108、113、509、586 行。
- **建议**：每轮捕获 schema/data/capability 快照，定义同一 Viewer 的并发策略（例如最新有效轮次才能提交 DOM）；不同 Viewer 会话完全隔离，诊断归属于发起轮次。
- **事实**：`destroy` 清空 registry、data/schema、输出缓存、font manager、host mount；没有对 pending render 在 await 后重检销毁，也没有 renderer/session disposer。见同文件第 395 行。
- **建议**：首版补齐会话资源清理与“销毁后迟到结果不得写 DOM”；失败、正常完成、宿主销毁均走可重复调用的清理路径。该要求不需要首版支持热替换。
- **建议**：安装失败回滚负责能力/资源注册事务；渲染失败负责本轮状态清理。两者相互配合，但不共享模糊的“dispose 一切”契约。

## 8. 必须同步迁移的宿主装配点

| 入口 | 源码事实 | 路线约束 |
| --- | --- | --- |
| 独立 Viewer | [viewer/index.ts](../../../packages/viewer/src/index.ts) 的 createViewer 只构造 runtime；[runtime.ts](../../../packages/viewer/src/runtime.ts) 第 412 行公开 registerMaterial | 核心不得偷偷安装 builtin；显式 composition 支持无 Designer 使用 |
| Browser / iframe / custom | [viewer-host.ts](../../../packages/viewer/src/viewer-host.ts) 的三种 factory 提供 document/window/mount/style disposer/print | DOM renderer 始终使用宿主 document；插件不能默认全局 document |
| Playground Preview | [PreviewOverlay.vue](../../../playground/src/PreviewOverlay.vue) 第 77–94 行构建 iframe + custom host，并显式 setup materials/output integrations | Viewer UI 是宿主 UI；组装 renderer preset 与 UI 能力分开验收 |
| Playground 注册桥 | [viewer-materials.ts](../../../playground/src/viewer-materials.ts) 将 builtin/all 回调接到 registerMaterial | 渐进期桥应转发到唯一内核，退出条件含该调用点清零 |
| 托管打印 Viewer | [print/core/index.ts](../../../packages/print/core/src/index.ts) 第 289、324 行先 ensureViewer，再 await setupViewer，安装 driver，open，finally destroy | 新安装应进入 setupViewer；打印入口必须独立满足装配与清理 |
| 内嵌运行时 | [viewer-runtime/main.ts](../../../internal-packages/viewer-runtime/src/main.ts) 第 32–50 行安装 builtin/all、open，然后公开页面 metrics 并置 easyink-ready | 新 preset 必须进入该构建入口，不可仅修 playground |
| Go 服务端渲染 | [easyink.go](../../../lib/EasyInk.Render/host/internal/easyink/easyink.go) 第 16、44 行 embed HTML/JS/CSS、注入 schema/data；[render.go](../../../lib/EasyInk.Render/host/internal/render/render.go) 第 113 行转 HTML 并等 ready selector | 它消费浏览器内嵌 runtime；不是另一套纯服务端物料 registry |
| Node HTTP facade | [render-api-service/cli.ts](../../../internal-packages/render-api-service/src/cli.ts) 把请求写成 CLI 输入并调用 EasyInk.Render | 通过实际 runtime 冒烟证明 preset 已到最终制品 |

**事实**：`internal-packages/viewer-runtime` 的 build 是 vite build + `sync-runtime.mjs`，把输出同步到 Go embed 的 runtime 目录；Vite target 是 chrome83。见 [package.json](../../../internal-packages/viewer-runtime/package.json)、[sync-runtime.mjs](../../../internal-packages/viewer-runtime/scripts/sync-runtime.mjs)、[vite.config.ts](../../../internal-packages/viewer-runtime/vite.config.ts)。
**建议**：Viewer composition 的依赖预算要检查最终入口；当前 builtin/all 同时导出 Designer 与 Viewer bundle，不能只看 runtime.ts 是否导入 Vue 就宣布发布产物已解耦。

## 9. 已有回归入口与缺口

下列为**现有测试定位**，本次调查未执行，不能据此报告测试通过。

| 行为 | 已有入口 |
| --- | --- |
| Schema 默认、兼容编码、迁移与验证 | [schema/src](../../../packages/schema/src) 的 defaults.test.ts、codec.test.ts、migration.test.ts、validation.test.ts |
| 条件先于 binding/measure/paint；remove/reserve 与 updateData | [conditional-schema.test.ts](../../../packages/viewer/src/conditional-schema.test.ts)，第 37、57、85、113 行 |
| iframe DOM/font/print、root payload、原始 binding 类型 | [runtime.audit.test.ts](../../../packages/viewer/src/runtime.audit.test.ts)，第 90、113、146、246、265 行 |
| table/text 高度重排、尾距、旧 line | [stack-flow-layout.test.ts](../../../packages/viewer/src/stack-flow-layout.test.ts)，第 161、200、250、290 行 |
| 测量普通行、跨行 cell、行高合计 | [table/kernel/measure.test.ts](../../../packages/materials/table/kernel/src/measure.test.ts)，第 35、93、127 行 |
| table-data 分片不改源 table | [table/data/viewer.test.ts](../../../packages/materials/table/data/src/viewer.test.ts)，第 29 行 |
| paginator 调度、fixed 越界、重排碰撞 | [pagination-engine.test.ts](../../../packages/core/src/pagination-engine.test.ts)；[reflow-engine.test.ts](../../../packages/core/src/reflow-engine.test.ts) |
| wrapper render-size 与页面层 | [render-surface.test.ts](../../../packages/viewer/src/render-surface.test.ts)，第 9 行及页面层案例 |
| 物料特例 | [text/viewer.test.ts](../../../packages/materials/text/src/viewer.test.ts)、[line/viewer.test.ts](../../../packages/materials/line/src/viewer.test.ts)、[flow-row/viewer.test.ts](../../../packages/materials/flow-row/src/viewer.test.ts) |
| 打印/导出错误、清理、尺寸与 exporter context | [runtime.print.test.ts](../../../packages/viewer/src/runtime.print.test.ts) |

建议按阶段补充的行为测试：未知物料 canonical 往返；同一轮声明尺寸不被累乘；同一节点多次测量；多级 fragment 状态传播和重复表头/footer；两个 Viewer 使用同 schema 不串 data；重叠 updateData；字体 await 期间 destroy；状态清理遇到异常仍完成；缺失 renderer 的诊断与占位。
建议把 text visible overflow、height=0 line、table-data、flow-row、page-number、barcode host document 作为代表物料集合，避免仅迁移一个简单 rect 后宣布协议完整。

可用于实施阶段的命令入口：

```text
pnpm exec vitest run packages/schema/src packages/viewer/src packages/core/src/pagination-engine.test.ts packages/core/src/reflow-engine.test.ts packages/materials/table/data/src/viewer.test.ts packages/materials/table/kernel/src/measure.test.ts packages/materials/text/src/viewer.test.ts packages/materials/line/src/viewer.test.ts packages/materials/flow-row/src/viewer.test.ts
pnpm render:runtime
pnpm -F @easyink/render-api-service test:render-smoke
```

根 [package.json](../../../package.json) 的 `pnpm test` 使用 Vitest，环境见 [vitest.config.ts](../../../vitest.config.ts) 的 happy-dom；真实浏览器字体/布局不能仅由此证明。
Go 浏览器集成入口是 [render/integration_test.go](../../../lib/EasyInk.Render/host/internal/render/integration_test.go)，未设置 `EASYINK_RENDER_BROWSER_PATH` 会 skip；应区分单测成功与真实打印冒烟成功。
全仓收口仍遵循 [CLAUDE.md](../../../CLAUDE.md) 的顺序：`pnpm build` → `pnpm lint` → `pnpm typecheck`；文档调查只登记这些入口，后续实施阶段记录实际结果。

## 10. 提供给路线的可执行决策

1. 先锁定 canonical Schema 与现有 fixture 输出，再引入装配层；任何需要 Schema 字段或版本变化的提案退出本轮。
2. 定义完整 renderer 协议迁移表，明确 render/getRenderSize/measure/fragmentPaginator/pageAware/condition 的兼容路径，新增 prepare 要注明与现状差别。
3. 先以兼容适配器连接唯一 registry 与会话模型，逐物料迁移；不得长期维持两个能分歧的注册真相。
4. 以 table-data 证明显式会话和片段状态后，再删除 WeakMap；以 text/line 证明 layout size 与 render size 未混淆。
5. 所有宿主使用可选 preset 安装同一组能力；独立 Viewer、打印 setupViewer 和内嵌 runtime 都是退出旧 API 的检查点。
6. 会话隔离、安装失败回滚、宿主销毁清理列为首版验收；运行中卸载/替换的状态迁移与 UI 同步明确后置。
7. 尚未覆盖的行为以验收缺口记录；不要把源码推断、测试文件存在或推荐设计写成已验证事实。
