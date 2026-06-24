# 26. 条件渲染系统

本文档定义 EasyInk 的条件渲染数据模型、求值语义、Designer 编辑体验与 Viewer 执行边界。

## 26.1 目标与边界

条件渲染采用固定的两层逻辑模型：

- 一个条件组内的所有条件使用 AND，全部成立时该组成立。
- 多个条件组之间使用 OR，任意一组成立时整体条件成立。
- 没有任何条件时整体条件成立。
- 用户可以配置“条件成立时显示”或“条件成立时隐藏”。

固定两层模型直接对应用户心智，不提供任意嵌套、组操作符切换和 `not` 节点。否定语义由 `neq`、`notIn`、`notContains`、`notExists` 等明确操作符表达。

条件能力只控制节点是否输出，不修改内容、绑定、样式或其他物料属性。节点隐藏时支持两种布局效果：

- `remove`：跳过绑定、测量、布局、分页和绘制。
- `reserve`：仍执行绑定、测量、布局和分页，只跳过最终绘制；保留本次运行时测量后的真实空间。

条件必须在布局和分页前求值。只在最终 DOM 阶段设置 `display: none` 不符合语义，因为被排除节点仍会占位并影响页数。

本期不支持：

- JavaScript 条件源码、算术表达式和正则表达式。
- 条件属性赋值或条件绑定。
- 表格、Flow Row 的逐记录过滤。
- 容器子树条件的运行时接入。
- 集合之间的 join、聚合、排序和跨集合关联判断。

互斥内容使用多个节点分别配置条件。例如同一位置放置两个二维码节点，分别配置相反条件；不为单节点增加条件切换绑定能力。

## 26.2 物料条件能力

条件渲染是所有 `MaterialNode` 的默认框架能力。物料无需注册即可支持节点级条件渲染，默认隐藏效果为：

```ts
interface MaterialConditionDefinition {
  scope: 'node'
  hiddenEffects: Array<'remove' | 'reserve'>
}

const DEFAULT_MATERIAL_CONDITION: MaterialConditionDefinition = {
  scope: 'node',
  hiddenEffects: ['remove', 'reserve'],
}
```

物料只在需要收窄或禁用条件能力时声明覆盖：

```ts
interface DesignerMaterialRegistration {
  condition?: MaterialConditionDefinition | false
}

interface MaterialViewerExtension {
  condition?: MaterialConditionDefinition | false
}
```

字段语义：

- `condition` 省略：使用默认条件能力，支持 `remove` 和 `reserve`。
- `condition: false`：显式禁用条件渲染，Designer 不显示条件配置入口，Viewer 忽略该节点上的 `renderCondition`。
- `condition: { ... }`：收窄该物料允许的隐藏效果，例如仅允许 `remove`。

职责边界：

- Core/Viewer 统一负责规则求值、安全数据路径、诊断以及 `remove/reserve` 布局处理。
- 物料仅在默认能力不合适时声明禁用或收窄隐藏效果。
- Designer 默认对物料显示条件配置入口，除非物料显式 `condition: false` 或通过属性面板 section filter 隐藏。
- Designer 与 Viewer 使用同一份物料条件覆盖定义，避免双端能力漂移。
- Viewer 遇到显式禁用条件能力但 Schema 带条件的节点时忽略条件并正常输出。

本期不为内置物料设置条件能力白名单。表格、Flow Row、图表、页码、progress/rating 和 SVG 系列默认同样支持条件渲染；如果后续发现某个物料的 `reserve` 或条件语义不合适，再由该物料显式收窄或禁用。

## 26.3 Schema 位置与顶层行为

条件影响框架级布局与输出，保存为 `MaterialNode` 根部公共可选字段，不放入物料私有 `props`：

```ts
interface MaterialNode {
  // existing fields
  renderCondition?: RenderCondition
}

interface RenderCondition {
  enabled?: boolean
  whenMatched: 'show' | 'hide'
  whenHidden?: 'remove' | 'reserve'
  onUnknown?: 'show' | 'hide'
  groups: ConditionGroup[]
}
```

字段语义：

- `enabled !== false` 时执行条件；`enabled: false` 时完整保留配置但不执行，节点正常显示。
- `whenMatched` 决定整体条件为 `true` 时显示还是隐藏；条件为 `false` 时执行相反结果。
- `whenHidden` 决定最终隐藏时移除布局还是保留占位，默认 `remove`。
- `onUnknown` 决定整体结果为 `unknown` 时显示还是隐藏，默认 `show`，保证 fail-open。
- `groups: []` 表示没有条件，整体结果为 `true`。

因此空条件是有效配置：

- `whenMatched: 'show'` 表示始终显示。
- `whenMatched: 'hide'` 表示始终隐藏。

Designer 必须在摘要中明确显示“无条件，始终显示”或“无条件，始终隐藏”，避免空配置产生隐蔽行为。

`hidden` 与条件的优先级：

- `hidden: true` 始终优先，不再求值 `renderCondition`。
- 静态 `hidden` 保留占位，等价于 `reserve`。
- 条件不能让静态隐藏节点重新显示。

## 26.4 条件组与条件行

持久化模型直接表达固定的组间 OR、组内 AND：

```ts
interface ConditionGroup {
  conditions: ConditionRow[]
}

interface ConditionRow {
  source: ConditionFieldRef
  operator: ConditionOperator
  valueType?: ConditionValueType
  value?: ConditionValue | ConditionValue[]
}
```

约束：

- `groups` 之间固定使用 OR，不保存可配置 operator。
- `conditions` 之间固定使用 AND，不保存可配置 operator。
- 集合量词属于单条条件的 `operator`，不是条件组字段，也不是额外的运行时作用域。
- 已保存的 `ConditionGroup.conditions` 至少包含一条完整条件。
- Dialog 中允许存在空条件组和不完整行，但它们只属于本地草稿。没有条件组时展示空态，不自动创建条件组或条件行。
- 保存时删除空组；所有组均为空时写入 `groups: []`。
- 不提供递归子组和 `not` 节点。

整体标量求值等价于：

```text
group[0].condition[0]
AND group[0].condition[1]
OR
group[1].condition[0]
AND group[1].condition[1]
```

## 26.5 数据源、值与数据类型

每一行在 UI 中固定显示四个主列，列语义稳定，但视觉上按表格行编辑：

```text
数据源 | 条件 | 值 | 数据类型 | 行操作
```

“数据源”列在交互上是字段选择入口，不是普通下拉框，也不暴露运行时求值上下文。单元格点击后打开属性字段树选择器，用户从已有数据源结构中选择字段；保存时再由 Designer 写入 `ConditionFieldRef`。

字段引用保存完整路径以及必要的设计态可读元数据：

```ts
interface ConditionFieldRef {
  path: string
  sourceId?: string
  sourceName?: string
  sourceTag?: string
  fieldLabel?: string
}
```

运行时只使用 `path`：

- `path` 保存完整字段路径，与普通 `BindingRef.fieldPath` 和 `DataContractFieldMapping.select.path` 使用同一套 `/` 分隔约定。
- Viewer 从全局 `data` 根解析完整路径；条件系统不引入 `item`、相对路径或组级运行时上下文。
- `sourceId/sourceName/sourceTag/fieldLabel` 只用于 Designer 重匹配、摘要和诊断，不是运行时数据路由依据。
- Viewer 不读取 Designer 数据源描述，也不读取节点绑定后的 `resolvedProps`。

值只支持固定值：

```ts
type ConditionScalar = string | number | boolean | null

type ConditionValue = { kind: 'literal', value: ConditionScalar }

type ConditionValueType =
  | 'string'
  | 'trimmed-string'
  | 'case-insensitive-string'
  | 'number'
  | 'boolean'
  | 'datetime'
```

同一行的 `valueType` 同时约束数据源值和固定比较值。

值单元格随操作符变化：

- `exists/notExists/isEmpty/isNotEmpty`：不显示值输入，`value` 必须省略。
- `between/notBetween`：显示起始值和结束值，`value` 必须为两个值。
- `in/notIn`：显示可增删的候选值列表，至少一个候选值。
- 其他二元操作符：显示一个值。

数据类型列控制固定值编辑器和运行时转换：

- `string/trimmed-string/case-insensitive-string`：文本输入。
- `number`：数值输入。
- `boolean`：布尔选择。
- `datetime`：日期时间输入，按 ISO 8601 保存。
- 一元状态操作符不需要数据类型，列中显示 `--`。

Designer 可根据 `DataFieldNode.meta` 推断初始数据类型，但最终类型必须写入条件行；运行时不依赖数据源元数据猜测类型。

## 26.6 操作符

条件行只保存一个结构化判断方式：

```ts
type ConditionCompareOperator =
  | 'eq' | 'neq'
  | 'gt' | 'gte' | 'lt' | 'lte'
  | 'between' | 'notBetween'
  | 'in' | 'notIn'
  | 'contains' | 'notContains' | 'startsWith' | 'endsWith'
  | 'exists' | 'notExists' | 'isEmpty' | 'isNotEmpty'

type ConditionQuantifier = 'any' | 'all' | 'none'

interface ConditionOperator {
  compare: ConditionCompareOperator
  quantifier?: ConditionQuantifier
}
```

`compare` 支持以下操作符：

- 通用：`eq`、`neq`。
- 排序：`gt`、`gte`、`lt`、`lte`。
- 范围：`between`、`notBetween`。
- 候选集：`in`、`notIn`。
- 字符串：`contains`、`notContains`、`startsWith`、`endsWith`。
- 状态：`exists`、`notExists`、`isEmpty`、`isNotEmpty`。

补充语义：

- `between(value, min, max)` 包含上下边界；`notBetween` 是其逻辑取反。
- `in/notIn` 使用与 `eq/neq` 相同的严格标量比较。
- 字符串操作符只处理字符串。
- 排序操作符只处理同类 number、string 或转换后的 datetime。
- 对象和数组不能直接参与标量比较，只能使用 `isEmpty/isNotEmpty` 判断空状态。
- 任一操作数缺失、转换失败或结构不受支持时，除 `exists/notExists` 外返回 `unknown`。

## 26.7 集合字段判断

集合判断保持“数据源字段 + 判断方式 + 值”的条件行模型。集合语义是单条条件判断方式的一部分，不在条件组上保存额外上下文，也不引入公开的 `item` 相对路径模型。

条件行通过 `operator.quantifier` 表达字段路径解析到数组时的量化方式。`quantifier` 是 `operator` 内部结构，因此 Designer 和 Schema 都只有一个“判断方式”字段：

```ts
interface ConditionRow {
  source: ConditionFieldRef
  operator: {
    compare: ConditionCompareOperator
    quantifier?: 'any' | 'all' | 'none'
  }
  valueType?: ConditionValueType
  value?: ConditionValue | ConditionValue[]
}
```

语义：

- 未设置 `operator.quantifier`：按普通标量条件处理；如果操作数是数组或对象，除 `isEmpty/isNotEmpty` 外返回 `unknown`。
- `quantifier: 'any'`：字段路径产生的任意一个候选值满足该行比较时，该行成立。
- `quantifier: 'all'`：字段路径产生的每一个候选值都满足该行比较时，该行成立。
- `quantifier: 'none'`：字段路径产生的所有候选值都不满足该行比较时，该行成立。
- 条件行中的字段路径始终是完整路径，例如 `items/price`。
- Viewer 从全局 `data` 根按完整路径解析。解析过程中一旦经过数组，就把数组元素下的同一后续路径展开为候选值集合，例如 `items/price` 在 `items` 为数组时产生所有明细的 `price` 值。
- `operator.quantifier` 不表达“同一条集合记录同时满足多条条件”。多条条件仍然是多个独立 path 判断后再按组内 AND 组合。

示例：订单明细中任意一个金额大于 100：

```ts
{
  conditions: [
    {
      source: { path: 'items/price', fieldLabel: '金额' },
      operator: { compare: 'gt', quantifier: 'any' },
      valueType: 'number',
      value: { kind: 'literal', value: 100 },
    },
  ],
}
```

空集合采用标准量化语义：

- `any = false`
- `all = true`
- `none = true`

设置了 `operator.quantifier` 但字段路径没有经过数组时返回 `unknown` 并产生集合期望诊断。集合记录可以是对象或标量；标量记录自身通过集合字段路径引用，例如 `tags` 配合 `operator: { compare: 'eq', quantifier: 'any' }` 表示对 `tags` 数组中的每个标量值执行该行比较。

Designer 不暴露“当前数据对象、全局数据、集合上下文、作用域”等模型概念。用户只通过数据源字段树选择完整字段路径；条件字段选择器不展示“集合”等会暗示运行时语义的标签，也不能依赖 `DataFieldNode` 决定运行时是否按集合判断。是否执行集合量化只由用户选择的单个判断方式保存为 `operator.quantifier`，并由 Viewer/Core 在消费运行时数据 path 时验证。

集合判断方式放在条件列，与具体比较操作符组合为一个选项展示：

```text
等于
大于
任意一项大于
全部项大于
没有一项等于
```

其中“等于 / 大于”等普通选项不设置 `quantifier`；“任意一项 / 全部项 / 没有一项”分别保存为 `any/all/none`。界面不在条件组头展示集合上下文，也不提供“限定到集合字段 / 取消限定”入口。

数据源字段树中的 `union` 表示一拖多投放建议，不表示运行时集合，因此不能作为集合路径依据。集合是否成立必须由 Viewer/Core 对运行时 `data` 的完整路径解析结果判断；不能仅凭 `DataFieldNode`、字段拥有子节点或设计态标签推断集合语义。

## 26.8 类型、空值与三值逻辑

默认严格比较，不使用 JavaScript 隐式转换。显式转换规则：

- `string`：仅标量转字符串；`null` 保持 `null`。
- `trimmed-string`：在字符串转换后移除首尾空白字符。
- `case-insensitive-string`：在字符串转换后转为小写，用于忽略大小写的文本比较。
- `number`：接受有限数字或可完整解析的非空数字字符串；不把布尔值转成数字。
- `boolean`：接受布尔值、大小写不敏感的 `"true"/"false"`，以及数字 `1/0`。
- `datetime`：接受合法 ISO 8601 字符串或有限的 Unix 毫秒时间戳。

路径与空值：

- 路径存在且值为 `null`：`exists = true`，`isEmpty = true`。
- 路径缺失或属性值为 `undefined`：`exists = false`。
- `isEmpty` 对 `null`、`""`、`[]`、`{}` 返回 true。
- 仅含空格的字符串默认不为空；需要去首尾空白字符时使用 `trimmed-string`，需要忽略大小写时使用 `case-insensitive-string`。

`string/trimmed-string` 比较固定大小写敏感；`case-insensitive-string` 在比较前统一小写。字符串排序使用稳定的 Unicode code-point 顺序。

`datetime` 比较绝对时间点：日期按 UTC 当日零点解释，带时区的时间按其偏移解析，不带时区的日期时间转换失败。

单条条件结果为：

```text
true | false | unknown
```

组内 AND、组间 OR 和集合量化均采用 Kleene 三值逻辑并允许短路：

```text
false AND unknown = false
true  AND unknown = unknown

true  OR unknown = true
false OR unknown = unknown
```

整体 `unknown` 最终由 `onUnknown` 转成显示或隐藏，不抛出并中断整页渲染。

## 26.9 Viewer 管线

目标管线：

```text
schema + raw data
  -> material condition default/override resolution
  -> condition groups evaluation
  -> visibility resolution
  -> node state partition
       remove:  stop
       reserve: binding -> measure -> layout -> pagination -> skip paint
       include: binding -> measure -> layout -> pagination -> paint
```

结果映射：

```text
condition = true    -> whenMatched
condition = false   -> opposite(whenMatched)
condition = unknown -> onUnknown, default show

show -> include
hide -> whenHidden, default remove
```

Viewer 在绑定前通过纯函数 `resolveConditionalSchema(schema, data, registry)` 生成派生 Schema，原始 Schema 始终不修改：

- `include`：沿用原节点。
- `remove`：从派生 Schema 的 `elements` 中过滤。
- `reserve`：克隆节点并设置运行时 `hidden: true`。

后续绑定、测量、布局、分页与 RenderSurface 全部消费派生 Schema。

固定资源限制：

```text
单节点最大条件组数：32
单节点最大条件行数：256
单个集合组最大扫描记录数：10,000
单个物料单次求值预算：20,000 steps
```

超过限制时停止该节点求值，返回 `unknown`，产生一次资源限制诊断，再按 `onUnknown` 决定最终状态。每求值一条条件或访问一条集合记录至少消耗一个 step。

运行时诊断使用 `category: 'condition'` 与 `scope: 'condition'`：

- `CONDITION_FIELD_MISSING`
- `CONDITION_CAST_FAILED`
- `CONDITION_TYPE_MISMATCH`
- `CONDITION_COLLECTION_EXPECTED`
- `CONDITION_LIMIT_EXCEEDED`
- `CONDITION_EVALUATION_FAILED`

诊断均为 warning。每次 render 按 `nodeId + code + groupIndex + conditionIndex` 去重；detail 可以记录字段路径和失败类型，但不得包含实际业务值。

## 26.10 Designer 属性面板

Designer 只负责编辑，不接收条件预览数据，也不执行条件。所有节点在画布中保持可见；条件实际效果由宿主集成 Viewer 测试。

配置了 `renderCondition` 的节点在画布右上角和结构树节点旁显示条件图标；`enabled: false` 时图标弱化。标识不改变节点透明度或物料内容。

属性面板中新增独立“条件渲染”区块，位于“数据绑定”和“样式”之间，默认对物料显示；物料显式 `condition: false` 或通过 section filter 隐藏时不显示。属性面板不内联编辑条件表格，只提供：

- 启用开关。
- 行为摘要，例如“任一组成立时显示；隐藏时移除布局”。
- 规则摘要，例如“2 个条件组，共 5 条条件”。
- 空条件摘要，例如“无条件，始终隐藏”。
- “编辑条件”按钮，打开 Condition Dialog。
- “移除条件”操作，删除整个 `renderCondition`。

摘要最多展示两组简短的人类可读条件，超出部分显示计数；字段优先使用 `fieldLabel`，缺失时回退到路径。摘要不承担完整编辑职责。

## 26.11 Condition Dialog

Dialog 使用宽表格布局编辑完整条件，建议桌面宽度为工作区可用宽度的 70% 至 80%，并设置合理的最大宽度。窄屏时保持列语义，允许内容区横向滚动，不把每一行压缩成难以扫描的纵向表单。

界面目标是让用户理解为“配置几组业务判断”，而不是编辑底层表达式。运行时术语只保留在 Schema 和架构文档中；Dialog 文案优先使用“条件组、满足、否则、数据源、任意一项”等业务语言。

Dialog 顶部配置：

- 条件成立时：`显示 / 隐藏`，作为首要行为，可使用分段按钮或紧凑选择器。
- 隐藏效果：`移除布局 / 保留占位`，仅在相关能力可用时展示。
- 异常数据时：`显示 / 隐藏`，使用较弱层级，可放在更多设置或二级说明区域。

每个条件组以分区卡片呈现：

- 组标题显示“条件组 1”，组间固定显示“或者”。
- 组头默认不展示任何上下文说明；普通字段条件不需要解释“当前对象”。
- 组头不提供“限定到集合字段”入口，也不展示集合量词。
- 集合量词放在每一行的“条件”列，作为单个判断方式选项的一部分，与比较操作符组合编辑。
- 表头固定为“数据源 / 条件 / 值 / 数据类型 / 操作”。
- 组内行之间固定显示“并且”，不提供逻辑切换。
- 组底提供“添加条件”。
- 没有条件组时展示空态和“添加条件组”，由用户手动创建第一个条件组。
- 空条件组内展示组内空态和“添加条件”，由用户手动创建第一条条件。
- 存在条件组时，Dialog 底部提供“添加条件组”。
- 条件行提供“复制”和“删除”；复制后紧邻原行插入副本。
- 条件行删除只影响当前组；删除最后一个条件后保留空条件组并展示组内空态。
- 条件组提供删除；删除最后一个条件组后回到 Dialog 空态。

表格视觉规范：

- 使用单一表格容器和轻量行分隔线，不给每个单元格和每个控件再叠加明显边框。
- 行高保持一致，普通条件行建议最小高度 40px 至 44px；单元格内容垂直居中。
- 单元格内控件统一高度，数据源、条件、数据类型选择器高度一致。
- 值列可能因 `between/in` 变高；此时只让值列内部扩展，其他列顶部对齐到同一编辑基线。
- 候选值增删等低频配置不挤占主列高度，可放在值列内部的次级行或更多操作中。
- 行操作使用弱化图标按钮，默认靠右对齐，不形成额外视觉噪音。

点击数据源单元格是选择字段的主要入口。字段选择器应表现为类似 tree-select 的属性结构选择器，而不是扁平列表。选择器复用现有数据源树的搜索、展开、字段标签和类型信息，并遵循：

- 字段选择完成后只保存完整字段路径和设计态可读元数据。
- 字段树不根据 `DataFieldNode` 决定该条件是否为集合判断，也不因设计态字段元数据切换条件语义。
- 选择集合节点或集合节点下的子字段时，仍然只保存完整字段路径；是否按集合判断由该行条件列的单个判断方式决定。
- 不允许把 `union` 当成运行时集合语义依据。
- 字段选择完成后关闭选择器并回到当前单元格，不依赖拖拽才能完成配置。

字段选择器布局：

- 顶部为搜索框，支持按字段名、标题、路径搜索。
- 主体为单一树结构：数据源作为一级节点，对象和集合字段可展开，叶子字段可选择。
- 条件字段选择器不展示“集合”等类型标签；用户只感知可选择的字段路径。
- 不显示“当前数据对象 / 当前记录 / 全局数据”分组；字段选择只表达可选路径，不表达集合判断语义。
- 触发器只显示一行主标签和一行弱路径，不使用卡片式边框堆叠；未选择时显示“选择字段”。

字段选择器适合使用 Dialog 内的 popover 或侧滑面板，避免 Dialog 嵌套 Dialog。数据源窗口拖拽可以作为增强能力，但不是完成条件配置的必要路径。

## 26.12 草稿、保存与撤销

Condition Dialog 采用事务式草稿：

- 打开时从当前 `renderCondition` 创建编辑草稿。
- 添加、复制、删除、输入和切换只修改草稿，不持续写回 Schema。
- “取消”或关闭 Dialog 不产生 Schema 和历史记录变化。
- “保存”先校验并规范化草稿，再通过一次 `UpdateRenderConditionCommand` 写回完整快照。
- 保存后的一次完整 Dialog 编辑对应一次撤销；属性面板的启用和移除各自对应独立命令。

不完整行不能保存。校验错误直接定位到具体组、行和单元格，保留用户输入，不静默删除非空的不完整条件。

空组保存时删除；如果所有组均为空，保存为 `groups: []`，表达空条件成立。

## 26.13 Schema 校验与编解码

`renderCondition` 是正式元素规范字段：

- 校验 `whenMatched/whenHidden/onUnknown` 枚举值。
- 校验条件组、结构化判断方式、条件行、操作符、值元数和数据类型。
- 校验字段路径必须是完整路径；条件 Schema 不保存 `root/item` 作用域。
- 校验非空组不得包含空条件，`groups: []` 合法。
- 校验组数、条件总数限制；集合扫描数属于运行时限制。
- 非法条件令整个 Schema 校验失败；即使 `enabled: false` 也必须结构合法。
- 运行时 `unknown` 只处理合法规则遇到异常数据，不替代 Schema 结构校验。
- codec 将 `renderCondition` 作为元素 known key，decode 做最小形状读取，encode 输出规范结构。

## 26.14 实施顺序

按依赖从底向上实施：

1. Schema：定义 `RenderCondition/ConditionGroup/ConditionRow`、validation 和 codec 往返。
2. Core：复用统一字段路径解析，实现完整路径读取、值转换、三值条件组求值器、集合量化和复杂度预算。
3. Viewer：扩展条件诊断与 Material Registry，在绑定前生成派生运行时 Schema。
4. 物料：移除内置物料的默认条件能力白名单，仅保留未来需要收窄或禁用时的覆盖入口。
5. Designer 基础：增加 `UpdateRenderConditionCommand`、属性面板摘要、启停、移除和条件图标。
6. Designer Dialog：实现条件组表格、字段选择器、单判断方式选项、草稿校验、复制删除与保存事务。
7. 文档与样例：补充空条件、互斥二维码和集合字段示例。

## 26.15 测试与完成标准

测试矩阵：

- Schema：空 groups、合法/非法组、结构化判断方式、操作符值元数、完整字段路径、资源上限和 codec 往返。
- 求值器：组内 AND、组间 OR、空条件、全部操作符、显式转换、空值、三值短路和 step 预算。
- 集合：行级 any/all/none、空集合、完整路径数组展开、非数组和扫描上限。
- 行为：条件成立时显示/隐藏、条件不成立的反向结果、unknown 策略、remove/reserve。
- Designer 属性面板：能力显隐、启停、摘要、空条件警示、移除和条件图标。
- Condition Dialog：添加组、添加条件、复制、删除、字段选择、类型输入、草稿取消、校验定位、单次保存与撤销重做。
- Viewer：静态 hidden 优先、诊断去重、`updateData()` 重算和派生 Schema 不修改原 Schema。
- 物料：验证未声明条件覆盖的物料默认支持 `remove/reserve`，显式 `condition: false` 或收窄隐藏效果时 Designer 与 Viewer 行为一致。
- 集成场景：两个重叠二维码按互斥条件切换；自动高度文本在 `reserve` 下保留测量空间；订单明细中任意金额满足阈值时显示节点。

完成前依次通过：

```text
pnpm build
pnpm lint
pnpm typecheck
```
