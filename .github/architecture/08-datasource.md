# 8. 数据源系统

## 8.1 开发方注册驱动

数据源结构由集成方（开发者）在初始化时注册，而非模板设计用户定义。`TemplateSchema` 中不存储 `dataSource`，物料仅通过 `binding.path` 引用数据字段。

**核心流程：**

1. 开发方通过 `registerDataSource()` 注册字段树（递归 children 结构，仅做设计器展示分组）
2. 设计器左侧展示字段树，按树形结构分组
3. 用户从字段树拖拽叶子字段到画布物料上完成绑定
4. 设计器中先创建空 data-table，再通过属性面板逐列绑定源
5. 运行时通过 `engine.setData()` 一次性传入数据（支持标量值 + 对象数组）

**关键设计决策：**

- **扁平 + 对象数组共存**：setData 接收 `Record<string, unknown>`，值可以是标量或对象数组（仅一层嵌套）
- **点路径绑定**：`binding.path` 支持 `key`（标量/直接取值）和 `arrayKey.field`（从对象数组 map 出属性列）两种形式
- **扁平优先解析**：resolve 时先检查 `key in data`，不存在则 fallback 到点路径拆解（`data[arrayKey].map(item => item.field)`）
- **禁止 key 含点号**：注册字段的 key 不允许包含 `.`，避免扁平 key 与点路径歧义
- **无命名空间**：所有字段名全局唯一，后注册的同名字段覆盖先注册的
- **统一绑定**：文本物料和 data-table 列都使用 `binding.path`，运行时由数据类型决定行为
- **运行时推断维度**：注册时不声明字段是标量还是列表，运行时自动判断
- **同 data-table 同源约束**：同一个 data-table 的所有列必须来自同一个对象数组前缀，设计时 + 运行时双重校验（Schema 中不存储 sourceKey，data-table 仍为纯列容器）
- **列间完全隔离**：data-table 各列独立绑定，表达式不能跨列引用同行数据
- **渲染器负责降级**：文本物料 resolve 到数组时，由渲染器定义降级展示策略（如 join、取首元素等）

## 8.2 数据源注册接口

```typescript
/**
 * 字段树节点 -- 递归 children 结构
 * 非叶子节点（有 children）为分组标题，仅用于展示（不区分「普通分组」与「对象数组源」）
 * 叶子节点（无 children）为可绑定字段，必须有 key
 */
interface DataFieldNode {
  /** 字段唯一标识（叶子节点必填，分组节点可选）。禁止包含 '.' */
  key?: string
  /** 显示名称 */
  title: string
  /** 字段说明 */
  description?: string
  /**
   * 自定义完整绑定路径（叶子节点可选）
   * 设计器拖拽时生成的 binding.path 使用此值。
   * 如果未指定，默认使用叶子节点的 key 作为 binding.path。
   * 典型用途：对象数组场景下，叶子设置 fullPath='orderItems.c1'，
   * 表示从数组中 map 出属性列。
   */
  fullPath?: string
  /** 子节点（存在时为分组节点，可在设计器中展开/折叠） */
  children?: DataFieldNode[]
}

/**
 * 数据源注册项 -- 由集成方（开发者）提供
 * 一个注册项代表一棵字段树，在设计器中作为顶层分组展示
 */
interface DataSourceRegistration {
  /** 显示名称（字段树顶层分组标题） */
  displayName: string
  /** 图标（字段树分组图标） */
  icon?: string | Component
  /** 字段树（递归 children 结构） */
  fields: DataFieldNode[]
}
```

## 8.3 注册 API

```typescript
// --- 初始化时注册 ---
const engine = new EasyInkEngine({
  dataSources: [
    {
      displayName: '订单数据',
      icon: 'order-icon',
      fields: [
        { key: 'orderNo', title: '订单号' },
        {
          title: '客户信息',   // 纯展示分组节点，无 key
          children: [
            { key: 'customerName', title: '客户名称' },
            { key: 'customerPhone', title: '联系电话' },
          ],
        },
        {
          title: '订单明细',   // 分组节点（实际对应对象数组，但注册时不做区分）
          children: [
            { key: 'itemName', title: '商品名称', fullPath: 'orderItems.itemName' },
            { key: 'itemQty', title: '数量', fullPath: 'orderItems.itemQty' },
            { key: 'itemPrice', title: '单价', fullPath: 'orderItems.itemPrice' },
            { key: 'itemAmount', title: '金额', fullPath: 'orderItems.itemAmount' },
          ],
        },
      ],
    },
    {
      displayName: '公司信息',
      icon: 'company-icon',
      fields: [
        { key: 'companyName', title: '公司名称' },
        { key: 'companyAddress', title: '公司地址' },
        { key: 'companyLogo', title: '公司Logo' },
      ],
    },
  ],
})

// --- 运行时替换数据源（如业务模块切换） ---
engine.unregisterDataSource('订单数据')
engine.registerDataSource({
  displayName: '发票数据',
  fields: [ /* ... */ ],
})
```

## 8.4 数据填充

`setData()` 接收 `Record<string, unknown>`，值可以是标量或对象数组（仅一层嵌套）：

```typescript
// 元素绑定示例
{
  binding: { path: 'customerName' }         // 文本元素 → 标量（直接取值）
}
{
  binding: { path: 'companyLogo' }          // 图片元素 → 标量
}
{
  binding: { path: 'orderItems.itemName' }  // 文本元素绑定点路径 → resolve 得到数组 → 渲染器降级展示
}
// data-table 不持有 binding，每列独立绑定（同 data-table 所有列的点路径前缀必须一致）
// columns: [
//   { key: 'name', title: '商品', binding: { path: 'orderItems.itemName' } },
//   { key: 'qty',  title: '数量', binding: { path: 'orderItems.itemQty' } },
// ]

// --- 运行时数据填充 ---
engine.setData({
  // 标量字段
  orderNo: 'ORD-2024-001',
  customerName: '张三',
  customerPhone: '13800138000',
  companyName: 'ACME 公司',
  companyAddress: '北京市朝阳区xxx',
  companyLogo: 'https://example.com/logo.png',
  // 对象数组字段（data-table 列通过 orderItems.xxx 点路径绑定）
  orderItems: [
    { itemName: '商品A', itemQty: 2, itemPrice: 100, itemAmount: 200 },
    { itemName: '商品B', itemQty: 1, itemPrice: 50, itemAmount: 50 },
  ],
})
```

**解析优先级：** `resolve(path, data)` 先检查 `path in data`（扁平 key 精确匹配），如果存在则直接返回 `data[path]`；不存在则尝试按 `.` 拆解为 `[arrayKey, field]`，返回 `data[arrayKey].map(item => item[field])`。

## 8.5 数据解析器

```typescript
/**
 * 数据解析器 -- 负责从数据对象中提取值
 *
 * 解析策略：
 * 1. 扁平优先：先检查 path in data，命中则直接返回 data[path]
 * 2. 点路径 fallback：未命中则按 '.' 拆解（仅支持一层：arrayKey.field）
 *    → data[arrayKey].map(item => item[field])
 *
 * 安全性：路径每一段都检查 __proto__、constructor、prototype（防原型链污染）
 */
class DataResolver {
  /**
   * 根据路径从数据中提取值
   * 返回原始值（标量或数组），调用方根据上下文自行处理类型
   *
   * 扁平优先：path in data → data[path]
   * 点路径 fallback：拆解为 [arrayKey, field]
   *   → data[arrayKey] 必须为数组
   *   → 返回 data[arrayKey].map(item => item[field])
   */
  resolve(path: string, data: Record<string, unknown>): unknown

  /**
   * 格式化输出值
   */
  format(value: unknown, formatter: FormatterConfig): string

  /**
   * 容错策略：
   * - 字段不存在（扁平 + 点路径都 miss）：返回 undefined
   * - 点路径的 arrayKey 对应值不是数组：抛出 Error
   * - 点路径段数 > 2：抛出 Error（仅支持一层嵌套）
   * - 路径段匹配原型链属性：返回 undefined + 警告
   * - 格式化异常：返回空字符串
   */
}
```

## 8.6 data-table 数据解析流程

```
同源校验（设计时 + 运行时双重保障）：
- 设计时：属性面板绑定列时，校验所有列的点路径前缀一致（如都是 orderItems.xxx）
- 运行时：data-table 渲染器从各列 binding.path 提取前缀，检查一致性。不一致 → throw Error
- Schema 中不存储 sourceKey，data-table 仍为纯列容器

数据解析流程：
1. data-table 渲染器收集所有列的 binding.path，提取共同的数组前缀（如 orderItems）
2. 对每列调用 DataResolver.resolve(path, data)
   - 由于同源约束，所有列 resolve 的结果数组长度 = 源数组.length
   - 对象数组元素缺失某属性 → 该位置为 undefined → 渲染层自定展示
3. 行数 = 源对象数组.length（同源保证各列等长）
4. 按行索引逐行渲染：row[i] = 各列 array[i]
5. 所有列为空数组 → 渲染空表格（仅表头）
   任一列有数据 → 正常渲染
```
