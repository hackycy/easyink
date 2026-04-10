# 23. 表格物料体系 v2 重设计

> 本文档记录 table-static 和 table-data 的 breaking change 重设计。所有变更回溯到第一性原理：table-static 是纯自由表格，table-data 是数据驱动表格，两者的编辑模型和约束体系从本质需求出发重新划分。

## 23.1 变更动机

原设计中 table-static 和 table-data 共享过多概念（role、toolbar、合并规则），导致两类表格的边界模糊。实际上：

- **table-static**：每个单元格完全独立，无表头/表尾概念，支持任意方向合并，支持手动编辑或独立绑定数据源
- **table-data**：分表头/数据区/表尾三区，数据区是模板驱动的动态内容，头尾单行且仅允许列方向合并，数据区禁止合并

## 23.2 Breaking Changes 清单

| # | 变更项 | 影响范围 |
|---|--------|----------|
| 1 | table-static 移除 role 概念，所有行强制 `normal` | schema, codec, commands |
| 2 | table-data 头尾强制单行（schema + 命令双层） | schema, commands, deep-editing |
| 3 | 新增 `showHeader` / `showFooter` 可见性标志 | schema, viewer, layout-engine |
| 4 | 新增 `CellTypography` 类型，替代扁平 fontSize/color | schema, props, render |
| 5 | 表级 fontSize/color 重构为 `TableTypography` | schema, props, render |
| 6 | table-static 新增 `staticBinding` 单元格字段 | schema, datasource, commands |
| 7 | table-static `bindable` 改为 `true` | capabilities, designer |
| 8 | 数据区占位行改为纯渲染层虚拟行 | designer extension |
| 9 | 合并操作增加双层防护（UI + 命令校验） | commands, deep-editing |
| 10 | table-static 和 table-data 独立工具栏 | deep-editing |
| 11 | 破坏性 codec 迁移 | codec, migration |

## 23.3 Schema 变更

### 23.3.1 CellTypography（新增）

```typescript
/** 单元格排版属性，所有字段可选，缺失时回退到表级默认值 */
interface CellTypography {
  fontSize?: number
  color?: string
  fontWeight?: 'normal' | 'bold'
  fontStyle?: 'normal' | 'italic'
  lineHeight?: number
  letterSpacing?: number
  textAlign?: 'left' | 'center' | 'right'
  verticalAlign?: 'top' | 'middle' | 'bottom'
}
```

### 23.3.2 TableTypography（新增，替代表级扁平字段）

```typescript
/** 表级排版默认值，与 CellTypography 结构对称 */
interface TableTypography {
  fontSize: number      // default: 9
  color: string         // default: '#000000'
  fontWeight: 'normal' | 'bold'    // default: 'normal'
  fontStyle: 'normal' | 'italic'   // default: 'normal'
  lineHeight: number    // default: 1.2
  letterSpacing: number // default: 0
  textAlign: 'left' | 'center' | 'right'  // default: 'left'
  verticalAlign: 'top' | 'middle' | 'bottom' // default: 'top'
}
```

### 23.3.3 TableBaseProps 变更

```typescript
// 旧
interface TableBaseProps {
  borderWidth: number
  borderColor: string
  borderType: 'solid' | 'dashed' | 'dotted'
  cellPadding: number
  fontSize: number        // 移除
  color: string           // 移除
  equalizeCells: boolean
}

// 新
interface TableBaseProps {
  borderWidth: number
  borderColor: string
  borderType: 'solid' | 'dashed' | 'dotted'
  cellPadding: number
  typography: TableTypography   // 新增，替代 fontSize/color
  equalizeCells: boolean
}
```

### 23.3.4 TableCellSchema 变更

```typescript
interface TableCellSchema {
  rowSpan?: number
  colSpan?: number
  border?: CellBorderSchema
  padding?: BoxSpacing
  content?: TableCellContentSlot
  typography?: CellTypography           // 新增，替代 props.textAlign 等
  props?: Record<string, unknown>       // 保留用于扩展
  // table-data 专用：
  binding?: BindingRef                  // 仅 table-data 使用
  // table-static 专用：
  staticBinding?: BindingRef            // 新增，独立绑定（每 cell 可绑不同 sourceId）
}
```

### 23.3.5 TableRowSchema 变更

```typescript
interface TableRowSchema {
  height: number
  /** table-static: 仅允许 'normal'
   *  table-data: 允许全部四种 role，但 header 和 footer 各强制单行 */
  role: 'normal' | 'header' | 'footer' | 'repeat-template'
  cells: TableCellSchema[]
}
```

### 23.3.6 TableDataSchema 变更

```typescript
interface TableDataSchema extends TableSchema {
  kind: 'data'
  source: BindingRef
  /** 表头可见性，false 时 viewer 不渲染 header 行、分页不重复。默认 true */
  showHeader?: boolean
  /** 表尾可见性，false 时 viewer 不渲染 footer 行。默认 true */
  showFooter?: boolean
}
```

### 23.3.7 排版属性继承链

```
TableBaseProps.typography (表级默认)
  ↓ 被覆盖
TableCellSchema.typography (单元格级别，字段缺失时回退表级)
```

渲染时解析公式：

```typescript
function resolveCellTypography(
  cell: TableCellSchema,
  tableTypography: TableTypography
): Required<CellTypography> {
  return {
    fontSize: cell.typography?.fontSize ?? tableTypography.fontSize,
    color: cell.typography?.color ?? tableTypography.color,
    fontWeight: cell.typography?.fontWeight ?? tableTypography.fontWeight,
    fontStyle: cell.typography?.fontStyle ?? tableTypography.fontStyle,
    lineHeight: cell.typography?.lineHeight ?? tableTypography.lineHeight,
    letterSpacing: cell.typography?.letterSpacing ?? tableTypography.letterSpacing,
    textAlign: cell.typography?.textAlign ?? tableTypography.textAlign,
    verticalAlign: cell.typography?.verticalAlign ?? tableTypography.verticalAlign,
  }
}
```

## 23.4 table-static 重设计

### 23.4.1 核心特征

- 无 role 概念，所有行 `role: 'normal'`
- 每个单元格完全独立：边框、内边距、排版、内容均可单独设置
- 支持任意方向合并（上下左右）
- 支持手动编辑文本（深度编辑 content-editing 阶段）
- 支持独立数据源绑定（`cell.staticBinding`），每个 cell 可绑定不同 source 的字段
- 手动编辑与数据源绑定互斥：绑定后文本由数据源填充，清除绑定后恢复手动编辑

### 23.4.2 Capabilities 变更

```typescript
// 旧
{ rotatable: false, resizable: true, bindable: false, multiBinding: false }

// 新
{ rotatable: false, resizable: true, bindable: true, multiBinding: true }
```

### 23.4.3 staticBinding 绑定模型

- 类型复用 `BindingRef`（sourceId + fieldPath + fieldLabel 等）
- 无表级 source 约束，每个 cell 的 `staticBinding.sourceId` 可以不同
- Viewer 解析时逐 cell 独立解析 `staticBinding`，不做集合展开
- Designer 中拖拽字段到 table-static cell 时，直接写入 `cell.staticBinding`

### 23.4.4 深度编辑工具栏

table-static 使用独立的工具栏配置：

- 插入行（上/下）
- 删除行
- 插入列（左/右）
- 删除列
- 合并右 / 合并下 / 拆分（任意方向均可用）
- 对齐（左/中/右/上/中/下）

不包含：头尾可见性切换、行角色切换。

## 23.5 table-data 重设计

### 23.5.1 三区模型

```
┌─────────────────────────────────┐
│  Header 区 (0 或 1 行)          │  showHeader=false 时隐藏
│  - 可手动编辑或拖拽数据源        │  
│  - 仅允许左右列方向合并          │
├─────────────────────────────────┤
│  数据区 (1 行 repeat-template)  │  设计态展示为 3 行：
│  [编辑行]  可设置单元格属性       │  1 行编辑区 + 2 行灰色占位
│  [占位行]  灰色，完全惰性        │  占位行纯渲染层，不存在于 schema
│  [占位行]  灰色，完全惰性        │
├─────────────────────────────────┤
│  Footer 区 (0 或 1 行)          │  showFooter=false 时隐藏
│  - 可手动编辑或拖拽数据源        │
│  - 仅允许左右列方向合并          │
└─────────────────────────────────┘
```

### 23.5.2 单行约束（双层强制）

**Schema 层**：

- `TableDataSchema` 中 header 行最多 1 行，footer 行最多 1 行
- 类型守卫 `isTableDataNode()` 验证时检查此约束

**命令层**：

- `InsertTableRowCommand`：在 header/footer 区域插入行时，若该区域已有 1 行则拒绝执行
- `RemoveTableRowCommand`：删除 header/footer 行时正常执行（区域变为 0 行）
- `UpdateTableRowRoleCommand`：修改 role 后若违反单行约束则拒绝执行

### 23.5.3 可见性语义

`showHeader` / `showFooter` 默认为 `true`。设为 `false` 时：

- **Designer**：header/footer 行仍渲染但以半透明 + 删除线样式提示"已隐藏"
- **Viewer**：header/footer 行完全不渲染，不占用空间
- **分页**：`showHeader=false` 时不在分页切分点注入 header 重复；`showFooter=false` 时不在末页追加 footer
- Schema 中 header/footer 行仍然存在，仅渲染行为变化

### 23.5.4 数据区编辑规则

- 编辑行（repeat-template）的单元格：
  - 可设置边框、内边距、排版属性
  - 不允许合并操作
  - 不允许深度编辑手动输入文本，仅接受数据源绑定
  - 设置的行高应用于所有展开的数据行（存储在 row.height）
  - 排版设置代表整列的单元格设置
- 占位行（2 行）：
  - 纯渲染层虚拟行，不存在于 schema
  - Designer 渲染时在 repeat-template 行下方绘制 2 行灰色置灰区域
  - 完全惰性：不可交互、点击无效果
  - 每个占位 cell 的内容、边框、尺寸均克隆自 repeat-template 行对应列的 cell

### 23.5.5 Header/Footer 编辑规则

- 可通过深度编辑手动输入文本
- 可拖拽数据源绑定（使用现有 `cell.binding`，绝对路径语义）
- 仅允许与相邻列合并（左右方向），不允许与数据区合并
- 可独立设置边框、内边距、排版属性

### 23.5.6 深度编辑工具栏

table-data 使用独立的工具栏配置，根据当前选中 cell 所在区域动态调整：

**Header/Footer 区域选中时**：
- 插入列（左/右）
- 删除列
- 合并右 / 拆分（仅列方向）
- 对齐（左/中/右/上/中/下）
- 头/尾可见性切换

**数据区选中时**：
- 插入列（左/右）
- 删除列
- 对齐（左/中/右/上/中/下）
- 无合并/拆分按钮
- 无手动编辑入口

**不包含**：插入/删除行（数据区行数固定为 1 行 repeat-template），行角色切换。

## 23.6 合并操作双层防护

### 23.6.1 UI 层（deep-editing toolbar）

根据表类型和当前 cell 上下文，动态显示/隐藏合并按钮：

| 上下文 | 合并右 | 合并下 | 拆分 |
|--------|--------|--------|------|
| table-static 任意 cell | 可见 | 可见 | 有 span 时可见 |
| table-data header cell | 可见 | 隐藏 | colSpan>1 时可见 |
| table-data footer cell | 可见 | 隐藏 | colSpan>1 时可见 |
| table-data 数据区 cell | 隐藏 | 隐藏 | 隐藏 |

### 23.6.2 命令层（MergeTableCellsCommand）

命令 execute 前置校验逻辑：

```typescript
function validateMerge(node: TableNode, anchorRow: number, anchorCol: number, rowSpan: number, colSpan: number): boolean {
  const rows = node.table.topology.rows

  // 1. 跨 role 检查：选区内所有行 role 必须一致
  const roles = new Set<string>()
  for (let r = anchorRow; r < anchorRow + rowSpan; r++) {
    roles.add(rows[r].role)
  }
  if (roles.size > 1) return false

  // 2. table-data 特殊约束
  if (isTableDataNode(node)) {
    const role = rows[anchorRow].role
    // 数据区完全禁止合并
    if (role === 'repeat-template') return false
    // header/footer 仅允许列方向合并
    if ((role === 'header' || role === 'footer') && rowSpan > 1) return false
  }

  return true
}
```

## 23.7 Codec 兼容迁移

### 23.7.1 table-static 迁移

旧数据中 table-static 行可能携带 `header`/`footer` role：

```typescript
// codec 迁移：table-static 行 role 强制转 normal
function migrateTableStaticRows(rows: TableRowSchema[]): TableRowSchema[] {
  return rows.map(row => ({
    ...row,
    role: 'normal',
  }))
}
```

### 23.7.2 table-data 单行约束迁移

旧数据中 table-data 可能有多 header/footer 行：

```typescript
// codec 迁移：table-data header/footer 仅保留第一行，多余行转 normal
function migrateTableDataRows(rows: TableRowSchema[]): TableRowSchema[] {
  let headerSeen = false
  let footerSeen = false
  return rows.map(row => {
    if (row.role === 'header') {
      if (headerSeen) return { ...row, role: 'normal' as const }
      headerSeen = true
    }
    if (row.role === 'footer') {
      if (footerSeen) return { ...row, role: 'normal' as const }
      footerSeen = true
    }
    return row
  })
}
```

### 23.7.3 Typography 迁移

旧数据的表级 `fontSize`/`color` 迁移到 `typography` 对象：

```typescript
function migrateTableTypography(props: Record<string, unknown>): TableBaseProps {
  const { fontSize, color, ...rest } = props as any
  return {
    ...rest,
    typography: {
      fontSize: fontSize ?? 9,
      color: color ?? '#000000',
      fontWeight: 'normal',
      fontStyle: 'normal',
      lineHeight: 1.2,
      letterSpacing: 0,
      textAlign: 'left',
      verticalAlign: 'top',
    },
  }
}
```

旧 cell 的 `props.textAlign` 迁移到 `cell.typography.textAlign`：

```typescript
function migrateCellTypography(cell: Record<string, unknown>): TableCellSchema {
  const textAlign = (cell.props as any)?.textAlign
  if (textAlign) {
    return {
      ...cell,
      typography: { textAlign },
      props: omit(cell.props, 'textAlign'),
    }
  }
  return cell as TableCellSchema
}
```

### 23.7.4 showHeader/showFooter 迁移

旧数据无此字段，默认 `true`（向后兼容，无需特殊处理）。

## 23.8 Viewer 影响

### 23.8.1 table-static staticBinding 解析

Viewer 的 `resolveAllBindings` 阶段新增对 table-static 的处理：

- 检测到 table-static 节点时，遍历所有 cell 的 `staticBinding`
- 逐 cell 独立调用 `resolveBindingValue(staticBinding, data)`（绝对路径，无 scope）
- 结果存入 `ResolvedCellBindings`，key 格式 `${nodeId}:${rowIndex}:${colIndex}`

### 23.8.2 table-data showHeader/showFooter

- `showHeader=false`：Viewer 渲染时跳过 header 行，PagePlanner 分页时不注入 header 重复
- `showFooter=false`：Viewer 渲染时跳过 footer 行，PagePlanner 不在末页追加 footer
- `TableMeasureResult` 中 `headerHeight` / `footerHeight` 在对应标志为 `false` 时返回 `0`

### 23.8.3 设计态占位行渲染

table-data 的 Designer Extension 在 repeat-template 行下方额外渲染 2 行占位区域：

- 占位行高度 = repeat-template 行的 `row.height`
- 占位行单元格边框/宽度克隆自 repeat-template 行对应 cell
- 占位行整体施加灰色半透明叠加层（如 `background: rgba(0,0,0,0.04)`）
- 占位行不参与 hit-test、不可选中、不可编辑
- 占位行的存在使设计态的表格 element.height 在视觉上包含这 2 行额外高度，但 schema 中 element.height 仅反映实际行（不含虚拟行）

## 23.9 受影响的架构文档

| 文档 | 变更内容 |
|------|----------|
| 05-schema-dsl.md | 5.6 节：TableCellSchema 增加 typography/staticBinding，TableDataSchema 增加 showHeader/showFooter，TableBaseProps 重构 typography，table-static role 约束，单行约束 |
| 06-render-pipeline.md | 6.6.1 节：新增 table-static staticBinding 解析流程，showHeader/showFooter 对渲染的影响 |
| 07-layout-engine.md | 7.3 节：showHeader/showFooter 对分页的影响，TableMeasureResult 变化 |
| 08-datasource.md | 新增 8.13 节：table-static 独立绑定模型 |
| 11-element-system.md | 11.3 节：table-static capabilities 变更，独立工具栏，占位行渲染，属性矩阵更新 |
| 12-command-undo-redo.md | 12.5 节：MergeTableCellsCommand 增加双层校验，新增 BindStaticCellCommand/ClearStaticCellBindingCommand，InsertTableRowCommand 单行约束 |
