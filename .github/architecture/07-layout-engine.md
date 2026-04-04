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

## 7.3 data-table 专项布局

data-table 需要独立的分页器，而不是依赖通用元素推移。

它至少要解决：

- 表头重复
- 数据区逐页切分
- 合计区尾页显示
- 空行填充
- 单行缩放
- 动态列和列宽分配
- 多栏排版下的表格宽度适配

```typescript
interface TableLayoutResult {
  pages: TablePageSlice[]
  diagnostics: LayoutDiagnostic[]
}

interface TablePageSlice {
  pageIndex: number
  rows: TableRowSchema[]
  includeHeader: boolean
  includeTotal: boolean
}
```

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
