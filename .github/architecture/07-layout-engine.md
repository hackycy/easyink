# 7. 布局与分页引擎

EasyInk 的新布局引擎不再是“单页坐标推移器”，而是“页面计划 + 容器内部布局 + 表格分页器”的组合系统。

## 7.1 三层布局职责

### 页面计划层

- 决定文档是 `fixed`、`stack` 还是 `label`
- 决定页数、分页断点、空白页策略、复制份数和标签列数

### 区域布局层

- 在单页内部处理页头、正文、页尾、编辑区、多栏区域
- 为容器、表格、图表等结构性物料划定可用区域

### 物料布局层

- 普通元素按绝对坐标放置
- 容器内部管理子元素
- data-table 自己负责行列布局、分页与重复头

## 7.2 页面模式

```typescript
type PageMode = 'fixed' | 'stack' | 'label'
```

### `fixed`

- 典型合同、报表、多页文档
- 页面高度固定
- 支持缩略图与页切换

### `stack`

- 典型连续纸、小票、长文档流式排版
- 允许内容按段连续堆叠
- 可转成多段预览，但不以固定页为中心模型

### `label`

- 标签纸、多栏批量打印
- 需要列数、间距、复制份数

## 7.3 table-data 专项布局

> **v2 更新**：新增 `showHeader`/`showFooter` 可见性标志对分页的影响，详见 [23-table-v2-redesign](./23-table-v2-redesign.md)。

table-data 需要独立的分页器，而不是依赖通用元素推移。

它至少要解决：

- 表头重复（`showHeader=true` 时每页重复，`showHeader=false` 时不重复且不占空间）
- 数据区逐页切分
- 合计区尾页显示（`showFooter=true` 时末页显示，`showFooter=false` 时不显示且不占空间）
- 空行填充
- 单行缩放
- 动态列和列宽分配
- 多栏排版下的表格宽度适配

### 行序列生成（取代 PageSlice）

Viewer 的 PagePlanner 与表格物料的 ViewerExtension 采用协作模式：

1. PagePlanner 在布局阶段检测到 table-data 元素时，调用其 ViewerExtension 的 `measure()` 方法
2. 表格 ViewerExtension 负责展开 repeat-template 行（按绑定集合数据逐项生成），返回展开后的行序列和每行高度
3. PagePlanner 根据页面剩余空间和行高决定切分点，在切分点处注入 header 行重复
4. 最终的 `TablePagePlan` 传回表格 ViewerExtension 用于渲染

```typescript
interface TablePagePlan {
  pages: TablePageRowSequence[]
  diagnostics: LayoutDiagnostic[]
}

interface TablePageRowSequence {
  pageIndex: number
  /** 当前页要渲染的行序列，按渲染顺序排列。
   *  包含：header 行（每页重复）、展开的数据行、footer 行（仅末页）。
   *  每个 entry 携带行来源信息，用于渲染时查找样式和单元格定义。 */
  entries: TablePageRowEntry[]
}

interface TablePageRowEntry {
  /** 来源行在 topology.rows[] 中的索引 */
  sourceRowIndex: number
  /** 行角色（从 row.role 复制，方便渲染层直接判断） */
  role: 'normal' | 'header' | 'footer' | 'repeat-template'
  /** 仅 repeat-template 展开行：当前数据项在集合中的索引 */
  dataIndex?: number
  /** 仅 repeat-template 展开行：当前数据项的值（用于单元格绑定解析） */
  dataItem?: unknown
}

/** 表格 ViewerExtension 返回给 PagePlanner 的度量结果 */
interface TableMeasureResult {
  /** 展开后的全部行序列（未分页），按渲染顺序排列 */
  expandedRows: TablePageRowEntry[]
  /** 每行的高度（文档 unit），与 expandedRows 一一对应 */
  rowHeights: number[]
  /** header 行的总高度，用于 PagePlanner 在每页开头预留空间。
   *  当 showHeader=false 时返回 0，PagePlanner 不注入 header 重复 */
  headerHeight: number
  /** footer 行的总高度，用于 PagePlanner 在末页预留空间。
   *  当 showFooter=false 时返回 0，PagePlanner 不在末页追加 footer */
  footerHeight: number
}

/** measure 接收的上下文（由 ViewerRuntime 在 resolveAllBindings 阶段预备） */
interface TableMeasureContext {
  /** 原始表格节点（TableDataSchema 类型，含 source） */
  node: TableNode
  /** repeat-template 行展开的集合数据（ViewerRuntime 已通过 table.source.fieldPath 取出） */
  collectionData: unknown[]
  /** 预解析的单元格绑定结果 Map，key = `${rowIndex}:${colIndex}[:${dataIndex}]`。
   *  类型定义见 [6.6.1 ResolvedCellBindings](./06-render-pipeline.md) */
  resolvedCellBindings: Map<string, ResolvedCellBindings>
}
```

协作流程：

```
ViewerRuntime                        PagePlanner                     表格 ViewerExtension
    |                                    |                                   |
    |-- resolveAllBindings ------------>  |                                   |
    |   (预解析 cell binding,            |                                   |
    |    取出集合数据)                    |                                   |
    |                                    |                                   |
    |-- 传递 TableMeasureContext -------->|                                   |
    |                                    |-- measure(context) ------------->  |
    |                                    |                                   |-- 计算每行高度
    |                                    |                                   |-- 生成展开行序列
    |                                    |<-- TableMeasureResult ------------|
    |                                    |                                   |
    |                                    |-- 根据页面高度切分行序列          |
    |                                    |-- 在切分点注入 header 行重复      |
    |                                    |   (仅 showHeader=true 时)         |
    |                                    |-- 末页追加 footer 行              |
    |                                    |   (仅 showFooter=true 时)         |
    |                                    |-- 空行填充（如启用）              |
    |                                    |                                   |
    |                                    |-- 为每页生成虚拟 TableNode ------>|
    |                                    |   (只包含当页行序列)              |
    |                                    |                                   |
    |                                    |   标准 render(virtualNode) ------->|
    |                                    |                                   |-- 渲染当页表格
```

### 虚拟表格节点

PagePlanner 切分完成后，为每页生成一个虚拟 `TableNode`：

- 虚拟节点的 `topology.rows` 只包含当页的行序列
- repeat-template 行的展开结果作为具象行写入虚拟节点（不再是模板行）
- 虚拟节点的 `width/height` 调整为当页实际尺寸
- 表格 `ViewerExtension.render()` 接收虚拟节点，按标准 `render(node)` 接口渲染，无需感知分页逻辑

## 7.4 设计器与 Viewer 的布局差异

### 设计器画布

- 使用声明坐标编辑元素
- 关注选区、吸附、辅助线和可视反馈
- 不要求完整执行 Viewer 分页

### Viewer

- 负责真实页面计划
- 负责固定页、流式页和标签页的最终结果
- 负责表格分页、重复头和空白页语义

这意味着设计器看到的是“编辑态几何”，Viewer 看到的是“运行态文档”。

## 7.5 诊断原则

布局引擎的任务不是偷偷修复一切，而是：

- 先给出稳定结果
- 再把冲突暴露出来

典型诊断包括：

- 容器溢出
- 表格列宽无法分配
- 页尾区域不足
- label 模式下超出列数限制
- 元素被裁切或越界
