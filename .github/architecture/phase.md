# 物料体系落地执行计划

## Phase 1：core 层改造

**目标**：清空内置元素定义，建立物料注册基础设施。

### 任务列表

1. **清空 `builtins.ts`**
   - 文件：`packages/core/src/elements/builtins.ts`
   - 移除所有内置元素定义（textElementType / imageElementType / rectElementType / lineElementType / dataTableElementType / tableElementType 等）
   - 文件保留为空导出（`export {}`），或直接删除并从 `index.ts` 移除引用

2. **扩展 `PropDefinition` 类型**
   - 文件：`packages/core/src/elements/types.ts`
   - `editor` 字段新增 `'custom'` 值（union 补充）
   - 新增 `DesignerBehaviorPrimitive` 类型（严格封闭 union）
   - 新增 `DesignerBehavior` 接口
   - 新增 `MaterialHeadless` 接口（含 definition + renderer 字段）
   - 新增 `MaterialDesignerExport` 接口（含 designerComponent + behavior + editors + overlay 字段）
   - 新增 `MaterialDefinition` 接口（MaterialHeadless + MaterialDesignerExport 合并）
   - 新增 `CoreMaterialAction` 类型（enter-edit / exit-edit / update-prop / sub-select / commit-change）
   - 新增 `MaterialContext` 接口（物料上下文注入类型）
   - 新增 `PropertyPanelController` 接口
   - 新增 `OverlayContext` 接口

3. **`ElementRegistry` 扩展或新增 `MaterialRegistry`**
   - 文件：`packages/core/src/elements/registry.ts`
   - 扩展现有 `ElementRegistry` 支持存储完整 `MaterialDefinition`（含渲染函数、设计器组件、overlay 等）
   - 或新建 `MaterialRegistry` 类，内部持有 `ElementRegistry` 引用

4. **`EasyInkEngine` 新增 `useMaterial()` / `useMaterials()` 方法**
   - 文件：`packages/core/src/engine/facade.ts`
   - 方法签名：`useMaterial(material: MaterialDefinition): void`
   - 方法签名：`useMaterials(materials: MaterialDefinition[]): void`
   - 内部将 `definition` 注入 `ElementRegistry`，其余字段注入对应层

5. **更新 `core/src/elements/index.ts` 导出**
   - 新增导出：`DesignerBehavior`、`DesignerBehaviorPrimitive`、`MaterialHeadless`、`MaterialDesignerExport`、`MaterialDefinition`、`CoreMaterialAction`、`MaterialContext`、`PropertyPanelController`、`OverlayContext`
   - 移除 builtins 相关导出

---

## Phase 2：第一个物料包（text）+ 物料共享包

**目标**：建立物料包参考实现 + 共享基础设施，打通注册 -> 画布渲染 -> 交互完整链路。

### 2.1 物料共享包

```
packages/materials/shared/           # @easyink/material-shared
├── package.json
└── src/
    ├── components/
    │   └── ColumnResizeOverlay.vue   # 共用列宽拖拽 overlay
    ├── types/
    │   └── border.ts                 # TableBorderConfig 等共享类型
    ├── utils/
    │   ├── column-width.ts           # 列宽百分比计算、联动调整
    │   └── border-merge.ts           # border 覆盖合并逻辑（列级 > 行级 > 全局）
    └── index.ts
```

### 2.2 text 物料包

```
packages/materials/text/
├── package.json          # exports: ./headless, ./designer
├── tsdown.config.ts
└── src/
    ├── headless/
    │   ├── definition.ts     # ElementTypeDefinition
    │   ├── render.ts         # textRenderer: ElementRenderFunction
    │   ├── types.ts          # TextProps
    │   └── index.ts          # 导出 textDefinition, textRenderer, TextProps
    ├── designer/
    │   ├── TextDesigner.vue  # 设计器画布组件（占位符显示 + inline-edit 状态）
    │   ├── behavior.ts       # textBehavior: DesignerBehavior
    │   └── index.ts          # 导出 TextDesigner, textBehavior
    └── index.ts              # 全量便捷导出（可选）
```

### 任务列表

1. **创建 material-shared 包**，配置 `package.json`，实现 TableBorderConfig 类型、列宽计算工具、border 合并工具

2. **创建 text 物料包目录结构**，配置 `package.json`（subpath exports: ./headless ./designer）

3. **实现 text `/headless`**
   - 将 `textElementType` 定义从 core builtins 迁移过来
   - 实现 `textRenderer(node, ctx): HTMLElement` -- 数据填充后的最终 DOM 渲染
   - 处理 `content`、字体样式、垂直对齐、overflow 等
   - 导出 `textDefinition` + `textRenderer` + `TextProps` 类型

4. **实现 text `/designer`**
   - `TextDesigner.vue` -- 设计器画布内预览组件
     - 未绑定：显示 `props.content` 静态值
     - 已绑定：显示 `{{binding.path}}` 灰色虚线占位
     - 双击后：emit `material:action { type: 'enter-edit' }` 切换到 contenteditable 内联编辑状态
   - `textBehavior` -- `{ doubleClick: 'inline-edit', dataSourceDrop: 'bind-default-prop' }`

5. **配置构建**（`tsdown.config.ts`）-- 两个独立入口产物

6. **将 material-text 添加到 renderer 和 designer 的 dependencies**

7. **实现 renderer 自动注册** -- import `@easyink/material-text/headless` 并自动调用 `useMaterial()`

8. **实现 designer 自动注册** -- import headless + designer 层，自动注册完整物料

9. **Playground 验证** -- 消费者零配置使用设计器，确认画布渲染、双击编辑、数据源拖入绑定全部可用

---

## Phase 3：迁移其余物料

**目标**：将 core builtins 中的其余元素逐个迁移为独立物料包，并加入 renderer/designer 的自动注册。

### 3.1 简单物料（使用行为原语）

| 顺序 | 物料包 | 行为原语 | 预计复杂度 |
|------|--------|----------|-----------|
| 1 | `@easyink/material-rect` | 无 | 低 |
| 2 | `@easyink/material-line` | 无 | 低 |
| 3 | `@easyink/material-image` | dataSourceDrop -> bind-default-prop | 低 |
| 4 | `@easyink/material-barcode` | dataSourceDrop -> bind-default-prop | 中 |

### 3.2 复杂物料（designerComponent + overlay 自实现交互）

| 顺序 | 物料包 | 自实现交互 | 预计复杂度 |
|------|--------|-----------|-----------|
| 5 | `@easyink/material-rich-text` | inline-editing（Quill 接管焦点）、enter-edit/exit-edit 事件 | 中高 |
| 6 | `@easyink/material-table` | 自定义 TableOverlay（列宽 handle）、单元格/行/列 sub-select、双击 cell-edit、右键行列增删、border 配置编辑器 | 高 |
| 7 | `@easyink/material-data-table` | 共用 ColumnResizeOverlay、表头双击编辑列名、数据行仅选中不编辑、dataSourceDrop -> bind-column、列属性 custom editor | 高 |

#### Table 物料实现要点

- **designerComponent** (`TableDesigner.vue`)：
  - 内部管理子状态（cell-selected / cell-editing / column-selected / row-selected / column-resizing）
  - 区域化点击：表头单击=选中列、行侧单击=选中行、单元格单击=选中单元格
  - 双击进入 contenteditable 编辑，emit `enter-edit`
  - Shift+点击多选行/列/单元格
  - 通过 `useMaterialContext()` 获取上下文，调用 `panelController.setSubSelection()` 联动属性面板

- **自定义 overlay** (`TableOverlay.vue`)：
  - 列宽拖拽 handle（复用 `@easyink/material-shared` 的 ColumnResizeOverlay）
  - 单元格/行/列高亮指示器
  - 通过 `useOverlayContext()` 获取 element/scale/bounds
  - 选中时创建，取消选中时销毁

- **自定义编辑器**：
  - border 配置编辑器：选中行/列/全局后展示 TableBorderConfig 编辑 UI
  - 列管理编辑器：增删列、调整列顺序

- **Undo**：鼠标拖拽列宽过程仅视觉更新，mouseup 时 `commandManager.execute(new UpdateColumnWidthCommand(...))`

每个物料完成后：
1. 同步删除 core builtins 中对应定义
2. 将物料包添加到 `@easyink/renderer` 和 `@easyink/designer` 的 dependencies
3. 在 renderer/designer 的自动注册代码中追加新物料的 import

---

## Phase 4：designer 层改造

**目标**：实现交互状态机、行为解释器、事件合同处理、overlay 分层、属性面板联动和键盘路由。

### 任务列表

1. **交互状态机**
   - 文件：`packages/designer/src/interaction/state-machine.ts`
   - 实现框架级三层状态管理：idle / selected / editing
   - editing 状态下自动禁用拖动/缩放/旋转/全局快捷键
   - ESC 一键退出到 unselected
   - 点击外部触发 exit-edit 通知物料

2. **事件合同处理**
   - 文件：`packages/designer/src/interaction/action-handler.ts`
   - 监听 designerComponent 的 `material:action` 事件
   - 分发核心 action（enter-edit / exit-edit / update-prop / sub-select / commit-change）
   - 忽略未知 action（通过 PluginManager 广播给插件）

3. **物料上下文注入**
   - 文件：`packages/designer/src/composables/useMaterialContext.ts`
   - 实现 `useMaterialContext()` composable（provide/inject）
   - 注入 element / isSelected / isEditing / scale / emitAction / panelController / commandManager / schemaEngine
   - 实现 `useOverlayContext()` composable（扩展 MaterialContext + bounds）

4. **Overlay 分层架构**
   - 文件：`packages/designer/src/components/OverlayManager.ts`
   - 三层渲染：designerComponent -> 物料 overlay -> 框架 SelectionOverlay
   - 物料 overlay 在元素边界内渲染，选中时创建、取消选中时销毁
   - 框架 SelectionOverlay 的非 handle 区域 pointer-events: none
   - 多选时隐藏所有物料 overlay

5. **行为解释器**（简单物料专用）
   - 文件：`packages/designer/src/behavior/interpreter.ts`
   - 实现 `BehaviorInterpreter` -- 根据 `DesignerBehaviorPrimitive` 分发到内置 Handler
   - 内置 Handler：InlineEditHandler / CellEditHandler / BindDefaultPropHandler / BindColumnHandler / ColumnResizeHandler / TableRowColOpsHandler

6. **画布改造**
   - 文件：`packages/designer/src/components/DesignCanvas.ts`
   - 元素渲染改为查找注册的 `designerComponent` 动态渲染
   - 传递 Props：element / isSelected / isEditing / scale
   - 双击/右键/拖入等事件先查行为原语，无原语时交由 designerComponent 自行处理

7. **属性面板改造**
   - 文件：`packages/designer/src/panels/PropertyPanel`
   - 实现 `PropertyPanelController` 并 provide 给物料组件
   - 支持 setActiveGroup / setSubSelection / clearSubSelection / scrollToGroup / collapseAll / expandAll / registerDynamicGroup
   - 支持渲染 `editor: 'custom'` 类型的 propDefinition
   - 自定义编辑器组件接收标准 Props（modelValue / element / definition）

8. **键盘事件路由**
   - 文件：`packages/designer/src/interaction/keyboard-router.ts`
   - 全局键盘监听，根据状态机当前状态路由：
     - idle / selected：框架处理（Delete 删除、方向键移动、Ctrl+C/V 等）
     - editing：Delete/Tab/Enter/方向键转发给物料 designerComponent，ESC/Ctrl+Z 仍由框架处理

9. **自动注册机制完善**
   - 在 designer 初始化入口统一导入所有内置物料的 headless + designer 层
   - 批量调用 `engine.useMaterial()` 并将 designer 层信息（designerComponent / behavior / editors / overlay）存入设计器专用注册表
   - 确保消费者零配置即可使用所有内置元素类型
