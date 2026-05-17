# Flow Row 物料设计

## 问题背景

餐饮/零售小票场景中，商品明细的排版需要一种弹性流式布局：

```
品名        数量  单价  金额
可乐        2    3.00  6.00
超级豪华汉堡套餐（双层牛肉饼+芝士+生菜+特制酱汁）
            1    68.00 68.00
```

当品名很长时，不是截断或缩小字号，而是**品名独占一行，其他列换到下一行按比例分配**。

现有 `table-static` / `table-data` 的列宽是固定 ratio，不支持这种行为。

## 设计目标

1. 支持列级换行模式：`inline`（行内）和 `block`（块级）
2. `block` 列独占一行，`inline` 列按比例在同一行排列
3. block/inline 可以任意穿插
4. 支持集合数据绑定（repeat 语义）
5. 支持动态高度计算

## Schema 设计

```typescript
interface FlowRowSchema {
  columns: FlowColumnDef[]
  gap: number // 列间距（mm）
  typography: CellTypography // 排版属性
  binding?: BindingRef // 集合绑定
}

interface FlowColumnDef {
  ratio: number // 列宽比例（仅 inline 有效）
  textAlign: 'left' | 'center' | 'right'
  binding?: BindingRef // 数据绑定
  content?: string // 静态文本
  wrapMode: 'inline' | 'block' // 换行模式
}
```

## wrapMode 语义

| wrapMode | 行为 |
|----------|------|
| `inline` | 行内列，与其他 inline 列按 ratio 在同一行排列 |
| `block` | 块级列，独占一行，宽度 100% |

## 渲染规则

1. 所有列按 schema 顺序排列
2. 连续的 `inline` 列组成一个"行内组"，按 ratio 分配宽度
3. 遇到 `block` 列时，先输出当前行内组，再输出 block 列独占一行
4. block 列之后的 inline 列组成新的行内组

## 示例

### 场景 A：品名 block

```typescript
columns: [
  { ratio: 0.44, wrapMode: 'block' }, // 品名
  { ratio: 0.20, wrapMode: 'inline' }, // 数量
  { ratio: 0.20, wrapMode: 'inline' }, // 单价
  { ratio: 0.20, wrapMode: 'inline' }, // 金额
]
```

渲染：
```
超级豪华汉堡套餐（双层牛肉饼+芝士+生菜+特制酱汁）
        1         68.00         68.00
```

### 场景 B：全部 inline

```typescript
columns: [
  { ratio: 0.44, wrapMode: 'inline' },
  { ratio: 0.12, wrapMode: 'inline' },
  { ratio: 0.20, wrapMode: 'inline' },
  { ratio: 0.24, wrapMode: 'inline' },
]
```

渲染（与现有 table-data 行为一致）：
```
品名      数量    单价    金额
可乐       2     3.00    6.00
```

### 场景 C：中间插入 block

```typescript
columns: [
  { ratio: 0.30, wrapMode: 'inline' }, // 数量
  { ratio: 0.30, wrapMode: 'inline' }, // 单价
  { ratio: 0.40, wrapMode: 'block' }, // 备注
]
```

渲染：
```
数量    单价
 2     3.00
备注：加冰，少糖
```

## 渲染实现

### HTML 结构

```html
<div class="flow-row">
  <!-- 行内组 1 -->
  <div class="flow-inline-group">
    <div style="width: 50%; text-align: left;">可乐</div>
    <div style="width: 50%; text-align: center;">2</div>
  </div>
  <!-- 块级列 -->
  <div class="flow-block">超级豪华汉堡套餐（双层牛肉饼+芝士+生菜+特制酱汁）</div>
  <!-- 行内组 2 -->
  <div class="flow-inline-group">
    <div style="width: 50%; text-align: right;">68.00</div>
    <div style="width: 50%; text-align: right;">68.00</div>
  </div>
</div>
```

### CSS

```css
.flow-row {
  display: flex;
  flex-direction: column;
  gap: 2mm;
}
.flow-inline-group {
  display: flex;
  gap: 2mm;
}
.flow-block {
  width: 100%;
}
```

## 集合数据绑定

支持 repeat-template 语义：一个 `flow-row` 定义模板，运行时按集合数据重复渲染多个 `flow-row`。

```typescript
interface FlowRowSchema {
  columns: FlowColumnDef[]
  gap: number
  typography: CellTypography
  binding?: BindingRef // 绑定到集合字段，如 items
}
```

### 数据解析流程

1. 从 `binding.fieldPath` 提取集合路径（如 `items`）
2. 从数据中取出集合数组
3. 为每个集合项生成一个 `flow-row` DOM
4. 每列的 `binding.fieldPath` 从集合项中解析值

## 动态高度计算（measure）

```typescript
interface FlowRowMeasureResult {
  height: number // 总高度（mm）
}
```

计算逻辑：
1. 计算每个行内组的高度（取组内最高列的高度）
2. 计算每个块级列的高度
3. 总高度 = 所有行内组高度 + 所有块级列高度 + 间距

## 实现计划

### Phase 1: Schema + 静态渲染（2-3 天）

- [ ] FlowRowSchema 类型定义
- [ ] createFlowRowNode 工厂函数
- [ ] Designer renderContent（静态文本预览）
- [ ] Viewer render（静态文本渲染）

### Phase 2: 数据绑定（2-3 天）

- [ ] 单值绑定（每个列绑定一个字段）
- [ ] 集合绑定（repeat 语义）
- [ ] measure 动态高度

### Phase 3: 交互完善（2-3 天）

- [ ] 属性面板（列级属性编辑）
- [ ] 列的增删改
- [ ] Designer 工具栏

## 复杂度评估

### 整体：中等

与现有 `table-data` 物料相比，`flow-row` 的核心逻辑更简单（没有 header/footer/合并/分页），但需要处理 block/inline 的布局逻辑。

### 分层评估

| 层 | 工作量 | 说明 |
|---|---|---|
| Schema 类型 | 小 | 纯类型定义 |
| Designer 扩展 | 中 | block/inline 布局预览，列的增删改 |
| Viewer 扩展 | 中 | block/inline 布局 + 集合数据展开 |
| 属性面板 | 中 | 列级属性编辑 |
| 物料注册 | 小 | 标准流程 |

### 可复用的现有能力

- 集合数据解析：`extractCollectionPath`、`resolveFieldFromRecord`
- 绑定解析：`resolveBindingValue`、`ResolvedCellBindings`
- 排版属性：`CellTypography` 类型
- 物料注册模式：标准注册流程
- stack flow 集成：`layoutMode: 'flow'` 自动参与重排

## 与 table-data 的对比

| 维度 | table-data | flow-row |
|---|---|---|
| 行角色 | header/repeat-template/footer | 无 |
| 列布局 | 固定 ratio | block/inline 混合 |
| 合并单元格 | 支持 | 不支持 |
| 分页 | 支持 | 不支持 |
| 集合展开 | 支持 | 支持 |

总体复杂度**低于 table-data**，主要省在没有行角色、合并、分页这些复杂逻辑。
