# 23. 关键设计决策记录

| # | 决策 | 选项 | 结论 | 理由 |
|---|------|------|------|------|
| 1 | 渲染策略 | Canvas / DOM / 双渲染器 | **统一 DOM** | 中文排版精度优先，CSS 打印支持成熟 |
| 2 | 数据绑定 | 简单路径 / 完整表达式 / 可插拔 | **可插拔引擎** | 核心轻量，表达式能力按需扩展 |
| 3 | ~~分页策略~~ | ~~固定 / 自动 / 混合~~ | **不分页** | 单页/连续纸定位，不支持分页（小票、标签、发票等场景无需分页） |
| 4 | 插件粒度 | 元素级 / 全生命周期 / 微内核 | **全生命周期** | 覆盖元素、渲染、工具栏、面板、导出等全部扩展点 |
| 5 | PDF 生成 | 纯客户端 / 服务端 / 可插拔 | **可插拔管线** | 由部署环境决定，内置双实现 |
| 6 | 布局模式 | 绝对 / 流式 / 混合 | **混合布局** | 自由设计与动态内容兼得 |
| 7 | 单位存储 | 统一 mm / 统一 pt / 用户单位 | **用户选择的单位** | Schema 可读性优先，渲染时转换 |
| 8 | 多渲染器 | 多输出 / 多框架 / 两者 | **暂只多输出** | v1 专注 Vue，降低复杂度 |
| 9 | ~~分页冲突~~ | ~~推开 / 锁定 / 带 slot~~ | **不适用** | 不分页，溢出策略由 PageSettings.overflow 控制（clip/auto-extend） |
| 10 | Undo/Redo | 快照 / Command / Immer | **Command 模式** | 细粒度控制、可合并、支持事务 |
| 11 | ~~元素类型~~ | ~~最小集 / 渐进 / 全内置~~ | ~~**全内置**~~ | 已迁移到物料系统（ADR #101），所有元素类型外置为独立物料包 |
| 12 | 数据源 UX | 先定义/直接绑定/共存/开发方注册 | **开发方注册数据源** | 数据源由集成方注册字段树（递归 children），设计用户通过字段树拖拽绑定 |
| 13 | Schema 迁移 | 版本+迁移 / 向后兼容 / 结合 | **SemVer 式结合** | 小版本兼容、大版本迁移 |
| 14 | 目标用户 | 开发者 / 终端用户 / 分层 | **分层架构** | headless core + 完整 UI，类似 Tiptap |
| 15 | 表格复杂度 | 简单 / 中等 / 完全 | **拆分为两种表格** | data-table 绑定数据源，table 纯静态；各自职责清晰，避免单一元素过于复杂 |
| 16 | 包拆分 | 粗 / 细 / 渐进 | **框架层 4 包 + 物料层 N 包** | core / renderer / designer / shared 为框架层；每个元素类型一个物料包（@easyink/material-*） |
| 17 | 字体管理 | 系统字体 / 内置管理 / Provider | **FontProvider 接口** | 核心不关心存储，实集方自由实现 |
| 18 | 数据预览 | 占位符 / 实时 / 智能模拟 | **占位符显示** | 设计器不填充实际数据；未绑定显示静态值，已绑定显示 {{path}} 占位符（灰色虚线框区分），data-table 显示表头+N行占位 |
| 19 | 模板复用 | 不支持 / 引用 / 副本 | **不支持** | v1 保持简单 |
| 20 | 状态管理 | Vue Reactivity / 无关 / Pinia | **Vue Reactivity** | 与 Vue 生态深度融合 |
| 21 | 跨框架 | @vue/reactivity / Schema 统一 / 不考虑 | **暂不考虑** | v1 专注 Vue |
| 22 | 表达式安全 | 沙箱 / 信任 / 可配置 | **沙箱化执行** | 防止模板注入攻击 |
| 23 | API 风格 | Composable / Class / 混合 | **混合** | 核心 Class + Vue Composable 封装 |
| 24 | 事件架构 | EventEmitter / 可拦截 / 分类 | **分类钩子** | 同步可拦截 + 异步只通知 |
| 25 | 属性面板 | 可替换组件 / Schema 驱动 / 固定 | **Schema 驱动** | 元素类型定义声明属性，面板自动生成 |
| 26 | 数据源格式 | JSON Schema / 样例推断 / 自定义 | **DataFieldNode 递归树** | 递归 children 结构，叶子节点有 key/title/description，仅做展示分组 |
| 27 | 构建工具 | Vite / Rollup / tsdown | **tsdown + rollup-plugin-vue** | 零配置 + Vue SFC 支持 |
| 28 | 输出格式 | ESM+CJS+UMD / ESM+CJS / ESM | **ESM only** | 现代工具链标准 |
| 29 | 测试 | 核心单测 / 全面 / 单元+E2E | **单元 + E2E** | 核心逻辑单测 + 关键路径 E2E |
| 30 | 设计器样式 | Tailwind / CSS Modules / 变量+Scoped | **CSS 变量 + Scoped** | 样式隔离 + 可主题化 |
| 31 | i18n | 仅中文 / 中英 / 外部化 | **外部化 + 中文默认** | 文案全外部化，内置中文包 |
| 32 | 数据源命名空间 | 合并单一对象 / 命名空间隔离 / 全局扁平 | **扁平 + 对象数组共存** | 标量全局唯一 key + 对象数组一层嵌套，setData 接收 Record<string, unknown> |
| 33 | 多数据源注册 | 仅初始化 / 动态注册 / 可替换 | **初始化 + 可替换** | 初始化传入 + 支持 unregister/re-register 替换 |
| 34 | 表格数据绑定 | 对象数组 repeat / 每列独立源 / 两者共存 | **每列独立绑定 + 同源约束** | data-table 不持有 binding，每列通过 binding.path 点路径绑定同一对象数组的属性（如 orderItems.itemName），同源设计时+运行时双重校验 |
| 35 | 表格列宽 | 固定值/百分比混合 / 纯百分比 / flex | **强制百分比 + 联动调整** | 两种表格均使用百分比列宽，总和恒为 100%，设计器拖拽列宽时联动相邻列 |
| 36 | ~~表格空数据~~ | ~~占位/折叠/可配置~~ | ~~**可配置 emptyBehavior**~~ | 已移除 emptyBehavior，data-table 所有列空时仅渲染表头 |
| 37 | ~~表格汇总行~~ | ~~内置聚合/独立源/双轨~~ | ~~**双轨**~~ | 已从 data-table 移除汇总行功能 |
| 38 | ~~汇总行定位~~ | ~~每页小计/尾页总计/双层~~ | ~~**全局聚合**~~ | 已移除 |
| 39 | ~~表格单元格合并~~ | ~~表头+数据行 / 仅表头 / 预留~~ | ~~**仅表头合并**~~ | data-table 简化为仅列标题+基本样式，静态表格 v1 不支持合并 |
| 40 | 表格设计器交互 | 属性面板 / 画布编辑 / 混合 | **分别处理** | data-table 通过属性面板逐列绑定+画布拖拽列宽；静态 table 画布直接点击单元格编辑+右键增删行列 |
| 41 | data-table 列绑定校验 | 设计时/运行时/不校验 | **设计时+运行时双重校验** | 设计时校验同源前缀一致；运行时校验前缀一致+resolve 结果为数组 |
| 42 | ~~多表格分页~~ | ~~顺序排列 / 强制新页 / 单表格限制~~ | **不适用** | 不分页，多表格按流式文档流顺序排列 |
| 43 | ~~单行超高~~ | ~~截断/跨页/上限~~ | **不适用** | 不分页，auto-extend 模式下纸张自动延长 |
| 44 | 跨列数据引用 | 不支持 / 聚合helper / 跨作用域 | **不支持** | 各列完全隔离，表达式不能跨列引用同行数据 |
| 45 | 动态列 | 条件显隐 / repeat列 / 不支持 | **不支持** | v1 只做静态列声明，动态列需求由业务层预生成 Schema |
| 46 | 数据字段维度 | 注册时声明 / 运行时推断 / 统一列表 | **运行时推断** | 注册时不区分标量/列表，运行时由 setData 传入的数据类型决定 |
| 47 | 字段树结构 | DataFieldSchema 递归 / 扁平+group / children 树 | **递归 children 树** | 仅做设计器展示分组，不影响绑定逻辑 |
| 48 | 字段名冲突 | 报错 / 前缀约定 / 允许覆盖 | **允许覆盖** | 后注册的同名字段覆盖先注册的 |
| 49 | setData 格式 | namespace+flat / 全局flat / 兼容 | **标量+对象数组混合** | Record<string, unknown>，值可为标量或对象数组（一层），resolve 扁平优先+点路径 fallback |
| 50 | data-table 行数 | 最长列 / 要求等长 / 指定主列 | **源数组.length（同源必等长）** | 同源约束保证各列等长，元素缺失属性为 undefined |
| 51 | 标量绑定 data-table 列 | 每行重复 / 仅首行 / 禁止 | **禁止（运行时 throw）** | 严格校验，data-table 列 resolve 后必须为数组 |
| 52 | ~~data-table 分页切行~~ | ~~先算行数后切分 / 各列独立切片~~ | **不适用** | 不分页，所有行在单页/连续纸中输出 |
| 53 | 点路径绑定深度 | 一层 / 多层 / 任意 | **仅一层（array.field）** | 打印模板无需更深嵌套，简化 resolve 逻辑 |
| 54 | resolve 优先级 | 扁平优先 / 点路径优先 / 统一 | **扁平优先 + 点路径 fallback** | 先查 key in data，miss 才拆点解析，兼容纯扁平场景 |
| 55 | key 含点号 | 允许 / 禁止 | **禁止** | 避免扁平 key 与点路径歧义 |
| 56 | data-table 同源约束 | 设计时 / 运行时 / 双重 / 不校验 | **设计时 + 运行时双重** | Schema 不存储 sourceKey，data-table 仍为纯列容器 |
| 57 | 字段树 array 标记 | 标记 / 不标记 | **不标记** | 按拖放目标推断，设计器不区分普通分组与对象数组源 |
| 58 | 拖放到非 data-table 目标 | 校验拒绝 / 允许降级 | **允许拖任意位置** | 运行时由渲染器降级展示 |
| 59 | DataFieldNode fullPath | 支持 / 不支持 | **叶子可自定义 fullPath** | 混合模式，兼容扁平和嵌套 |
| 60 | resolve API 拆分 | 二元 / 统一 | **统一 resolve 返回原始值** | 调用方根据上下文判断类型 |
| 61 | ElementTypeDefinition 渲染函数 | core 含 render / core 仅声明 / 泛型占位 | **core 仅声明** | core 是 headless 层，不含 DOM/Vue 依赖，render 由 renderer/designer 包附加 |
| 62 | icon 类型 | string \| Component / 仅 string / 泛型 | **仅 string** | core 框架无关，Vue Component 类型留给 designer 包扩展 |
| 63 | 混合布局冲突 | 流式跳过绝对占位 / 绝对脱离文档流 | **绝对脱离文档流** | 同 CSS absolute 标准行为，实现简单可预测 |
| 64 | auto height 策略 | 估算+needsMeasure / 仅标记 / 精确计算 | **估算+needsMeasure** | LayoutEngine headless 无 DOM 测量，表格按行数估算，渲染层二次精确测量 |
| 65 | ~~Region 分配~~ | ~~elementIds 标记归属 / pagination.behavior 控制~~ | **移除 Region 模型** | 不分页，无需 header/body/footer 区域划分，TemplateSchema 移除 regions 字段 |
| 66 | 内容溢出策略 | clip / auto-extend / 可配置 | **PageSettings.overflow 可配置** | clip 固定裁切，auto-extend 热敏纸连续延长；渲染层按 delta 偏移所有绝对元素 |
| 67 | auto-extend 绝对元素 | 不动 / 下方偏移 / 全部偏移 | **全部偏移** | 渲染层对所有绝对元素 y 加上流式内容 delta（bodyContentHeight - 声明高度差） |
| 68 | 迁移版本匹配 | SemVer range / 精确 major / semver 库 | **精确 major 匹配** | fromMajor 为 number，不引入 semver 库，保持零依赖 |
| 69 | 字体管理架构 | 内置管理 / Provider 接口 / 不管理 | **FontProvider + FontManager** | Provider 接口由消费者实现，FontManager 提供缓存+预加载，core 层不含 DOM |
| 70 | 纸张背景扩展机制 | 扁平可选字段 / 联合类型判别 / 独立 opacity+联合内容 | **联合类型判别** | `BackgroundLayer` 用 `type` 字段区分层类型（color/image），v2 可新增 gradient/pattern |
| 71 | 纸张背景数据结构 | 单层 / 固定 color+image / 多层 layers 数组 | **多层复合 `{ layers: BackgroundLayer[] }`** | 不限层数，类似 CSS 多背景 / Figma Fill 列表 |
| 72 | 纸张背景层级顺序 | 上层在前（CSS 顺序）/ 底层在前 | **底层在前（索引 0 最底，末尾最顶）** | 对人更直觉（底层在前），渲染时逆序映射 CSS |
| 73 | 背景层通用属性 | 仅 opacity / opacity + enabled / 全局 opacity | **opacity + enabled** | 每层独立透明度 + 可见性开关，支持快速切换而不删除 |
| 74 | 背景图片来源 | 仅 URL/base64 / 支持数据绑定 / ImageProvider | **仅 URL/base64** | 与 image 元素的 src 属性保持一致 |
| 75 | 背景图片定位 | 9 宫格预设 / CSS 自由值 / 预设+偏移 | **9 宫格预设值** | 覆盖常见需求，UI 用 9 宫格选择器，直观 |
| 76 | 背景渲染范围 | 全纸张（含 margin）/ 仅内容区 | **全纸张（含 margin）** | 背景绘制在整个页面节点上，简单直观 |
| 77 | 背景 auto-extend 行为 | 颜色延伸+图片按 repeat / 图片也拉伸 / 图片固定 | **颜色+图片都随纸张延伸** | 颜色天然跟随容器；图片也拉伸延长（background-size 高度 100%） |
| 78 | 背景输出一致性 | 所有输出一致 / 打印可跳过 / 按输出类型配置 | **所有输出完全一致** | 屏幕预览/iframe 打印/PDF/图片导出行为相同 |
| 79 | 背景图片加载失败 | 穿透下层+提示 / 占位色块 / 静默忽略 | **穿透到下层 + 设计器提示** | 自然降级到下方层，设计器中额外显示断裂图标 |
| 80 | 背景与元素级背景统一 | 统一 BackgroundStyle / 不统一 / 预留 v2 | **不统一** | v1 ElementStyle.backgroundColor 保持 string 不变，新类型仅用于 PageSettings |
| 81 | 背景 Undo 粒度 | 每层操作独立 Command / 复用 UpdatePageSettings / 属性可合并 | **每个层操作独立 Command** | 增/删/改属性/调序各为独立撤销步骤，粒度精细 |
| 82 | 背景 UI 入口 | PropertyPanel 无选中时 / Toolbar 按钮 / SidebarPanel 标签 | **SidebarPanel 新增页面设置标签** | 与图层/数据源并列，集中管理所有 PageSettings |
| 83 | 页面设置面板结构 | 单一标签页 / 纸张+样式子分组 / 折叠分组 | **单一页面设置标签页** | 所有 PageSettings 字段集中在一个标签页 |
| 84 | 背景 Layer UI 风格 | Figma 垂直列表 / 卡片全展开 / 手风琴 | **Figma 风格垂直列表** | 每层一行预览+眼睛开关+拖拽手柄，点击展开编辑 |
| 85 | 背景 Layer 数量限制 | 不限制 / 限制 5 层 / v1 限 2 层 | **不限制** | 用户自由添加，极端情况不太会发生 |
| 86 | 表格拆分 | 单一 table / data-table + table / data-table + static-table | **data-table + table** | data-table 绑定数据源（动态行数），table 为纯静态文本表格（固定行列） |
| 87 | 静态表格存储 | 二维数组 rows[][] / 稀疏 cells[] / columns + rows | **稀疏 cells: { row, col, content }[]** | 支持未来合并单元格扩展，空单元格不占存储 |
| 88 | 静态表格单元格 | 纯文本 / 可绑定 / 可嵌套子元素 | **纯文本** | v1 保持简单，不支持单元格级别数据绑定 |
| 89 | 静态表格样式粒度 | 单元格级别 / 行列级别 / 全局统一 | **全局统一** | v1 不支持单元格独立样式，通过 ElementStyle 统一控制 |
| 90 | 静态表格行高 | 统一行高 / 每行独立 / auto | **auto** | 由内容撑开，适配不同文本长度 |
| 91 | 静态表格合并 | 任意合并 / 仅表头 / 不支持 | **v1 不支持** | 后续版本扩展，v1 保持简单 |
| 92 | 静态表格初始规格 | 2x2 / 3x3 / 弹窗选 | **3x3** | 常见打印单据表头通常 3 列以上 |
| 93 | 静态表格行列操作 | 属性面板 / 右键菜单 / 两者 | **右键菜单** | 画布上直接操作更直觉 |
| 94 | data-table 汇总行 | 保留 / 移除 / 简化 | **移除** | 简化 data-table 职责，汇总需求由业务层处理 |
| 95 | data-table emptyBehavior | 保留 / 移除 | **移除** | 空数据时仅渲染表头，简化配置 |
| 96 | data-table header | 完整配置 / 简化 | **简化** | 仅保留列标题和基本样式，移除表头合并 |
| 97 | data-table 预览行数 | 入 Schema / 纯设计器 | **纯设计器本地设置** | 默认 2 行，不入 Schema，不影响运行时 |
| 98 | 绑定占位符视觉 | 同静态样式 / 虚线框区分 / 角标提示 | **灰色虚线框 + 不同文字颜色** | 明确区分绑定与静态内容 |
| 99 | 绑定模式下静态值 | fallback / 完全覆盖 / 互斥 | **fallback** | 静态值在绑定后保留，运行时数据未填充时降级显示 |
| 100 | 表格工具栏展示 | 分组下拉 / 并列按钮 / 二级菜单 | **并列两个按钮** | 数据表格和静态表格同在 table 分组，平铺展示 |
| 101 | 元素类型组织 | 全内置 / 全物料化 / 混合 | **全物料化** | 所有元素类型（含基础 text/image/rect/line）均为独立物料包，core 层仅保留注册机制 |
| 102 | 物料包粒度 | 每个一个包 / 合并一个包 / 分组包 | **每个物料一个 npm 包** | 如 @easyink/material-text、@easyink/material-barcode，最大灵活性 |
| 103 | 物料包导出 | 三合一 / 按层拆子导出 / tree-shaking | **两个 subpath exports** | /headless（定义 + 渲染函数）、/designer（Vue 组件 + Behavior），按需导入 |
| 104 | 物料注册 API | 复用 Plugin.install / 专用 useMaterial | **专用 useMaterial API** | 物料有独立的注册入口，与插件系统职责分离 |
| 105 | 设计器行为声明 | 函数式 handler / 声明式 + 解释器 / trait 组合 | **声明式配置 + 解释器模式** | 物料声明字符串原语（如 'inline-edit'），框架解释执行 |
| 106 | 行为原语集合 | 开放可扩展 / 严格封闭 / 混合 | **严格封闭** | 内置一组核心原语，物料只能选择，不能自定义注册新原语 |
| 107 | 属性面板扩展 | 完全自定义面板 / propDefinitions + 插槽 / 混合 | **propDefinitions + custom editor** | 在 propDefinitions 中支持 editor: 'custom'，物料提供 Vue 组件作为属性编辑器 |
| 108 | 设计器画布渲染 | 与渲染器共享 / 独立两套 | **独立两套渲染** | 设计器画布用物料的 Vue 组件渲染（占位符 + 交互），渲染器用渲染函数（数据填充后 DOM） |
| 109 | core 层内置元素 | 保留最小集 / 清空 builtins | **清空 builtins** | core 保留 ElementRegistry + ElementTypeDefinition 接口，不包含任何内置元素定义 |
| 110 | 物料 scaffolding | CLI 工具 / 模板仓库 / 纯文档 / 暂不做 | **暂不做** | 稳定后再建设工具链 |
| 111 | 数据源拖入交互 | 简单绑定 / 弹出配置 / 元素自定义 | **保持简单拖拽绑定** | 拖入即绑定到默认 prop，不弹出额外配置 |
| 112 | 物料与插件边界 | 物料即插件 / 完全分离 / 物料可依赖插件 | **完全分离** | 物料 = 元素全部实现（useMaterial），插件 = 全局扩展（use），职责不重叠 |
| 113 | 内置物料消费方式 | 消费者单独安装 / 框架包内置 / 自动注册 | **框架包 dependencies + 自动注册** | 物料包是 renderer/designer 的 dependencies，消费者只装 @easyink/renderer 或 @easyink/designer 即可，初始化时自动注册所有内置物料 |
| 114 | 物料层数 | 三层（core/renderer/designer） / 两层（headless/designer） | **两层** | headless = 定义 + 渲染函数（框架无关），designer = Vue 组件 + Behavior + 编辑器；减少一层拆分复杂度 |
| 115 | 第三方物料注册 | 自动发现 / 手动 useMaterial / 配置声明 | **手动 useMaterial()** | 第三方物料通过 useMaterial() API 手动注册，内置物料自动注册不暴露给消费者 |
| 116 | 复杂物料交互状态机 | 全框架管理 / 全物料管理 / 混合 | **混合：框架管高层 + 物料管内部** | 框架管理 idle/selected/editing 三层全局状态；editing 内的子状态（cell-editing/column-resizing 等）由物料 designerComponent 内部管理 |
| 117 | 物料与框架通信 | 固定事件名 / 单一通用事件 / inject API | **单一通用事件 material:action** | 核心封闭 action（enter-edit/exit-edit/update-prop/sub-select/commit-change）+ 开放扩展（框架忽略未知 action，插件可监听） |
| 118 | 物料上下文注入 | 精简 Props 仅传递 / 完整 provide/inject / 两者结合 | **精简 Props + 注入完整上下文** | Props 传 element/isSelected/isEditing/scale；provide/inject 注入 emitAction/panelController/commandManager/schemaEngine |
| 119 | Overlay 分层 | 框架级在上 / 物料级在上 / 平级调度 | **三层分离** | 底层 designerComponent -> 中层物料 overlay（元素边界内）-> 顶层框架 SelectionOverlay（缩放/旋转 handle） |
| 120 | 物料 Overlay 注册 | 声明式框架内置 / 物料提供自定义组件 / 混合 | **物料提供自定义 overlay Vue 组件** | MaterialDesignerExport 新增 overlay 字段，选中时创建、取消选中时销毁 |
| 121 | 属性面板子级联动 | emit sub-select -> 框架存储 / 物料直接控制面板 / 物料内部共享状态 | **inject PropertyPanelController** | 物料通过注入的 controller 调用 setActiveGroup/setSubSelection/scrollToGroup 等方法直接控制面板 |
| 122 | 表格 border 粒度 | 仅全局 / 全局+行列 / 全局+单元格 | **全局 + 行列级覆盖** | 全局 TableBorderConfig + 行/列级 Partial 覆盖，优先级：列级 > 行级 > 全局 |
| 123 | 表格点击行为 | 单击=选中表格 / 单击=直接定位子区域 / 两步选中 | **单击直接定位子区域** | 点击表头=选中列，点击行侧=选中行，点击单元格=选中单元格；双击进入编辑 |
| 124 | ESC 退出层级 | 逐层退出 / 一键退出 | **一键退出到 unselected** | ESC 直接退出到未选中状态，不做分层退出 |
| 125 | Editing 态框架行为 | 禁用外层交互 / 物料自行防御 | **框架禁用外层交互** | enter-edit 后框架禁用拖动/缩放/旋转/全局快捷键，保留点击外部取消选中 |
| 126 | 键盘事件路由 | 框架拦截+条件转发 / 物料 stopPropagation | **框架拦截 + 条件转发** | editing 状态下 Delete/Tab/Enter/方向键转发给物料处理，ESC/Ctrl+Z 仍由框架处理 |
| 127 | 行为原语定位调整 | 通用模型 / 仅简单物料适用 / 废弃 | **原语用于简单物料，复杂物料自实现** | 行为原语作为简单物料的入口开关；复杂物料（table/data-table/rich-text）交互完全由 designerComponent + overlay + 事件合同自行实现 |
| 128 | 多选时物料 overlay | 保留 / 隐藏 | **多选时隐藏** | 多元素选中时隐藏所有物料 overlay，仅显示框架多选 bounding box |
| 129 | 外部点击退出编辑 | 框架触发 exit-edit / 物料 watch isSelected | **框架触发 exit-edit** | 点击外部时框架自动通知物料退出编辑，物料提交未完成编辑并清理状态 |
| 130 | 物料层共享包 | 不共享 / overlay + 类型 + 工具 / 仅 overlay | **overlay + 类型 + 工具** | @easyink/material-shared 包含共用 overlay 组件（ColumnResizeOverlay）、共享类型（TableBorderConfig）、工具函数（列宽计算、border 合并） |
| 131 | 表格缩放/旋转限制 | 无限制 / 禁止旋转 / 旋转时禁用内部交互 | **无限制** | 表格可缩放、可旋转，与其他元素一致 |
| 132 | 物料子状态持久化 | 纯瞬态 / 框架 designerState | **纯瞬态** | 子选中状态仅存于物料 Vue 组件内部 ref，取消选中自动重置，不入 Schema |
| 133 | Undo 策略（列宽拖拽） | 每 mousemove 提交 / throttle+合并 / mouseup 提交一次 | **mouseup 时提交一次 Command** | 拖拽过程仅更新视觉，mouseup 时生成单个 UpdateColumnWidthCommand |
| 134 | 列宽拖拽 handle 实现 | designerComponent 内部 / 框架覆盖层 / 混合 | **designerComponent 内部** | 物料 Vue 组件自行渲染 resize handle 并处理拖拽，通过 emit 通知框架更新 Schema |
| 135 | PropertyPanelController 接口 | 精简（setActiveGroup+setSubSelection+clear） / 扩展（+scrollTo+collapse+registerDynamic） | **扩展接口** | 完整接口含 setActiveGroup/setSubSelection/clearSubSelection/scrollToGroup/collapseAll/expandAll/registerDynamicGroup |
| 136 | 共用 ColumnResizeOverlay 位置 | 框架内置 / 物料层共享包 / 跨物料直接依赖 | **物料层共享包** | 放在 @easyink/material-shared，data-table 和 table 共同依赖 |
| 137 | data-table 双击行为 | 统一编辑所有单元格 / 按区域分别处理 | **按区域分别处理** | 双击表头=编辑列名，双击数据行=仅选中该行（数据来自绑定不可编辑） |
