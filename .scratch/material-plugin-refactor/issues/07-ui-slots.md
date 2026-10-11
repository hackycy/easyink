# 确定 UI Slot、宿主服务与旧 Contribution 的迁移边界

Type: grilling
Labels: wayfinder:grilling
Status: resolved
Assignee: Codex
Parent: [EasyInk 物料能力装配层重构地图](../map.md)
Blocked by: 05, 06

## Question

如何定义真正可消费的 UI slot 与受控服务，并在 0.1.0 直接替换旧 Contribution、避免完整 Store 泄漏及 Viewer 引入 Vue？

## Answer

本票经 2026-10-11 逐轮讨论收敛。以下为有效决议及其代码落实约束，替代此前混有未确认设计的七点方案。只完成架构规划，不表示源码已经迁移；不提前确认 Render Session、发布切换与质量票据。

### 首版 UI 范围与代码归属

UI 是完整物料或完整功能扩展的一部分。使用者选入物料即可获得其目录和属性能力；Assistant 的按钮、面板、文案和复用命令由一个扩展集中提供。不得要求用户按位置拆装插件。

| 能力 | 声明内容与行为 | 代码消费者 |
| --- | --- | --- |
| 物料目录 | 物料自带名称、图标、分组、顺序、预设及 dragData；聚合已选物料 | Designer MaterialPanel / 顶部目录 |
| 工具栏操作 | 名称、图标、可用状态、点击回调及可选 order | TopBarB |
| 画布右键操作 | 名称、图标、可用状态、点击回调及可选 order | CanvasContextMenu；需接通当前硬编码菜单的扩展消费 |
| 实例弹层 | 组件及业务 props；状态和操作由当前实例上下文提供 | EasyInkDesigner 的实例弹层消费器 |
| 物料专属属性组件 | 组件及业务 props，默认 append，可显式 replace-body | PropertiesPanel，配合默认 PropSchemaEditor |

契约类型放 `@easyink/plugin-api/ui`，Vue 类型仅限该入口；无 Vue 的属性定义、只读查询与受控编辑契约放 `@easyink/plugin-api/designer`。`plugin-runtime` 只负责能力登记、校验、归属与通用生命周期，不创建 Vue 组件或编辑文档。Designer 实现响应式消费、上下文、错误边界、Teleport 和卸载。

这五类消费能力由框架固定，不开放任意扩展点注册平台。内部描述符可以采用 designer.palette / toolbar / canvas-context-menu / overlay / properties.material 等名称；这些内部名称不转化为作者必须填写的服务或插槽许可清单。

### 已确认：按钮与属性界面的使用方式

用户对以下两项回复“接受”：

- 简单按钮直接提供点击回调，框架传入对应受控上下文，不强制另外注册命令。多个按钮、快捷键或扩展复用动作时才声明独立命令。
- 自定义属性组件默认追加到生成的物料专属表单之后。显式 replace-body 只替换物料专属区域，保留通用位置/尺寸、绑定/条件、选择管理与编辑机制。特殊组件可以完全缺席。

默认 PropSchema、sectionFilter 与特殊组件都随完整物料的 Designer 入口提供；默认表单继续复用 PropSchemaEditor。节点编辑会话的子属性、PropertyPanelOverlay、EphemeralPanel、selection decorations 和 datasource-drop 继续按现有 core 编辑协议消费，表格的 read/write/commit 与 flushPendingEdits 行为保持。

### 已确认：扩展操作的位置与排序

用户对默认位置与可选排序回复“接受”。工具栏新增操作位于现有操作之后；右键新增操作放在内置操作之后的独立分组。首版不提供替换内置操作或相对某个内置按钮插入的配置。

同一扩展区域默认按应用传入扩展的声明顺序展示；需要调整时才填数字 order，小值在前，省略按 0，同值保持声明顺序，同一扩展内保持数组顺序。排序只影响显示，不改变初始化顺序或翻译选值顺序。

物料目录保留现有显式分组和目录条目顺序，不改成物料注册顺序。框架只聚合已选物料，空分组不显示；底层宿主不反向导入 builtin。默认 all/basic/none 与完整物料组合规则以物料票据为准。

### 公共目录数据的代码落点

按已确认的公共分组单一来源、物料不能反向依赖 builtin、无额外用户装配步骤，采用现有 shared 包承载纯数据：从 builtin/src/designer.ts 提取分组 id、label key、order 及公共目录文案，集中放在 shared 的目录数据模块。该模块不依赖 Vue、Designer、plugin-api 或具体物料；声明类型由消费端进行结构校验，不令底层 shared 反向导入插件层。私有文件名可在实现时调整。

保留当前 basic/data/chart/svg/utility 五组及 10/20/30/40/50 顺序；组内条目顺序由各物料目录声明保留。物料 Designer 定义引用同一分组数据；文案随目录能力内部装配，用户不再注册公共分组插件。同 key 同文本按既有 locale 规则共享，不视为重复物料安装。Viewer 入口不引用目录数据或图标组件。

这是既有所有权约束的代码落实，不新增安装包或公共配置步骤。

### 已确认：组件拿到受控上下文的方式

用户对统一 context 接入方案回复“接受”。宿主通过 `context` prop 向扩展组件传入只读状态和受控操作；按钮回调及业务 props getter 通过函数参数获得对应上下文。业务 props 不得覆盖宿主保留的 context。

状态由宿主响应式更新，切换选区后组件随之更新。组件不自行订阅完整 Store，也不通过全局注入或隐式宿主对象获取状态。普通业务 props 可提供组件自己的配置和回调；作者不需要为取得框架服务声明 points/services 或查找 token。

统一传参方式不意味着所有组件拥有相同写权限：物料属性组件使用当前节点/编辑会话上下文，独立功能扩展使用对应 Designer 上下文。查询不能暴露可变 Store 对象；异步操作提交前检查 Host、Scope 和目标编辑会话有效性，失效结果不得修改当前文档或界面。

### 受控操作与真实消费者映射

| 能力 | 允许提供的内容 | 实施约束 |
| --- | --- | --- |
| 只读查询 | 文档、节点、选区、编辑状态、数据源列表、已选物料描述、locale | 不返回 Store、可写 registry、renderer 或组件实例 |
| 普通编辑 | 现有节点/属性编辑、插入删除等受控操作，现有同步事务和撤销重做 | 复用 Designer 编辑通道；不让作者拿实时对象后自行修改 |
| 文档替换 | 归一化并替换整份文档 | 与普通编辑区分，行为见下一节 |
| 文档扩展数据 | 读取和写入扩展使用的文档 namespace | 保留现有 schema.extensions 数据格式，不能借装配迁移丢失 Assistant 快照 |
| 数据源操作 | 已有查询与登记/更新能力 | 数据源是运行时 registry，不因文档回退自动恢复 |
| 交互与功能调用 | confirm、pickAsset、pickFileText、声明命令的调用及诊断 | 使用当前 Host 资源范围，不暴露交互服务内部对象 |

此表固定能力范围和行为，具体函数名可在此范围内整理；不能把完整 Store 换名为 context。物料描述沿用物料票据的当前 Host 投影，Assistant 特有 manifest 类型和 patch 格式不进入通用 plugin-api/runtime。

扩展命令是关联参数/结果类型的复用动作入口，消费器负责调用与错误处理；不自动将每条命令包装为可撤销事务。现有同步编辑 batch 不保证等待异步回调；异步准备应在事务外完成，提交时校验目标，再调用受控编辑通道。不得通过接口迁移宣称增加了跨 await 原子事务。

### 已确认：普通编辑与文档替换的区别

用户确认保留当前语义：普通节点/属性编辑沿用命令、事务和撤销机制；整份文档替换沿用 setSchema 行为，包括归一化、清空选区和普通撤销历史、退出编辑会话及字体预加载。

Assistant 的整份应用、patch、选中元素 patch 和 rollback 当前均使用文档替换。其 patch 解释、选择过滤、应用前后快照及回退策略继续属于 designer-bridge；rollback 恢复保存的 beforeApplySchema，不等同普通 undo，也不回退已注册数据源。

Assistant 快照实际保存在 schema.extensions.assistant，迁移保留字段和扩展自管规则，不能未经决策改成临时插件状态。数据源登记不自动写入文档。宿主受控修改操作负责保留对应的修改标记行为，不要求扩展访问 workbench/saveStatus。

### 实例弹层与清理的代码落点

按上游已确认的每 Host 资源隔离，EasyInkDesigner.vue 的固定 `id="ei-overlay-root"` / 全局 selector 改为每实例持有实际 DOM 根引用。消费器将弹层挂载到当前实例；不要求用户额外配置弹层根。

只读声明可复用，面板开关、资源与运行状态按 Host 创建，不放在跨 Host 共享闭包中。组件挂载属于子 Scope；关闭释放本次挂载，Host 销毁释放其所有弹层和订阅。节点编辑会话的临时属性面板由该会话管理，不提升为全 Host 常驻组件。

### 已确认：扩展界面的局部故障

用户对“扩展界面出错，只影响对应功能，设计器继续运行”回复“接受”。组件加载、挂载、渲染和回调失败隔离在对应界面/操作，给出局部提示及带来源的诊断，不卸载整个物料或扩展。失败组件释放本次挂载；异步 reject 由消费器捕获；迟到结果遵守上游失效与释放规则。

组件首次显示失败也按局部故障处理。声明不合法、身份冲突、缺少必需模型/renderer 或核心消费者初始化失败，仍按核心启动事务整体回滚，不提供忽略所有安装错误的开关。

UI 错误捕获不是文档回滚：普通编辑沿用自己的事务语义，已完成的独立编辑不因后续界面错误被追溯撤销。

### 已确认：Viewer 保留应用预览壳层

用户确认 0.1.0 不新增 packages/viewer-ui、UI adapter 或通用 viewer.overlay 插件点。PreviewOverlay 是 playground 应用壳层，没有 Viewer 插件弹层消费者；保留其预览按钮和设置对话框，通过 Viewer 公共操作完成渲染、导出与打印。

保持独立 Viewer 物料入口及无 UI Viewer。Viewer 的 JS 与声明图不得包含 Designer/Vue/Assistant UI；不要求 UI adapter、supports 或 points/services 配置。出现第二个真实 Viewer UI 消费者并产生复用需要时再另行设计。

界面保持在文档 iframe 输出之外。现有 HTML 提交通道序列化整个 iframe 文档，不能仅在 iframe 内另建 UI root 就宣称所有输出渠道都排除了 UI；本次不向其中迁入预览界面。

### 已确认：不新增属性面板通用前后插槽

用户对缩减范围回复“接受”：保留默认物料表单、物料专属组件 append/replace-body，以及现有节点编辑会话的子属性和临时面板。不新增 designer.properties.before-after，不保留其空注册口、类型或验收要求。

当前 PropertiesPanel 没有该扩展的注册/消费流程，旧草案将其误称为已有消费者。此项不限制物料自定义属性区域，也不影响 Assistant 独立弹层。

### 迁移与验收

- 直接删除旧 Contribution、activate(ctx.store)、contributions prop、完整 Store 注入及旧桥接路径；Assistant、示例和相关测试同步改用新契约，不提供兼容层。
- Assistant 保留按钮/面板、locale、当前物料知识、应用/选中应用/数据源/回退能力；其对话存储业务对象不等于 DesignerStore，不因名为 store 而误删。
- 用真实 UI 消费验证工具栏和右键位置、稳定排序、直接回调与可复用命令、物料属性 append/replace-body 及通用属性不被替换。
- 验证双 Designer 的 selection、locale、弹层、面板开关和资源不串扰；局部组件/回调失败不会摧毁其他功能；关闭和销毁后迟到结果不写回。
- 验证普通编辑撤销、文档替换清历史、Assistant 快照与数据源独立语义；table 子属性/临时面板和 flushPendingEdits 不退化。
- 类型消费覆盖 context 与组件/回调匹配、不暴露完整 Store、Viewer 无 Vue 声明依赖；无 UI Viewer 和实际应用预览/打印/导出均可运行。
- 对照 all/basic/none 冻结目录、分组、文案与顺序；自行组合完整物料无需补注册目录。

## 决策历史与依据

2026-10-10 用户要求完整重构后手动发布 0.1.0、取消旧 API 和兼容层；此前代理补写方案未经逐项确认，票据重开。2026-10-11 用户逐轮确认按钮直接回调、属性组件默认追加、局部 UI 故障隔离、Viewer 保留应用壳层、按钮位置与排序、context prop、普通编辑与文档替换语义，以及不新增通用属性面板前后插槽。本次整理只收敛这张 UI 票据，不把下游草案视为确认。

源码依据：Designer contributions/types.ts、EasyInkDesigner.vue、TopBarB.vue、CanvasContextMenu.vue、PropertiesPanel.vue；assistant/designer-bridge 的 contribution.ts、apply.ts、material-manifest.ts；designer/store/designer-store.ts 和 editing/transaction-service.ts；builtin/src/designer.ts；playground/PreviewOverlay.vue 与 viewer/src/runtime.ts。旧“七种都已存在”的判断撤回；右键菜单扩展须实际接通，Viewer UI 与通用前后插槽已明确移出首版。
