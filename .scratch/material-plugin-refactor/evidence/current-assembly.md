# 当前物料装配层源码证据

研究日期：2026-10-08。基线：工作区 `HEAD 0b43cb752ddd13b1802bbbb0d3b2993a3a8fd3be`。本文只调查仓库源码与已有测试，不修改应用代码；以下“事实”与“迁移建议”分别标明。源码链接相对仓库，行号用于本次定位，后续应以符号为准。

## 已成立的解耦边界

1. **事实：Designer 和 Viewer 已经不依赖 builtin 或具体物料包。** [Designer package.json](../../../packages/designer/package.json)、[Viewer package.json](../../../packages/viewer/package.json) 中都没有这些依赖；对这两个包及 core/locales/prop-schemas 的生产 `.ts/.vue/package.json` 搜索 `@easyink/(builtin|material-)` 无匹配。重构不应以“先去掉这条已不存在的依赖”为里程碑。
2. **事实：宿主已经选择物料集合。** [EasyInkDesigner.vue](../../../packages/designer/src/components/EasyInkDesigner.vue) L54/L123 读取 `runtimeConfig.materials.bundles` 并逐个调用 `registerMaterialBundle`；[runtime-config.ts](../../../packages/designer/src/runtime-config.ts) 定义该输入。`new DesignerStore()` 本身只建空 `MaterialRegistry`，不会消费 bundles（[designer-store.ts](../../../packages/designer/src/store/designer-store.ts) L90）。
3. **事实：Viewer 默认也是空注册表。** [runtime.ts](../../../packages/viewer/src/runtime.ts) L37/L412 由 `registerMaterial(type, binding, extension)` 显式装配；[playground/src/viewer-materials.ts](../../../playground/src/viewer-materials.ts) 和 [internal-packages/viewer-runtime/src/main.ts](../../../internal-packages/viewer-runtime/src/main.ts) L32 是实际 builtin 组装点。
4. **事实：核心协议已集中于 core。** [material-extension.ts](../../../packages/core/src/material-extension.ts) 定义 Designer 扩展、NodeSignal、编辑/交互上下文和 `PropSchema`；[material-viewer.ts](../../../packages/core/src/material-viewer.ts) L86 定义 Viewer 扩展；[material-binding.ts](../../../packages/core/src/material-binding.ts) 定义四种 binding。core 没有统一物料 registry，也没有插件装配内核。
5. **事实：物料专属属性与语言已经回归物料包。** 例如 [text/src/index.ts](../../../packages/materials/text/src/index.ts) 导出 `prop-schemas`、`locale`、`ai`、Designer、Viewer、Schema 工厂；[prop-schemas/src/index.ts](../../../packages/prop-schemas/src/index.ts) 只含公共选项、布局行为属性和分组函数；[locales/src/index.ts](../../../packages/locales/src/index.ts) 导出 Designer 自身的内置语言。
6. **事实：Assistant 知识包已不从 builtin 读取全量物料。** [material-manifest.ts](../../../packages/assistant/designer-bridge/src/material-manifest.ts) 从当前 Store 的 `listMaterials()` 投影；[material-knowledge/package.json](../../../packages/assistant/material-knowledge/package.json) 只依赖 schema/shared/zod。Assistant 范围内对 Designer 的依赖集中在 `designer-bridge`。

## 定义、装配、消费链

| 当前位置 | 源码事实 | 迁移触点 |
| --- | --- | --- |
| 物料包 `schema.ts` | 类型标识、默认值、节点工厂、capabilities 常量同文件存在；例如 [text/schema.ts](../../../packages/materials/text/src/schema.ts) L7/L39/L65/L91 | 将运行时能力描述抽离时保留既有持久化节点契约及工厂行为 |
| [builtin/designer.ts](../../../packages/builtin/src/designer.ts) | 按类型拼装 name/icon/category/capabilities/binding/AI/factory/props/locale，再维护 catalog；L622 使用 custom-chart 的动态 Designer import | 当前主要集中式登记清单，适合作为旧 API 适配来源 |
| [builtin/viewer.ts](../../../packages/builtin/src/viewer.ts) L47 | 按类型再次列出 binding、render、measure、render-size、fragmentPaginator、pageAware | 元数据一致性不能只比较 type；分页/测量行为需完整保留 |
| [builtin/bindings.ts](../../../packages/builtin/src/bindings.ts) | 普通字段映射及图表 contract 装配仍由 builtin 拥有；barcode 有 indexedProps | 这些不是 UI 配置，应归属物料能力；不能从 bindable 布尔值重建 |
| [builtin/ai.ts](../../../packages/builtin/src/ai.ts) | 调用 Designer bundle 再抽取 aiDescriptor，不是独立纯数据源 | Headless AI 入口应验证其实际导入图；不能只改导出名字 |
| [builtin/basic.ts](../../../packages/builtin/src/basic.ts) | 独立维护 basic 的 Designer/Viewer 两套完整数组 | 与根入口按 all 过滤出的 basic 并存，有双份维护风险 |
| [builtin/types.ts](../../../packages/builtin/src/types.ts) L22 | Designer 注册形状持有 Vue `Component`；capabilities 形状和 Designer 再定义一遍 | 通用能力内核不应直接沿用整个 UI 聚合类型 |
| [designer/materials/registry.ts](../../../packages/designer/src/materials/registry.ts) L68 | bundle → `MaterialDefinition`、factory/lazyFactory、catalog、locale | 现有公共装配函数是兼容适配点 |
| [designer/store/material-registry.ts](../../../packages/designer/src/store/material-registry.ts) L63 | 每 Store 的 materials/factories/lazy/cachedExtensions/catalog；factory 按 type 每 Store 缓存 | 新 runtime 与 Designer 会话服务的所有权需分开 |
| [viewer/material-registry.ts](../../../packages/viewer/src/material-registry.ts) L11 | 每 Viewer 的 renderers/bindings/pageAware 集合 | 保持 Viewer 按能力查询，不引入 Designer UI 依赖 |

实际依赖方向（非目标设计）：宿主 → builtin → 物料；宿主 → Designer/Viewer；Designer → core/datasource/locales/prop-schemas/shared/ui；Viewer → core/schema/shared；多数物料 → core/schema/shared/prop-schemas，复杂物料再依赖其 kernel。确切依赖以各 `package.json` 为准；源码聚合入口可能让类型无关消费者经过更大的模块图，最终 bundle 大小仍需构建产物证明。

## 不能遗漏的物料能力

- [MaterialDesignerExtension](../../../packages/core/src/material-extension.ts) 不只有 `renderContent`：还包括 datasourceDrop、geometry、selectionTypes、behaviors、decorations、resize、resolveControlPolicy。`renderContent` 返回的是**单次 DOM 挂载**清理函数，不是插件卸载函数。
- [MaterialExtensionContext](../../../packages/core/src/material-extension.ts) 含事务 tx、commands、selection、property overlay、events、zoom、page DOM、翻译等。将其变为插件贡献接口时，不能把现有 DesignerStore 全量暴露当作“已解耦”。
- [MaterialViewerExtension](../../../packages/core/src/material-viewer.ts) 的可选 measure/getRenderSize/fragmentPaginator/pageAware/condition 参与布局与输出；不能缩为单一 renderer 回调。
- [MaterialDefinition](../../../packages/designer/src/types.ts) L194 混合元信息、创建、AI、binding、属性表单、sectionFilter；[BuiltinDesignerMaterialRegistration](../../../packages/builtin/src/types.ts) 还有 locale 与 factory。需要拆分的是装配归属与投影，不是重新发明这些能力。
- [PropertiesPanel.vue](../../../packages/designer/src/components/PropertiesPanel.vue) L383 合并物料 props 和公共布局行为；L492 采用 `PropSchema.commit` 支持写入 `node.props` 之外的表格字段、编辑会话提交与退出。保留 read/commit/visible/disabled/nullable/editorOptions，避免把所有属性退化为 props-bag 更新。
- [CanvasElementContent.vue](../../../packages/designer/src/components/CanvasElementContent.vue) L45/L49/L70 在挂载、nodeId/扩展 revision 变化、组件卸载时处理 `renderContent` cleanup；未知扩展直接不绘制。Viewer 未知物料则由 [material-registry.ts](../../../packages/viewer/src/material-registry.ts) 的 `renderUnknownMaterial` 输出诊断占位。
- 条件能力的 `undefined` 当前意为框架默认，不等于禁用。[builtin/condition.test.ts](../../../packages/builtin/src/condition.test.ts) 明确约束 builtin 不覆盖默认值；[viewer/conditional-schema.test.ts](../../../packages/viewer/src/conditional-schema.test.ts) 覆盖默认、显式禁用、remove/reserve。

## Designer UI 的真实扩展位置

| 需求方向 | 当前对应 | 边界 |
| --- | --- | --- |
| 顶栏附加内容 | [EasyInkDesigner.vue](../../../packages/designer/src/components/EasyInkDesigner.vue) L193 的 `topbar` Vue slot | 位于默认 TopBarB **之前**，不是替换默认顶栏的通用注册点 |
| 顶栏插件按钮 | [TopBarB.vue](../../../packages/designer/src/components/TopBarB.vue) L535 读取 ContributionRegistry.toolbarActions | 描述符只有 id/icon/label/onClick，无通用排序/分组/槽位协议 |
| 全局浮层 | [EasyInkDesigner.vue](../../../packages/designer/src/components/EasyInkDesigner.vue) L205 的 Teleport 面板 | Contribution 自管布局；默认目标是全局 selector `#ei-overlay-root`，多实例需专项验证 |
| 工作区浮窗 | [CanvasWorkspace.vue](../../../packages/designer/src/components/CanvasWorkspace.vue) L813 | `win.kind` 对 Properties/Structure/DataSource/History/Minimap/Debug/Toolbar/Material 的固定分支，不是 registry |
| 属性区域 | [PropertiesPanel.vue](../../../packages/designer/src/components/PropertiesPanel.vue) L695 | 固定 geometry/props/overlay/binding/condition/visibility；sectionFilter 只能过滤，overlay 可提供局部 schemas/editors |
| 表单编辑器 | [PropSchemaEditor.vue](../../../packages/designer/src/components/PropSchemaEditor.vue) L90 | 通过传入的 customEditors 查找；PropertiesPanel 当前只向 overlay 传 custom-editors，没有全局编辑器注册表 |
| 深度编辑临时面板 | [EphemeralPanelHost.vue](../../../packages/designer/src/components/EphemeralPanelHost.vue) | 依附 active editing node，以位置锚点挂载 component；与全局 Contribution Panel 是不同生命周期 |
| Viewer UI | [playground/PreviewOverlay.vue](../../../playground/src/PreviewOverlay.vue) | 预览窗口、缩放、打印/导出按钮由宿主实现；`@easyink/viewer` 现有包是 runtime/host/渲染管线，没有成套 Vue Viewer UI |

**迁移建议：** UI slot 的名字、贡献形状和所属 package 属于待设计契约，不能在路线中写成当前已有接口。保留现有工作区持久化 kind/id、属性命令语义、交互 provider、编辑会话所有权；不要将内部临时面板与产品级 UI 插槽混成一个生命周期。

## 生命周期、冲突与卸载事实

1. [registerMaterialBundle](../../../packages/designer/src/materials/registry.ts) L128 返回函数只循环撤销 locale；不撤销 material、factory、catalog。`EasyInkDesigner` 注册 runtime bundles 时还忽略了该返回值。不能把它当作完整插件 disposer。
2. [MaterialRegistry.registerMaterial](../../../packages/designer/src/store/material-registry.ts) L71 直接 `Map.set`，同类型后者覆盖；`registerCatalogGroup` L86 对同组追加 items，没有 entry id 冲突检查。重复安装可能叠加目录项。
3. `registerDesignerFactory`/`registerLazyDesignerFactory` L124/L129 不删除 cachedExtensions；已经创建过扩展后替换 factory，查询仍先返回旧实例。此结论来自代码路径，未进行动态复现。
4. `loadLazyDesignerFactory` L173 的 Promise 完成后无 owner、generation、destroyed 判断；clear/替换之后仍能写回 factory 并递增 revision。迁移需覆盖加载中卸载、替换、重装、失败重试。
5. materials/factories Maps 通过 markRaw 保存；目录也是普通数组。只有 lazy 完成显式触发 `notifyMaterialExtensionLoaded`。动态增删安装若成为承诺，需要额外的可观察性契约，不能假定所有 UI/AI 消费者自动更新。
6. [ContributionRegistry](../../../packages/designer/src/contributions/contribution-registry.ts) L26 逐个同步 activate，无激活失败回滚；Panel/action/command id 重复会抛错；Contribution.id 仅用于诊断且不校验（[types.ts](../../../packages/designer/src/contributions/types.ts)）。
7. Contribution 共享一个 context，直接持有 Store；`onDispose` 加入全实例数组，L93 按加入顺序执行、捕获单个清理错误，再清空所有注册。没有“只卸载某插件”的 owner 记录，也没有 dependency 顺序。
8. [DesignerStore.destroy](../../../packages/designer/src/store/designer-store.ts) L477 清空物料、paper、命令等并退出 editing session，但不清 `_localeRegistrations`；多数情况下整个 Store 会被释放，仍不可宣称所有资源都有明确撤销所有权。
9. [Viewer MaterialRendererRegistry](../../../packages/viewer/src/material-registry.ts) L16/L24 有 unregister(type)，但不是 owner 条件删除；旧 owner 的卸载可能删掉后来注册值。register 的 pageAware 只增不减，替换为非 pageAware 扩展会遗留标记。
10. [ViewerRuntime.destroy](../../../packages/viewer/src/runtime.ts) L395 清物料/exporters/drivers/fonts/host；它不逐个清理 [InternalHooks](../../../packages/core/src/hooks.ts)，后者 `tap()` 自带 unsubscribe。任何新插件挂 hook 均需显式归属与撤销。
11. **建议而非既有能力：** 装配内核应约定重复安装/同 key 冲突策略、激活原子性、完整注册收据与撤销、逆依赖清理、异步代次隔离、清理幂等、会话先退出再移除能力；对应新增行为测试。不能用销毁整个 Designer/Viewer 掩盖插件级卸载缺失。

## Locale 语义与 AI 投影

- [DesignerStore.t](../../../packages/designer/src/store/designer-store.ts) L389：宿主 locale 优先，再按注册顺序取首个命中的扩展文案，最终返回 key。同 key 冲突不是后注册覆盖。
- `resolveRegisteredLocaleMessages` L403：一旦存在当前 code 的整棵语言树，就使用它；**该树缺某个 key 时不会再到同注册的 messages 按 key 回退**。重构应先记录兼容行为，再明确是否另开修正，不能无意改变翻译优先级。
- `registerLocaleMessages` L380 返回按对象身份移除一条注册的 disposer。共享注册对象重复使用、部分贡献卸载均需要 owner 语义。
- [builtin/designer.ts](../../../packages/builtin/src/designer.ts) 的 `mergeLocaleMessages` 是对 table-kernel 与 catalog 消息进行递归合并；它与 Store 查询注册列表是两种不同操作。迁移不能把“已合并消息”当作“可按 owner 撤销的消息”。
- [createAssistantMaterialManifest](../../../packages/assistant/designer-bridge/src/material-manifest.ts) L4 从活动 Store 输出 type/name/capabilities/binding/props/ai；显式剔除函数/symbol/undefined，既有接口不应该泄露 runtime callbacks。
- [createAssistantContribution](../../../packages/assistant/designer-bridge/src/contribution.ts) L133 通过 getter 读取当前 manifest，L155 撤销自己的 locale；并非只在应用启动时固定全量 builtin manifest。
- [createRegistryFromManifest](../../../packages/assistant/material-knowledge/src/from-manifest.ts) L51 根据 knowledge → ai → binding 逐级派生知识，过滤旧 `container` 类型；AI descriptor 可缺省。新插件的可用能力与 manifest 必须一致，不能把默认未安装物料重新加入 AI。

## 既有公共入口与最小兼容矩阵

| 入口 | 需要保留或明确迁移的行为 |
| --- | --- |
| [designer/index.ts](../../../packages/designer/src/index.ts) | `registerMaterialBundle`、注册类型、DesignerStore、setupStore、runtimeConfig、ContributionRegistry 与 contribution descriptors 已对外导出 |
| [builtin/index.ts](../../../packages/builtin/src/index.ts) | 默认/all/basic/none 的 Designer/Viewer bundles、材料数组、注册便捷函数、AI 描述符别名 |
| [builtin/package.json](../../../packages/builtin/package.json) | 公开 `.`、`./all`、`./basic`、`./none`；没有独立 `./designer`/`./viewer`/`./ai` exports |
| [builtin/designer.ts](../../../packages/builtin/src/designer.ts) L743 / [viewer.ts](../../../packages/builtin/src/viewer.ts) L107 | basic 排除 chart 和 signature，none 为空；数组浅拷贝，嵌套条目未深复制；不能改变 preset 成员集合 |
| [viewer/index.ts](../../../packages/viewer/src/index.ts) | createViewer、ViewerRuntime、MaterialRendererRegistry、renderPages、host adapters 及核心协议再导出 |
| [viewer/runtime.ts](../../../packages/viewer/src/runtime.ts) | registerMaterial、公开 materialRegistry/hook accessors、registerExporter/registerPrintDriver 的现有调用链 |
| [playground/src/App.vue](../../../playground/src/App.vue) / [viewer-materials.ts](../../../playground/src/viewer-materials.ts) | UI 宿主同时示范 Designer bundles 与 Viewer 注册；Assistant contribution 必须继续工作 |
| [internal-packages/viewer-runtime/src/main.ts](../../../internal-packages/viewer-runtime/src/main.ts) | 内嵌/服务端渲染资产显式注册 all，必须纳入集成迁移，不能只改 playground |

## 验证基础与缺口

已有测试可作为迁移前后基线：

- [designer-store.test.ts](../../../packages/designer/src/store/designer-store.test.ts)：注册、catalog、缓存扩展、lazy loading、locale 优先级和 locale disposer；未验证 material disposer。
- [builtin/designer.test.ts](../../../packages/builtin/src/designer.test.ts)、[index.test.ts](../../../packages/builtin/src/index.test.ts)、[condition.test.ts](../../../packages/builtin/src/condition.test.ts)：preset、目录完整性、公开别名、特殊 binding/lazy/default condition。
- [contribution-registry.test.ts](../../../packages/designer/src/contributions/contribution-registry.test.ts)：当前只有 confirm 桥接测试，不能宣称已有安装/回滚/卸载契约保障。
- [material-manifest.test.ts](../../../packages/assistant/designer-bridge/src/material-manifest.test.ts)、[from-manifest.test.ts](../../../packages/assistant/material-knowledge/src/from-manifest.test.ts)：序列化边界、无 AI descriptor 的知识推导、旧 container 过滤。
- Viewer 的 [runtime.audit.test.ts](../../../packages/viewer/src/runtime.audit.test.ts)、[binding-projector.test.ts](../../../packages/viewer/src/binding-projector.test.ts)、[conditional-schema.test.ts](../../../packages/viewer/src/conditional-schema.test.ts)、[render-surface.test.ts](../../../packages/viewer/src/render-surface.test.ts)：iframe ownerDocument、绑定投影、条件更新、尺寸/页面渲染；另有 print、stack-flow、物料 Viewer/Designer 各自测试。
- 物料级代表不能只选 text：table-data 的自有字段/分页/编辑、flow-row 的 children/测量、custom-chart 的 lazy、barcode 的 indexed binding、page-number 的 pageAware、SVG 的可信/消毒输出都需要保留。

[根 package.json](../../../package.json) 的既有命令：`pnpm test` 等价于 `vitest run --dom`；定向可用 `pnpm exec vitest run <上述测试路径>`；[vitest.config.ts](../../../vitest.config.ts) 使用 happy-dom 和 Vue plugin。[CLAUDE.md](../../../CLAUDE.md) 要求按顺序执行 `pnpm build`、`pnpm lint`、`pnpm typecheck`。本研究仅静态核实测试与脚本，**没有执行并宣称通过测试**。

迁移新增验证建议：两宿主实例互不污染；同插件重复安装/冲突失败不留半注册；lazy 过期不写回；完整卸载后再次安装；活动编辑会话正确退出；旧 API 与新插件得到等价能力集合；AI 只见已安装能力；未知物料的原始 Schema 保留；published exports 与实际输出依赖图证明 Viewer/headless 入口不拉入 Designer UI。图表、表格、binding、condition、locale 的等价性均应检查，不仅检查渲染截图。
