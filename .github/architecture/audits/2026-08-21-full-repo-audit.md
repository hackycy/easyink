# 架构与实现审查报告（2026-08-21）

> 审查方式：按 7 个领域并行深查，逐篇对照 `.github/architecture/` 下 26 篇架构文档与对应包源码实现。所有发现均附代码证据（文件:行号），关键结论已人工复核。

## 审查范围

| 领域 | 对照文档 | 涉及包 |
| --- | --- | --- |
| Schema 与数据层 | 05 / 08 / 13 / 17 | schema, schema-tools, prop-schemas, datasource, shared |
| 物料体系 | 11 | materials/*（约 20 个物料包） |
| 设计器交互层 | 10 / 12 / 22 / 23 | designer, core, ui, builtin |
| 渲染管线与 Viewer | 06 / 07 / 24 / 26 | viewer, core, viewer-runtime, render-api-service |
| 导出/打印/字体/i18n/安全 | 14 / 15 / 16 / 21 / 01 | export/*, print/*, locales, icons, mcp-server |
| AI Assistant 平台 | 25 / 09 | ai, assistant/*（17 个子包） |
| Monorepo 工程质量 | 03 / 04 / 18 / 19 / 20 | 根配置、turbo、各包 package.json、测试分布 |

## 总体结论

架构文档体系完整度高，大部分承诺有真实实现支撑；内部依赖图为干净 DAG，无循环依赖、无越层引用。问题集中在四类：

1. **文档承诺超前于实现**（迁移链路、表格绑定预解析、iframe 协议等）
2. **死代码/实验性路径未清理**（ComposerAgent 链、LangGraph 空壳、PropertyPanelOverlay）
3. **工程护栏缺位**（CI 无测试门禁、E2E 完全缺失）
4. **少量正确性与性能缺陷**（inch 单位换算、qrcode 崩溃、分页 O(R²) 等）

---

## 一、高严重度问题

### A. 文档与实现脱节（需决策：改代码还是改文档）

**A1. Schema 迁移注册表未接线**
`MigrationRegistry` 仅被测试引用，全仓无 `SchemaStore`；`deserializeSchema` 对高版本直接抛 `incompatible-version`（packages/schema/src/validation.ts:471），与 17.2.1"best-effort 打开"相悖；viewer 打开时只做结构校验并静默改写 version（packages/viewer/src/runtime.ts:67、packages/schema/src/defaults.ts:266）。
建议：把版本比较 + 迁移 + 诊断接入统一加载入口，或修订文档为现状。

**A2. codec 往返丢数据，违背 05"未识别字段必须保留"承诺**
未知 page 字段解码进 `compat.passthrough['page.*']`（packages/schema/src/codec.ts:113-117），但编码时被显式跳过（codec.ts:312-318），一次导入导出即丢失；元素级 `binding/animations/props` 容器不识别，全部塞进 `node.props`（codec.ts:170-177）；codec.test.ts 无 passthrough/binding 用例。
建议：编码时回写 page.* passthrough，解码提取 binding/animations，补往返测试。

**A3. designer/viewer 实际不依赖 builtin，"默认装配物料"不成立**
`.github/architecture/03-monorepo-structure.md:177,180,194,197` 及 `04-layered-architecture.md:71-78` 声称默认消费 `@easyink/builtin`；但两包 dependencies 均无 builtin、源码零引用。builtin 仅被 playground 与 internal-packages/viewer-runtime 引用。npm 消费者安装 `@easyink/designer` 后没有任何物料可用。
建议：在 designer/viewer 声明并装配 builtin，或修订文档明确"物料由宿主装配"。

**A4. 表格绑定"预解析"未实现**
文档 6.6.1/6.6.2 承诺的 `ResolvedCellBindings` Map 在源码中不存在；`resolveAllBindings` 无表格特判（packages/viewer/src/runtime.ts:577-621），实际由物料自行调 `resolveBindingValue`（materials/table/data/src/viewer.ts:228-294、table/static/src/viewer.ts:31-33），与"表格 ViewerExtension 不自行调用 resolveBindingValue"直接矛盾，且 measure 展开与 render 缓存 miss 时重复解析。
建议：将单元格解析上收为 ViewerRuntime 单一入口，物料只消费结果。

**A5. 图表设计态实现与文档策略相悖**
文档 §11.6.1 要求图表设计态"图标+静态缩略图占位，不引入第三方渲染库"；实际 6 个内置图表在 Designer 同步挂载真实 ECharts（如 chart/bar/src/designer.ts:13），仅 chart-custom 走 lazyFactory（packages/builtin/src/designer.ts:622），其余把 echarts/core 拉进 Designer 初始路径。
建议：更新文档承认真实渲染策略并补 lazyFactory，或按文档改回缩略图。

**A6. data-contract 解析未实现 source-scoped 回退**
文档 8.11 承诺 `sourceId` 可作为 `data[sourceId]` 根候选，实现只查全局 data 根（packages/core/src/material-data-contract.ts:395-425）。

### B. 正确性缺陷

**B1. qrcode 对非法值无容错，Designer 画布抛未捕获异常**
`generateQrcodeSvg` 直接调用且无 try/catch（packages/materials/qrcode/src/designer.ts:35-39、viewer.ts:20-26），依赖库对超长内容 throw `'code length overflow.'`；Designer 调用点也无兜底（designer/src/components/CanvasElementContent.vue:45）。对照 barcode 两处均有 catch + Invalid 占位。
建议：比照 barcode 增加 try/catch，或框架在 `renderContent` 外层统一兜底。

**B2. UnitManager.convert 对 inch 静默算错**
from/to 为 inch 落入 default 分支原值返回（packages/core/src/unit.ts:39-63），1 inch 被当作 1mm 处理；与 `shared/convertUnit`（packages/shared/src/constants.ts:56-65，正确）形成两套并存换算。
建议：删除 convert 改用 convertUnit。

**B3. LODOP/HiPrint 按首页尺寸打印所有页，混合纸张文档塌缩**
`pages.map(() => ({ widthMm, heightMm }))` 把单页尺寸复制给全部页（packages/print/integration-lodop/src/driver.ts:29），client.ts:246-252 循环对每页复用同一 options；hiprint 同病（integration-hiprint/src/client.ts:359-371）。与 print-core resolveViewerPdfPages 注释声明的"每页 metrics 优先、防止可变页计划塌缩到首页"直接矛盾。
建议：两通道循环内逐页传入各页尺寸。

**B4. 层级调整绕过 Command 直改 Schema，不可撤销**
CanvasContextMenu.vue:225/233/246/260 与 TopBarB.vue:392/410 用裸 Object.assign 改 zIndex（store/designer-store.ts:303），core/commands 里没有任何 z-order 命令，违反 12.1"元素增删改进撤销栈"。
建议：新增 ZOrderCommand 或改走 tx.run。

### C. AI 平台安全与健壮性

**C1. ComposerAgent 整条技术栈是死代码**
全仓 grep 显示 `ComposerAgent` 仅被 orchestrator 导出，无任何调用点；其专属依赖 tool-registry、schema-builder、type-aligner、scenario-templates 四个包（合计约 1600 行）只被 composer/agent.ts 引用（orchestrator/src/composer/agent.ts:21）；constraint-engine 的唯一消费链也经 schema-builder 落入此死路径。但文档 25.6.2 称其为"新一代生成引擎"。
建议：接线到主管道，或降级为 experimental 并修订文档。

**C2. LangGraph 管道是空壳**
graph.ts:19-28 各节点只 push 步骤名字符串；orchestrator.ts:573-575 `invokeGraph` 调用后丢弃结果，真实流程为手写顺序编排，`@langchain/langgraph` 依赖空转。
建议：删除 graph 或真正迁移节点逻辑。

**C3. Orchestrator 服务零鉴权，密钥管理有泄漏面**
server.ts 所有路由（含列出全部任务的 `GET /assistant/tasks`、snapshot 导入导出）无认证；CORS 默认 `*`（server.ts:67）、默认绑定 0.0.0.0（bin/server.ts:80）；用户 API Key 经请求体明文上传并默认持久化到 sessionStorage（ui/src/runtime-llm.ts:53）；Memory Agent 每次 exportSnapshot 取最近 5 条任务 prompt 注入上下文（agents.ts:641-658），多租户下跨任务串数据。
建议：加鉴权中间件；Memory Agent 按 conversation/task 归属过滤。

**C4. render-api-service 无鉴权且请求可覆盖运行时标志**
服务接受 body.runtime（internal-packages/render-api-service/src/server.ts:73-78），cli 合并后透传 `--browser-path`/`--disable-sandbox` 给 spawn（cli.ts:79-86,102），远程调用方可指定任意浏览器可执行路径并无沙箱渲染任意 HTML。
建议：服务端忽略客户端覆盖或加鉴权。

**C5. LLM 任务无法真正取消、健壮性不足**
LLMClient.complete 无 signal/timeout 参数（llm/src/types.ts:51-53），orchestrator 全程无 AbortController；cancelTask 仅改状态（orchestrator.ts:371-377），运行中任务完成时会将状态覆盖回 review（orchestrator.ts:356）。openai.ts:15-19 / anthropic.ts:14-17 未配置超时与重试；Anthropic 客户端静默忽略 `responseFormat:'json'`（anthropic.ts:21-36）；completeJson 解析失败无修复重试（agents.ts:1001-1011）。
建议：complete 增加 AbortSignal 并贯穿 runTask；补 timeout/retry 与一次 JSON 修复重试。

### D. 工程护栏

**D1. 单元测试没有 CI 门禁**
`.github/workflows/` 下无任何 workflow 在 PR/push 上执行 `pnpm test`（仅 build-easyink-render.yml 跑单一脚本测试）；pre-commit 只跑 lint-staged eslint（根 package.json:72-77）。168 个测试文件完全靠本地自觉，与 19.5"PR 准入护栏"矛盾。
建议：新增 PR CI job 顺序执行 lint/test/typecheck/build。

**D2. E2E 测试完全缺失**
19.2 列出 7 条 Playwright 关键路径；仓库无 playwright 配置文件、无 e2e 目录（vitest.config.ts:19 排除规则是空规则）。19.4 所述 vitest workspace 三包配置也与实际单根配置不符。
建议：补最小 Playwright 骨架并纳入 CI，或修订文档降级为规划项。

---

## 二、中严重度问题

### 性能

| 问题 | 证据 | 建议 |
| --- | --- | --- |
| updateData 全量重跑管线，table-data 分页近二次复杂度 | 每次数据更新触发条件求值→绑定→测量→回流→分页→replaceChildren 全量重建（viewer/runtime.ts:101-222）；splitRuntimeRows 从剩余行首重扫并整体复制行数组（table/data/src/viewer.ts:296-336） | 分页器改游标式推进；绑定/测量按节点做脏检查 |
| 自动保存对整个 schema deep watch | composables/use-template-autosave.ts:150 `{deep:true}`，拖拽每帧 preview 都全量遍历触发 | 改由 commands.onChange + markDraftModified 驱动 |
| 缩略图是全页 DOM 序列化而非缩略模型 | 每页 outerHTML 塞 foreignObject 再 encodeURIComponent 成 data URL（viewer/thumbnail-pipeline.ts:11-20），@font-face 不随序列化进入导致字体回退 | 改轻量页面模型或惰性生成并缓存 |
| auto-sheets 深 y 固定元素级联产出空白填充页且无诊断 | pushCurrent 循环推空页直至页起点追上 fragment.y（core/pagination-engine.ts:136-189），applyBlankPolicy 仅用于 fixed-sheets（:73） | auto-sheets 也应用 blankPolicy 或输出诊断 |

### 交互正确性

| 问题 | 证据 | 建议 |
| --- | --- | --- |
| Cmd/Ctrl+Z 快捷键缺失 | use-keyboard-shortcuts.ts 只注册 a/c/x/v/d/Delete/方向键；undo/redo 仅剩按钮与历史面板 | 补注册 |
| PatchCommand 合并窗口从链首计时，长手势碎片化 | patch-command.ts:104-116 merge 后保留原 createdAt，总时长一超 300ms 即断链 | 按最后一次合并时间滚动计窗 |
| goTo/undo 不刷新选区，产生幽灵选中 | HistoryPanel.vue:64 批量跳转；core/selection.ts:92 的 reconcile() 在 designer 内零调用 | onChange 时 reconcile |
| PropertyPanelOverlay 只写不读 | 仅 materials/extension-context.ts:46 写入 store._propertyOverlay，PropertiesPanel 零消费零清除 | 接线或删除死代码并修文档 |
| 嵌套节点 renderCondition 被静默忽略 | 条件解析仅遍历顶层 elements（viewer/conditional-schema.ts:24），schema 支持嵌套（schema/traversal.ts:25-43），与 6.11"不静默"冲突 | 遇嵌套条件输出 warning |

### 重复代码（应下沉 shared / kernel）

- 图表族 bar/line/pie/scatter 的 designer.ts 除类型名外逐字节相同（diff 验证），gauge 同构；bar 与 line 的 data-contract.ts 仅常量名不同；kernel core.ts:17-75 与 full.ts:9-66 整段重复 → kernel 提供 `createChartTypeExtension(optionFactory)` 参数化工厂
- `toFiniteNumber` ×5（text/layout.ts:174 等，text 版语义不同——不解析字符串）、`roundCssNumber` ×3、`escapeSvgAttr` ×2、DASH_MAP 边框拼接 ×3、BindingRef 映射 ×4
- 集合前缀逻辑 ×3 且边界行为不一（table/data 用 lastIndexOf、flow-row 用 split/filter、core 已有 extractCollectionPath）
- 表格 cell 绑定遍历 5 处手写循环（schema-tools/schema-validator.ts:310,396、datasource-aligner.ts:131,315、generation-accuracy.ts:212），均绕过 isTableNode 且漏检 cell.content.elements → 抽公共遍历器
- 两套单位换算并存（core/unit vs shared/convertUnit）
- page-number Designer/Viewer 各自重复约 30 行样式拼装

### 工程一致性

- **catalog 漏洞**：6 个 chart 物料包硬编码 `inlinedDependencies: { echarts: "6.1.0" }`（如 chart/bar/package.json:31），catalog 中为 `^6.0.0` 且 chart-kernel 走 catalog → 发布后双份 echarts + 版本漂移风险；material-svg-star/material-table-kernel 的 vue peer 写死 `"&gt;=3.0.0"`
- **Vue 单例策略不一致**：assistant/designer-bridge 将 vue 同时放 dependencies 与 peerDependencies（自满足自身 peer）；print/integration-easyink-printer 直接把 vue 放 dependencies
- **typecheck/test 未进 turbo**：turbo.json 仅 build/typecheck/dev；typecheck 脚本仅 6 个包声明，对其余约 60 包静默跳过
- **护栏测试缺失**：transaction-service.ts 存在但 transaction-service.test.ts 不存在（同目录 behavior-dispatcher.test.ts 在）
- **测试盲区**：9 个功能包零测试——assistant/constraint-engine、assistant/plugins、assistant/scenario-templates、assistant/tool-registry、export/dom-capture（导出链路核心）、icons、materials/image、materials/rect、samples
- **assistant 拆分失衡**：scenario-templates(204 行)、plugins(160)、adapters(282) 等微包 vs ui 侧 ConversationPanel.vue(1133 行)、agents.ts(1096 行)；orchestrator 声明 assistant-constraint-engine 依赖但源码零引用（幽灵依赖）
- **文档数值偏差**：25.6.1 称 Repair"最多 3 轮"，代码 `MAX_REPAIR_ITERATIONS = 2`（orchestrator.ts:49）

### 安全

- **iframe 协议未按 6.5 落地**：designer 包不依赖 viewer；iframe 宿主直接同源访问 contentDocument（viewer/viewer-host.ts:21-42），全仓无 postMessage；viewer-runtime 靠 inline JSON payload + window 全局（viewer-runtime/main.ts:42-47,82-87），无来源校验 → 明确"仅同源嵌入"或补带 origin 校验的消息协议
- **mcp-server 无源码入库**：git ls-files 为空，目录内只有 dist 和 node_modules，连 package.json 都没有；dist 显示 HTTP transport 默认绑 0.0.0.0，无从审查源码级安全 → 补交源码或删除遗留目录

---

## 三、低严重度问题（择要）

- 文档过时/漏记：types.ts:574 注释仍写 cell.binding "relative path"、types.ts:623 "has source"；`TableCellContentSlot.elements+'hosted'` 违背 05"纯文本不嵌套"；TableLayoutConfig 缺 equalizeCells/multiColumn；03 号文档结构图缺 integration-lodop、export/dom-capture、export/plugin/dom-image 三包，codemirror 实际在 ui 包而非 designer；15 章缺 integration-lodop；05 的 UnitType 缺 inch；renderCondition/placement/break/repeat、page.layers 字段无任何文档
- codec 编码用真值判断丢 `offsetX=0` 等合法值、unit 无白名单（codec.ts:289-296,134）
- autoFix 对缺失 id 调两次 generateId，记录值≠实际值，语义校验不递归 children（schema-validator.ts:376-386,202-253）
- `extractCollectionPath` 返回签名与文档 8.12 不符；`resolveBindingValue` 不兼容 '.' 老路径，与 shared `resolveFieldPath` 行为分叉（core/binding-utils.ts:16,59）
- datasource registry 解析失败仅 console.error 静默吞掉（registry.ts:239-242）；懒解析后 `_sources` 与 `_resolvedEntries` 双写导致重复列出（registry.ts:229-235）
- i18n 缺 key 静默返回 key 本身（designer-store.ts:389-400），动态拼 key 无校验；dev 模式建议加 console 警告
- foreignObject 截图空白 canvas 自动回退默认关闭（dom-pdf/pdf.ts:73），playground 未开启；触发空白时仅 warning 仍导出白页
- lodop 默认脚本源 http://localhost（script.ts:3-6），HTTPS 页面受混合内容策略影响
- JSON-safe 校验弱于承诺：round-trip 对嵌套函数/DOM ref 先被 stringify 静默剥离再比对照样通过（selection-store.ts:31-40）；22.0.1 说推 warn 实为 error（:63）
- 可恢复错误仍散落 console.error：use-element-drag.ts:232 事务失败未走 store.diagnostics；extension-context.ts:14-17 创建 tx 未传 diagnostics
- EiCodeMirrorEditor 缺 commit 事件（ui/EiCodeMirrorEditor.vue:45 仅 emit update:modelValue），违反 12.8 双事件约规
- flow-y 重叠诊断 O(flow×fixed) 双循环（core/reflow-engine.ts:113-139）；arrayBufferToDataUrl 逐字节拼串（core/font.ts:413-420）
- 文本测量为启发式字宽估计（text/layout.ts:141-158 用 0.56em+码点迭代；kernel/measure.ts:27 用 0.55em+码元迭代），两套启发式不一致，混排时分页高度有偏差
- table-data viewer 用模块级 runtimeLayoutCache WeakMap 隐式耦合 measure→render 两阶段（table/data/viewer.ts:63），数据变更而未重测时会用陈旧布局 → 显式传参
- text 设计态在 render 中提交事务 syncAutoHeight（text/designer.ts:64-77），属渲染期副作用 → 移独立 effect
- MaterialViewerExtension 无 dispose 钩子而 renderPages 直接清空容器（core/material-viewer.ts:84-92，当前内置物料均返回 html 暂无实际泄漏）
- playground 同时依赖 radix-vue 与 reka-ui（继任者双库）；根 `"test": "vitest run --dom"` 与 vitest.config.ts happy-dom 冗余
- 孤儿产物：packages/ai（仅 dist/node_modules 无源码）、materials/container（源码已删 dist 未跟踪）
- ComposerAgent 内置英文 prompt 且硬编码 `unit:'mm'`（agent.ts:45,71），若该层保留需先对齐场景驱动单位承诺
- parseSseEvents 每个 chunk 重复 JSON.parse 两次且无容错（ui/api.ts:313-319）
- prop-schemas 运行时依赖 UpdateMaterialBehaviorCommand（index.ts:2），超出文档边界声明；table-kernel 违背文档"不做 re-export"（kernel/render.ts:8）

---

## 四、验证为做得好的部分

- 内部依赖图为干净 DAG，零循环依赖、底层包无越层 import
- 安全模型真实落地：无 v-html；Viewer 侧 innerHTML 经 TrustedViewerHtml 品牌类型收口；svg/custom 有真实白名单 sanitizer；文本走 escapeHtml；未知打印 driverId 报 NO_PRINT_DRIVER 而非静默回退
- html2canvas/jspdf 仅存在于两个插件包且运行时动态 import()，viewer/designer/core 主 bundle 干净
- EditingSession 五件套（EditingSessionManager/SelectionStore/BehaviorDispatcher/TransactionService/GeometryService）全部落地并有测试；选择写入严格收口；坐标换算统一走 createGeometryService 无手拼 zoom 公式
- ContributionRegistry 生命周期完备（重复 id 抛错、dispose 清空、onDiagnostic 自动退订）；window 级监听均有 teardown；破坏性确认统一走 interactions.confirm
- 未识别物料/字体失败（FONT_LOAD_FAILED）/打印指标缺失（PRINT_RENDER_METRICS_MISSING）均有可见诊断码，符合"不静默"原则
- 物料合约落实度高：Designer/Viewer 双实现、fragmentPaginator、DatasourceDropHandler（含集合前缀拒绝）、capabilities 与文档一致
- 表格族职责划分清晰：kernel 纯函数 + 共享 renderTableHtml，data/static 薄壳
- tsdown 配置统一（dts + exports:true + publint）；scripts/ 质量良好；zh/en 结构对齐有测试保障
- Assistant 依赖方向干净：designer/core/ui 源码与 package.json 均无 assistant 反向引用，接线在 playground

---

## 五、建议行动顺序

1. **决策收敛文档-实现脱节**：A1-A6 逐项二选一（改代码 or 修订文档）
2. **安全补齐**：C3/C4 鉴权、C5 AbortSignal 贯穿、API Key 存储改造、iframe 协议明确化
3. **正确性修复**：B1 qrcode 容错、B2 inch 单位统一 convertUnit、B3 lodop/hiprint 逐页尺寸、B4 ZOrderCommand
4. **护栏建设**：D1 PR CI 门禁（lint/test/typecheck/build）+ D2 最小 E2E 骨架
5. **重构**：工具函数下沉 shared、chart kernel 参数化工厂、分页游标式推进、自动保存去 deep watch
6. **清理**：ComposerAgent 接线或降级 experimental、删 LangGraph 空壳、孤儿目录（packages/ai、materials/container）、幽灵依赖、catalog 收敛
