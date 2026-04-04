# 8. 数据源系统

EasyInk 的数据源系统升级为一条独立主线，不再是 Designer 的简单字段树配件。

## 8.1 目标

数据源系统要同时满足四种用途：

- 左侧字段树展示与搜索
- 物料拖拽绑定
- 预览器运行时取数
- 批量投放、格式规则与聚合规则

## 8.2 数据源描述协议

```typescript
interface DataSourceDescriptor {
  id: string
  name: string
  tag?: string
  icon?: string
  expand?: boolean
  headless?: boolean
  fields: DataFieldNode[]
}

interface DataFieldNode {
  name: string
  key?: string
  path?: string
  use?: string
  props?: Record<string, unknown>
  bindIndex?: number
  union?: UnionBinding[]
  expand?: boolean
  fields?: DataFieldNode[]
}
```

字段说明：

- `tag` 用于指向远端数据接口或数据源类型
- `use` 表示推荐物料类型或物料模板
- `props` 表示拖拽创建时的默认属性
- `union` 表示一拖多批量投放规则
- `bindIndex` 支持多参数绑定物料

## 8.3 绑定引用与字段树分离

字段树不整体写入 Schema，但绑定会保存引用元数据：

- `sourceId`
- `sourceTag`
- `fieldPath`
- `fieldLabel`
- `usage`

也就是说：

- 设计器通过字段树帮助绑定
- 模板通过绑定引用保持可回放性
- Viewer 通过 `sourceId` / `sourceTag` 找到实际数据适配器

## 8.4 数据适配器

Viewer 不应该假设数据一定是一个已经预处理好的扁平对象。它应该允许宿主接入适配器：

```typescript
interface DataAdapter {
  id: string
  match(source: DataSourceDescriptor): boolean
  load(source: DataSourceDescriptor, context: DataLoadContext): Promise<unknown>
}
```

这让 EasyInk 可以支持：

- 本地 mock 数据
- HTTP 请求
- 业务端传入内存对象
- 模板库样例数据

## 8.5 路径与格式规则

### 路径规则

- 规范路径分隔符使用 `/`
- 导入层兼容 `.` 路径
- 容器、对象、数组都可以通过嵌套路径表达

### 格式规则

- `usage` 表达数字格式化、前后缀、聚合等安全声明式能力
- 不支持模板内直接写任意脚本

## 8.6 批量投放

参考对标产品，字段节点可声明 `union`：

- 主字段拖拽时自动生成多个物料
- 子字段通过相对偏移追加投放
- 常用于票据基础信息、二维码配套文案、卡片字段组

这是 EasyInk 当前文档里此前完全缺失的一层能力。

## 8.7 data-table 绑定约束

data-table 绑定不再是“列自己随便绑”，而要遵守结构约束：

- 表格必须明确主数据源
- 数据区行绑定到集合字段
- 单元格绑定相对字段或聚合字段
- 合计区绑定聚合规则，而不是冒充普通字段

## 8.8 Designer 与 Viewer 共享协议

新的原则是：

- Designer 不独占数据源协议
- Viewer 不绕开数据源协议

这样才能保证：

- 设计时看到的字段树与预览时加载的数据是一致的
- 模板在脱离 Designer 后仍能独立回放
