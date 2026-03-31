# 物料体系重构 -- 实施阶段规划

> 本文档规划将现有 Element 体系重构为 Material（物料）体系的完整代码编写步骤。
> 每种物料独立成包（`@easyink/material-*`），基础设施包（core/renderer/designer）仅提供注册中心和类型接口。
> 每个阶段按依赖顺序排列，前置阶段必须完成后才能开始下一阶段。

---

## Phase 0: 基础设施准备

### 0.1 新建 @easyink/ui 包

- [ ] 在 `packages/ui/` 下初始化包结构（package.json、tsconfig.json、tsdown.config.ts）
- [ ] 配置 pnpm-workspace.yaml 包含新包
- [ ] 设置包依赖：仅依赖 `@easyink/shared`
- [ ] 创建 `src/index.ts` 入口文件
- [ ] 创建 `src/styles/` 目录，定义 CSS 变量主题基础
- [ ] 不对外导出（package.json 设置 `"private": true` 或不在消费方范围内）

### 0.2 Iconify 离线集成

- [ ] 安装 `@iconify/vue` 和所需图标数据包（如 `@iconify-json/lucide`）
- [ ] 在 `packages/icons/` 下配置离线图标打包
- [ ] 确保打包产物包含所有内置物料图标（text/image/rect/line/barcode/table/data-table）
- [ ] 验证图标在无网络环境下正常加载

### 0.3 pnpm-workspace.yaml 更新

- [ ] 新增 `packages/materials/*` 路径到 workspace packages 列表
- [ ] 验证 pnpm install 正确识别新路径

### 0.4 确保现有测试通过

- [ ] 运行全量测试，记录基线通过率
- [ ] 标记需要重构的测试文件

---

## Phase 1: Core 层重命名与重构

> 目标：将 `@easyink/core` 中的 Element 体系全部重命名为 Material，引入 PropSchema 类型，**移除内置物料定义**（迁移到独立物料包）。

### 1.1 类型重命名

- [ ] `packages/core/src/schema/types.ts`：
  - `ElementNode` → `MaterialNode`
  - `ElementLayout` → `MaterialLayout`
  - `ElementStyle` → `MaterialStyle`
  - `TemplateSchema.elements` → `TemplateSchema.materials`
- [ ] `packages/core/src/schema/defaults.ts`：更新默认值引用
- [ ] `packages/core/src/schema/engine.ts`：更新所有 Element 引用

### 1.2 物料注册中心重构

- [ ] 重命名目录：`packages/core/src/elements/` → `packages/core/src/materials/`
- [ ] `types.ts`：
  - `ElementTypeDefinition` → `MaterialTypeDefinition`
  - `PropDefinition` → `PropSchema`（完整重构为受 JSON Schema 启发的规范）
  - 新增 `PropSchemaType` 类型
  - PropSchema 增加：`type`、`enum`（label+value）、`min`/`max`/`step`、`maxLength`、`pattern`、`properties`、`items`、`disabled`、`onChange`、`description`
- [ ] `registry.ts`：`ElementRegistry` → `MaterialRegistry`
  - 新增 `listByCategory()` 方法
  - 新增 `categories()` 方法
  - **移除所有内置物料注册**（注册中心初始为空）
- [ ] **删除** `builtins.ts`（内置物料定义迁移到独立包）
- [ ] `index.ts`：更新导出名称，仅导出类型和注册中心

### 1.3 其他 Core 模块适配

- [ ] `packages/core/src/plugin/types.ts`：PluginContext 中 `elements` → `materials`
- [ ] `packages/core/src/plugin/hooks.ts`：`beforeElementCreate` → `beforeMaterialCreate`
- [ ] `packages/core/src/plugin/manager.ts`：适配新接口名称
- [ ] `packages/core/src/engine/facade.ts`：更新 API 方法名
- [ ] `packages/core/src/layout/engine.ts`：`ElementNode` → `MaterialNode` 引用
- [ ] `packages/core/src/layout/types.ts`：更新类型引用
- [ ] `packages/core/src/datasource/resolver.ts`：更新注释中的元素引用
- [ ] `packages/core/src/command/`：更新 Command 中的类型引用
- [ ] `packages/core/src/index.ts`：更新全部导出

### 1.4 Core 测试更新

- [ ] 更新 `packages/core/src/materials/__tests__/` 下所有测试
- [ ] 更新 `packages/core/src/schema/__tests__/` 下所有测试
- [ ] 更新其他模块测试中的类型引用
- [ ] 运行 `pnpm --filter @easyink/core test` 确保全部通过

---

## Phase 2: Shared 包类型更新

- [ ] `packages/shared/src/types/`：更新所有公共类型导出中的 Element 引用
- [ ] 确保 shared 包导出的类型名称与 core 一致
- [ ] 运行 shared 包测试

---

## Phase 3: Renderer 层适配

### 3.1 类型重命名

- [ ] `packages/renderer/src/dom/`：所有渲染函数参数 `ElementNode` → `MaterialNode`
- [ ] `packages/renderer/src/types.ts`：更新类型导出
- [ ] `packages/renderer/src/screen.ts`：更新渲染器接口中的类型
- [ ] `packages/renderer/src/index.ts`：更新导出

### 3.2 MaterialRendererRegistry

- [ ] 创建 `packages/renderer/src/dom/renderer-registry.ts`
  - 定义 `MaterialRenderFunction` 类型
  - 实现 `MaterialRendererRegistry`：`register(type, renderFn)` / `get(type)` / `has(type)`
  - 渲染器通过注册表查找物料对应的渲染函数
- [ ] **移除内置渲染函数硬编码**（迁移到各物料包的 `/render` 子路径）
- [ ] 更新渲染管线：通过 `rendererRegistry.get(node.type)` 查找渲染函数

### 3.3 Renderer 测试

- [ ] 更新 renderer 测试
- [ ] 运行 `pnpm --filter @easyink/renderer test` 确保通过

---

## Phase 4: 内置物料包创建

> 目标：将原 core/builtins.ts 和 renderer 中的内置渲染函数拆分到 8 个独立物料包。

### 4.1 物料包脚手架

为每个物料包创建以下结构：

```
packages/materials/<name>/
├── src/
│   ├── index.ts              # 导出 definition + propSchemas
│   ├── definition.ts         # MaterialTypeDefinition
│   ├── props.ts              # PropSchema[]
│   ├── render.ts             # MaterialRenderFunction
│   └── interaction.ts        # InteractionStrategy（Phase 6 实现）
├── __tests__/
│   ├── definition.test.ts
│   ├── render.test.ts
│   └── interaction.test.ts
├── package.json              # exports 三层子路径
├── tsconfig.json
└── tsdown.config.ts
```

- [ ] `@easyink/material-text` 包初始化
- [ ] `@easyink/material-rich-text` 包初始化
- [ ] `@easyink/material-image` 包初始化
- [ ] `@easyink/material-rect` 包初始化
- [ ] `@easyink/material-line` 包初始化
- [ ] `@easyink/material-barcode` 包初始化
- [ ] `@easyink/material-data-table` 包初始化
- [ ] `@easyink/material-table` 包初始化

### 4.2 物料 definition + props 迁移

从原 `builtins.ts` 拆分到各包的 `definition.ts` + `props.ts`：

- [ ] `material-text`：TextProps + propSchemas + definition
- [ ] `material-rich-text`：RichTextProps + propSchemas + definition
- [ ] `material-image`：ImageProps + propSchemas + definition
- [ ] `material-rect`：RectProps + propSchemas + definition
- [ ] `material-line`：LineProps + propSchemas + definition
- [ ] `material-barcode`：BarcodeProps + propSchemas + definition
- [ ] `material-data-table`：DataTableProps + DataTableColumn + propSchemas + definition
- [ ] `material-table`：StaticTableProps + StaticTableColumn + StaticTableCell + propSchemas + definition

### 4.3 物料 render 迁移

从原 renderer 包中的渲染函数拆分到各包的 `render.ts`：

- [ ] `material-text/render`：文本 DOM 渲染函数
- [ ] `material-rich-text/render`：富文本 DOM 渲染函数
- [ ] `material-image/render`：图片 DOM 渲染函数
- [ ] `material-rect/render`：矩形 DOM 渲染函数
- [ ] `material-line/render`：线条 DOM 渲染函数
- [ ] `material-barcode/render`：条形码 DOM 渲染函数
- [ ] `material-data-table/render`：数据表格 DOM 渲染函数
- [ ] `material-table/render`：静态表格 DOM 渲染函数

### 4.4 物料包 package.json 配置

每个物料包的 package.json 需配置三层子路径导出：

```jsonc
{
  "name": "@easyink/material-<name>",
  "exports": {
    ".": { "import": "./dist/index.mjs", "types": "./dist/index.d.mts" },
    "./render": { "import": "./dist/render.mjs", "types": "./dist/render.d.mts" },
    "./designer": { "import": "./dist/interaction.mjs", "types": "./dist/interaction.d.mts" }
  },
  "dependencies": {
    "@easyink/core": "workspace:*",
    "@easyink/shared": "workspace:*"
  },
  "peerDependencies": {
    "@easyink/renderer": "workspace:*",
    "@easyink/designer": "workspace:*"
  },
  "peerDependenciesMeta": {
    "@easyink/renderer": { "optional": true },
    "@easyink/designer": { "optional": true }
  }
}
```

- [ ] 配置所有 8 个物料包的 package.json
- [ ] 配置所有 8 个物料包的 tsconfig.json（extends 根 tsconfig）
- [ ] 配置所有 8 个物料包的 tsdown.config.ts（多入口构建）

### 4.5 物料包测试

- [ ] 各物料 definition 单元测试（类型注册、默认值、propSchemas 完整性）
- [ ] 各物料 render 单元测试（DOM 输出正确性）
- [ ] 运行 `pnpm --filter '@easyink/material-*' test` 确保全部通过

---

## Phase 5: @easyink/ui 表单编辑器组件

> 目标：实现 PropSchema 驱动的动态表单所需的基础编辑器组件。

### 5.1 基础组件

- [ ] `EiInput`：文本输入框（支持 maxLength、pattern 校验提示）
- [ ] `EiNumberInput`：数值输入框（支持 min/max/step、上下箭头调节）
- [ ] `EiSelect`：下拉选择（支持 enum 选项，label+value 格式）
- [ ] `EiSwitch`：开关切换
- [ ] `EiColorPicker`：颜色选择器
- [ ] `EiSlider`：滑块控件
- [ ] `EiFontSelector`：字体选择器（集成 FontManager 已注册字体）

### 5.2 统一样式规范

- [ ] 定义 CSS 变量主题（`--ei-*` 前缀）
- [ ] 尺寸规范：紧凑模式（适配属性面板狭窄空间）
- [ ] 色彩规范：与设计器整体主题一致
- [ ] 交互规范：焦点状态、禁用状态、校验错误态
- [ ] 所有组件使用 Scoped CSS

### 5.3 复合编辑器

- [ ] `EiPropForm`：PropSchema 动态表单渲染器（核心组件）
  - 根据 `PropSchema[]` 自动渲染表单
  - 按 `group` 分组、折叠
  - 处理 `visible` / `disabled` 条件
  - 处理 `onChange` 联动
  - 支持 `object` 嵌套和 `array` 列表编辑
- [ ] `EiArrayEditor`：通用列表编辑器（增删排序，每项按 items schema 渲染）

### 5.4 测试

- [ ] 各编辑器组件单元测试
- [ ] PropForm 联动、条件显隐测试
- [ ] 运行 ui 包测试

---

## Phase 6: Designer 层重构

> 目标：引入物料面板、交互策略注册中心、数据源绑定图层。Designer 包仅提供基础设施，不包含内置物料的交互策略。

### 6.1 交互策略基础设施

- [ ] 创建 `packages/designer/src/interaction/strategy.ts`
  - 定义 `InteractionStrategy` 接口
  - 定义 `InteractionContext` 接口
  - 定义 `CanvasEvent` 类型
- [ ] 创建 `packages/designer/src/interaction/strategy-registry.ts`
  - 实现 `InteractionStrategyRegistry`
  - 实现默认 Strategy（仅通用 移动/缩放，无专属交互）
- [ ] 创建 `packages/designer/src/interaction/strategy-manager.ts`
  - 管理当前激活的 Strategy
  - 处理两级状态机（selected / editing）
  - 事件分发给活动 Strategy

### 6.2 物料面板（MaterialBar）

- [ ] 创建 `packages/designer/src/components/MaterialBar.ts`
  - 从 `MaterialRegistry` 读取已注册物料列表
  - 按 category 分组显示物料卡片
  - 每卡片渲染 Iconify 图标 + 物料名称
  - 实现 HTML5 DnD draggable（dragstart 设置物料类型）
  - 自定义 ghost 预览（半透明卡片）
  - 保留点击添加功能

### 6.3 画布拖拽接收

- [ ] `packages/designer/src/components/DesignCanvas.ts` 增加 drop 处理
  - 监听 dragover / drop 事件
  - 解析拖拽数据（物料类型）
  - 智能定位：
    - absolute 物料：鼠标释放点 + 吸附
    - flow 物料：追加到流式末尾
  - 视觉反馈（虚线定位框 / 插入指示线）
  - 通过 Command 创建物料节点

### 6.4 数据源绑定图层（DataBindingLayer）

- [ ] 创建 `packages/designer/src/components/DataBindingLayer.ts`
  - 遍历已绑定的物料，在其上方渲染绑定标签
  - 绑定标签：灰色背景 + `{{binding.path}}` 文本 + 删除按钮
  - 处理 DnD drop 事件（接收 DataSourcePanel 拖来的字段）
  - 删除绑定：移除 binding，恢复静态 content（通过 Command）
  - 替换绑定：仅更新 binding.path（通过 Command）
  - 遮挡逻辑：绑定模式下阻止双击进入 editing 级

### 6.5 物料交互图层（MaterialInteractionLayer）

- [ ] 创建 `packages/designer/src/components/MaterialInteractionLayer.ts`
  - 在通用 SelectionOverlay 之上渲染
  - 从 `InteractionStrategyRegistry` 查找当前物料的 Strategy
  - 调用当前激活 Strategy 的 `renderOverlay(state)` 获取 VNode
  - 事件拦截：优先处理，未消费的事件冒泡到通用 Overlay
  - 与 SelectionOverlay 共存（通用 Overlay 仍可见）

### 6.6 属性面板重构

- [ ] `packages/designer/src/components/PropertyPanel.ts`：
  - 使用 `@easyink/ui` 的 `EiPropForm` 渲染
  - 从 `MaterialRegistry` 获取当前选中物料的 `propSchemas`
  - 传入 `propSchemas` + `props`
  - 监听 PropForm 值变更，通过 Command 更新物料 props
  - 通用属性区域（位置/尺寸/样式）保持手动布局
  - 物料特有属性区域由 PropSchema 自动生成

### 6.7 工具栏更新

- [ ] `packages/designer/src/components/ToolbarPanel.ts`：
  - 移除物料添加按钮（已迁移到 MaterialBar）
  - 保留操作按钮（撤销/重做/删除/对齐等）
  - 更新国际化 key

### 6.8 组件结构更新

- [ ] `packages/designer/src/components/EasyInkDesigner.ts`：
  - 增加 MaterialBar 组件渲染
  - 增加 DataBindingLayer 组件渲染
  - 增加 MaterialInteractionLayer 组件渲染
  - 调整布局：MaterialBar + ToolbarPanel 并列在顶部
- [ ] `packages/designer/src/types.ts`：
  - 更新 DESIGNER_INJECTION_KEY 中的类型
  - `elementTypes` → `materialTypes`
  - `addElement()` → `addMaterial()`
- [ ] `packages/designer/src/composables/`：
  - 全部 Element 引用 → Material
  - `useDesigner` 返回值更新
  - `useSelection` 更新

### 6.9 Designer 测试

- [ ] 更新现有测试中的类型引用
- [ ] 新增交互策略注册中心测试
- [ ] 新增物料面板 DnD 测试
- [ ] 新增数据源绑定图层测试
- [ ] 运行 `pnpm --filter @easyink/designer test` 确保通过

---

## Phase 7: 物料包交互策略实现

> 目标：在各物料包的 `interaction.ts`（`/designer` 子路径导出）中实现 InteractionStrategy。
> 依赖：Phase 6 提供的 InteractionStrategy 接口和 InteractionStrategyRegistry。

### 7.1 文本交互策略（material-text）

- [ ] `packages/materials/text/src/interaction.ts`
- [ ] selected 级：无额外浮层（仅通用 Overlay）
- [ ] editing 级（双击）：
  - 创建 contenteditable 内联编辑器
  - 定位到物料区域
  - Blur / Escape 退出编辑，提交 content 变更（Command）
  - 绑定模式下阻止进入 editing 级

### 7.2 数据表格交互策略（material-data-table）

- [ ] `packages/materials/data-table/src/interaction.ts`
- [ ] selected 级：
  - 在表格 DOM 的列边界线上渲染列宽拖拽手柄
  - 拖拽手柄逻辑：mousedown → mousemove → mouseup 计算新列宽（百分比联动）
  - 通过 Command 更新列宽
- [ ] editing 级（双击）：
  - 识别双击的区域（表头行 / 交互行）
  - 表头行单元格：进入标题编辑（contenteditable）
  - 交互行单元格：选中该列，属性面板聚焦列配置
- [ ] drop 处理（字段拖入交互行）：
  - 识别拖入的列位置
  - 设置 column.binding.path（Command）
  - 同源约束校验

### 7.3 静态表格交互策略（material-table）

- [ ] `packages/materials/table/src/interaction.ts`
- [ ] selected 级：列宽拖拽手柄（同 data-table）
- [ ] editing 级（双击）：
  - 识别双击的单元格（表头 / 数据区）
  - showHeader=true 时表头可编辑
  - showHeader=false 时表头不响应
  - 单元格进入 contenteditable 编辑
  - Blur / Enter 提交（Command）
- [ ] 右键菜单注册：插入行/删除行/插入列/删除列

### 7.4 简单物料交互策略

- [ ] `material-image/src/interaction.ts`：使用默认 Strategy（仅通用 Overlay）
- [ ] `material-rect/src/interaction.ts`：使用默认 Strategy
- [ ] `material-line/src/interaction.ts`：使用默认 Strategy
- [ ] `material-barcode/src/interaction.ts`：使用默认 Strategy
- [ ] `material-rich-text/src/interaction.ts`：双击进入富文本编辑

### 7.5 交互策略测试

- [ ] 各物料包 interaction 单元测试
- [ ] 运行 `pnpm --filter '@easyink/material-*' test` 确保通过

---

## Phase 8: Playground 适配

- [ ] `playground/src/templates.ts`：`elements` → `materials`
- [ ] `playground/src/data.ts`：验证数据填充仍正常
- [ ] `playground/src/App.vue`：
  - 导入所需物料包
  - 注册物料到 MaterialRegistry / MaterialRendererRegistry / InteractionStrategyRegistry
  - 更新 API 调用
- [ ] 视觉验证：设计器能正常加载、物料面板可拖拽、表格交互正常

---

## Phase 9: 数据源拖拽绑定完善

- [ ] DataSourcePanel 拖拽源实现（HTML5 DnD dragstart）
- [ ] 设置 transfer data（字段 key / fullPath 信息）
- [ ] 各物料 Strategy 的 drop 处理集成验证
- [ ] 数据表格列绑定 + 同源校验 E2E 测试
- [ ] 文本物料绑定 + 删除恢复 E2E 测试

---

## Phase 10: 全量集成测试与 Lint

- [ ] 运行全量单元测试 `pnpm test`
- [ ] 运行全量 Lint `pnpm lint`
- [ ] 修复所有 lint 警告/错误
- [ ] TypeScript strict mode 类型检查通过
- [ ] Playground 完整流程手动验证
- [ ] 验证所有物料包 exports 子路径可正确解析

---

## 阶段依赖关系

```
Phase 0 ─── Phase 1 ─── Phase 2 ─── Phase 3
                │
                └── Phase 4（物料包创建，依赖 Phase 1 类型 + Phase 3 渲染器注册表）
                        │
                Phase 5（@easyink/ui，依赖 Phase 1 PropSchema 类型）
                        │
                Phase 6（Designer 重构，依赖 Phase 4 + 5）
                        │
                Phase 7（物料包交互策略，依赖 Phase 6 接口）
                        │
                Phase 8 ─── Phase 9 ─── Phase 10
```

- Phase 0 可与 Phase 1 部分并行（包初始化与代码重命名无强依赖）
- Phase 2、3 必须在 Phase 1 完成后
- Phase 4 依赖 Phase 1（MaterialTypeDefinition 类型）+ Phase 3（MaterialRendererRegistry）
- Phase 5 依赖 Phase 1（PropSchema 类型定义）
- Phase 6 依赖 Phase 4（物料包已创建）+ Phase 5（UI 组件）
- Phase 7 依赖 Phase 6（InteractionStrategy 接口和注册中心）
- Phase 8-10 为收尾阶段

## 风险项

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 全栈重命名范围大 | 遗漏引用导致编译失败 | TypeScript strict mode + CI 全量检查 |
| 8 个物料包维护成本 | 发布/版本管理复杂度升高 | turbo 统一构建 + changesets 协调版本 + 包脚手架模板统一 |
| 物料包三层子路径导出 | tsdown 多入口配置、类型声明路径映射复杂 | 统一 tsdown.config.ts 模板，CI 验证 exports 可解析 |
| HTML5 DnD 跨浏览器一致性 | Safari/Firefox 拖拽行为差异 | 统一 dragstart/dragover/drop 处理，充分测试 |
| PropSchema 表达力不足 | 复杂物料属性无法用声明式描述 | 保留 custom editor 逃生舱 |
| 双图层事件冲突 | 点击穿透或事件丢失 | 明确事件拦截规则，Strategy.handleEvent 返回值控制冒泡 |
| 物料包循环依赖 | 构建失败 | 严格单向依赖：material-* → core/shared（definition），material-*/render → renderer（peer），material-*/designer → designer（peer） |
| 静态表格 showHeader 隐藏后 UX | 用户不知道如何恢复表头 | 属性面板 showHeader 开关始终可见 |
