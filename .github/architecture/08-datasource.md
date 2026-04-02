# 8. 数据源系统

## 8.1 开发方注册驱动

数据源结构由集成方在初始化时注册，而非模板设计用户定义。`TemplateSchema` 中不存储 `dataSource`，物料仅通过 `binding.path` 记录“这个值来自哪个字段”。

**核心流程：**

1. 开发方通过 `registerDataSource()` 注册字段树，仅用于设计器展示与拖放。
2. 设计器左侧展示字段树，用户把叶子字段拖到物料上完成绑定。
3. 运行时业务方准备好展示值数据对象。
4. 渲染器读取 `binding.path`，按简单路径解析规则取值并装填 DOM。

**关键设计决策：**

- **字段树只服务设计器**：注册结构不进入 Schema，也不参与运行时复杂计算。
- **运行时数据必须是展示值**：金额、日期、地址拼接、条件分支等在业务层完成。
- **扁平 + 对象数组共存**：运行时数据接受 `Record<string, unknown>`，值可以是标量或对象数组（仅一层嵌套）。
- **点路径绑定**：`binding.path` 支持 `key` 和 `arrayKey.field` 两种形式。
- **扁平优先解析**：先查 `key in data`，miss 后再尝试点路径拆解。
- **禁止 key 含点号**：避免扁平 key 与点路径歧义。
- **同 data-table 同源约束**：同一个 data-table 的所有列必须来自同一个对象数组前缀。
- **不支持深层对象直绑**：复杂结构由业务方先拍平或预生成展示字段。
- **字段冲突仅告警，不覆盖先注册项**：同名字段注册冲突时保留首个定义，避免历史模板绑定语义漂移。

## 8.3 注册 API

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

## 8.2 数据源注册接口

```typescript
// --- 初始化时注册字段树 ---
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

// --- 设计器运行期间可替换字段树（如业务模块切换） ---
engine.unregisterDataSource('订单数据')
engine.registerDataSource({
  displayName: '发票数据',
  fields: [ /* ... */ ],
})
```

### 8.2.1 字段冲突策略

- 字段树注册阶段若出现同名叶子字段，应输出告警。
- 告警后保留先注册字段，拒绝以静默覆盖改变既有绑定指向。
- 该策略优先保护历史模板的可回放性，而不是优先照顾动态模块切换时的灵活覆盖。

## 8.4 运行时数据契约

运行时传给渲染器的数据必须已经是展示值：

```typescript
// 绑定示例
{
  binding: { path: 'customerName' }         // 文本元素 → 标量（直接取值）
}
{
  binding: { path: 'companyLogo' }          // 图片元素 → 标量
}
{
  binding: { path: 'orderItems.itemName' }  // data-table 列绑定点路径
}

const preparedDisplayData = {
  orderNo: 'ORD-2024-001',
  customerName: '张三',
  customerPhone: '13800138000',
  companyName: 'ACME 公司',
  companyAddress: '北京市朝阳区xxx',
  companyLogo: 'https://example.com/logo.png',
  amountText: '¥250.00',
  fullAddress: '北京市朝阳区xxx',
  orderItems: [
    { itemName: '商品A', itemQty: 2, itemPrice: 100, itemAmount: 200 },
    { itemName: '商品B', itemQty: 1, itemPrice: 50, itemAmount: 50 },
  ],
}

renderer.render(schema, preparedDisplayData, container)
```

### 渲染前数据准备建议

- 标量物料直接绑定最终展示字段，例如 `amountText`、`fullAddress`、`barcodeValue`
- data-table 的对象数组也应提前完成列级格式化，避免渲染期再做金额或日期转换
- 如果业务原始数据来自深层对象，应先在适配层拍平成渲染数据
- 如果同一模板有多套业务上下文，应在进入 renderer 前完成统一字段映射

不再支持：

- 在模板中编写动态计算规则
- 在绑定上声明格式化器
- 依赖运行时把深层业务对象变换成展示值

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
  resolve(path: string, data: Record<string, unknown>, report?: (diagnostic: DataResolveDiagnostic) => void): unknown

  /**
   * 容错策略：
   * - 字段不存在（扁平 + 点路径都 miss）：返回 undefined
   * - 点路径的 arrayKey 对应值不是数组：返回 undefined + 诊断
   * - 点路径段数 > 2：返回 undefined + 诊断（仅支持一层嵌套）
   * - 路径段匹配原型链属性：返回 undefined + 诊断
   */
}

interface DataResolveDiagnostic {
  code: string
  message: string
  path: string
}
```

## 8.6 data-table 数据解析流程

```
同源校验（设计时 + 运行时双重保障）：
- 设计时：属性面板绑定列时，校验所有列的点路径前缀一致（如都是 orderItems.xxx）
- 运行时：data-table 渲染器从各列 binding.path 提取前缀，检查一致性。不一致 → 输出诊断并降级为空表头
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

运行时降级原则：
- 标量物料字段缺失 → 渲染空白 + diagnostics
- data-table 列解析失败 / 非数组 / 同源不一致 → 渲染空表格（仅表头）+ diagnostics
- 运行时尽量不因单个字段异常阻断整页渲染
```
