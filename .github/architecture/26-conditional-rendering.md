# 26. 条件渲染系统

本文档定义 EasyInk 的条件渲染架构与首期完成标准。

## 26.1 目标与首期边界

条件能力按可扩展规则系统设计，但首期只控制节点是否输出，不修改内容、绑定、样式或其他物料属性。

首期支持两种条件不满足效果：

- `remove`：跳过绑定、测量、布局、分页和渲染。
- `reserve`：仍执行绑定、测量、布局和分页，只跳过最终绘制；保留的是本次运行时测量后的真实空间。

条件必须在布局和分页前求值。只在最终 DOM 阶段设置 `display: none` 不符合语义，因为被排除节点仍会占位并影响页数。

首期不支持：

- JavaScript 条件源码。
- 条件属性赋值或条件绑定。
- 算术表达式。
- 正则表达式。
- 表格、Flow Row 的逐记录过滤。
- 容器子树条件的实际运行时接入。当前尚无已实现的容器节点；未来容器落地时再接入递归执行。

互斥内容使用多个节点分别配置条件。例如同一位置放置两个二维码节点，分别绑定 `parentQrcode` 与 `qrCode`，并设置互斥条件。首期不为单节点增加条件切换绑定能力。

## 26.2 物料能力注册

条件渲染不是所有 `MaterialNode` 的默认能力。物料必须显式注册支持：

```ts
interface MaterialConditionDefinition {
  scope: 'node'
  effects: Array<'remove' | 'reserve'>
}
```

能力分别挂在两端注册协议上：

```ts
interface DesignerMaterialRegistration {
  condition?: MaterialConditionDefinition
}

interface MaterialViewerExtension {
  condition?: MaterialConditionDefinition
}
```

物料包导出同一个条件能力常量供 Designer 与 Viewer 引用。条件不进入仅供 Designer 交互使用的 `MaterialCapabilities`，Viewer 现有 `registerMaterial(type, binding, extension)` 调用形式保持不变，Registry 直接从 extension 读取能力。

职责边界：

- 物料声明自己是否支持条件渲染以及允许的效果。
- Core/Viewer 统一负责规则求值、安全数据路径、诊断以及 `remove/reserve` 布局处理。
- Designer 仅对声明能力的物料显示条件编辑区域。
- Viewer 遇到未声明能力但 Schema 带条件的节点时直接忽略条件并正常输出，不产生运行时诊断；这种情况只作为防御性兜底，不属于预期工作流。
- Designer 与 Viewer 注册应引用同一份物料条件定义，避免双端能力漂移。

首期开放物料：

- `text`
- `image`
- `barcode`
- `qrcode`
- `line`
- `rect`
- `ellipse`
- `signature`

首期不开放表格、Flow Row、图表、页码、progress/rating 和 SVG 系列。

## 26.3 Schema 位置

条件影响框架级布局与输出，保存为 `MaterialNode` 根部公共可选字段，不放入物料私有 `props`：

```ts
interface MaterialNode {
  // existing fields
  renderCondition?: {
    enabled?: boolean
    rule: ConditionNode
    whenFalse?: 'remove' | 'reserve'
    onUnknown?: 'include' | 'exclude'
  }
}
```

公共字段只表示统一持久化格式，不代表所有物料自动支持。能力仍由物料注册决定。

启用语义：

- 没有 `renderCondition`：节点从未配置条件。
- 存在且 `enabled !== false`：执行规则。
- `enabled: false`：不执行条件但完整保留规则。
- 空规则、空逻辑组和不完整比较均为无效 Schema，不能用来表达关闭。

`hidden` 与条件的优先级：

- `hidden: true` 始终优先，不再求值 `renderCondition`。
- 为保证旧模板行为，静态 `hidden` 保留当前占位语义，等价于 `reserve`。
- 条件不能让静态隐藏节点重新显示。

## 26.4 规则 AST

条件使用结构化、JSON-safe、可递归的判别联合，不执行 JavaScript：

```ts
type ConditionNode =
  | {
      kind: 'group'
      operator: 'and' | 'or'
      children: ConditionNode[]
    }
  | {
      kind: 'not'
      child: ConditionNode
    }
  | {
      kind: 'compare'
      operator: CompareOperator
      operands: ValueExpression[]
    }
```

规则支持字段与固定值、字段与字段比较。比较节点统一使用 `operands`，由操作符校验元数：

- `exists/isEmpty` 等一元操作符：1 个操作数。
- `eq/gt/contains` 等二元操作符：2 个操作数。
- `between/notBetween`：3 个操作数。
- `in/notIn`：至少 2 个操作数，第一个为待判断值，其余为候选值。

首期操作符：

- 通用：`eq`、`neq`。
- 排序：`gt`、`gte`、`lt`、`lte`。
- 范围：`between`、`notBetween`。
- 候选集：`in`、`notIn`。
- 字符串：`contains`、`notContains`、`startsWith`、`endsWith`。
- 状态：`exists`、`notExists`、`isEmpty`、`isNotEmpty`。

补充语义：

- `between(value, min, max)` 包含上下边界；`notBetween` 是其逻辑取反。
- `in(value, ...candidates)` 使用与 `eq` 相同的严格标量比较和大小写选项。
- `contains`、`notContains`、`startsWith`、`endsWith` 只处理字符串。
- 排序操作符只处理同类 number、string 或转换后的 datetime。
- 任一操作数为 missing、转换失败或不受支持的结构时，除 `exists/notExists` 外返回 `unknown`。

## 26.5 值表达式

运行时 Viewer 只消费 `open({ schema, data })` 中的全局 `data: Record<string, unknown>`。条件系统完全不关注 `sourceId`，也不读取 Designer 数据源描述或节点绑定后的 `resolvedProps`。

字段表达式只保存完整路径：

```ts
interface FieldValueExpression {
  kind: 'field'
  path: string
  cast?: ValueCast
}
```

Designer 可以按数据源分组展示和拖拽字段，但写入条件 Schema 的只有 `fieldPath`。条件、普通绑定和 `data-contract` 应统一从全局 `data` 根解析完整路径；`data-contract` 现有的 source-scoped 尝试应移除。

值表达式首期包含：

- 全局数据字段。
- JSON 标量字面量：`string | number | boolean | null`。
- 显式类型转换。

规范类型：

```ts
type ValueCast = 'string' | 'trimmed-string' | 'number' | 'boolean' | 'datetime'

type ValueExpression =
  | {
      kind: 'field'
      path: string
      cast?: ValueCast
    }
  | {
      kind: 'literal'
      value: string | number | boolean | null
    }
```

对象和数组不能直接参与 `eq/neq/in/notIn`，但可以使用 `isEmpty/isNotEmpty` 判断空状态。

不允许对象和数组作为固定值做相等比较。候选集合通过 `in/notIn` 的多个操作数表示；日期以字符串保存并显式转换为 `datetime`。

## 26.6 类型与空值语义

默认严格比较，不使用 JavaScript 隐式转换。首期支持以下显式转换：

- `string`：仅标量转字符串；`null` 保持 `null`。
- `trimmed-string`：在 `string` 转换后移除首尾空格。
- `number`：接受有限数字或可完整解析的非空数字字符串；不把布尔值转成数字。
- `boolean`：接受布尔值、大小写不敏感的 `"true"` / `"false"`，以及数字 `1` / `0`。
- `datetime`：接受合法 ISO 8601 字符串或有限的 Unix 毫秒时间戳。

路径缺失始终保持 missing，任何转换都不能把它变成值。转换失败返回 `unknown` 并产生诊断。

字符串操作符可以通过比较节点的 `options.caseSensitive` 逐条配置大小写敏感性：

- 默认 `caseSensitive: true`。
- `eq`、`neq`、`in`、`notIn`、`contains`、`notContains`、`startsWith`、`endsWith` 支持忽略大小写。
- 大小写选项不隐含 trim；需要去除首尾空格时显式使用 `trimmed-string`。
- 不使用 locale 排序或运行环境语言设置。
- 字符串 `gt`、`gte`、`lt`、`lte`、`between`、`notBetween` 使用稳定的 Unicode code-point 顺序。

`datetime` 比较绝对时间点，不依赖运行设备的本地时区：

- Unix 毫秒时间戳按 UTC 时间点解释。
- 带 `Z` 或明确偏移量的 ISO 字符串按其偏移解析。
- `YYYY-MM-DD` 按 UTC 当日零点解释。
- 含时间但不带时区的字符串转换失败。
- 比较前统一转换为 Unix 毫秒。

类型错误、转换失败或结构不符不抛出并中断整页渲染，而是产生诊断并令当前结果为 `unknown`。

路径与空值：

- 路径存在且值为 `null`：`exists = true`，`isEmpty = true`。
- 路径缺失：`exists = false`。
- JavaScript 中属性值为 `undefined`：按路径缺失处理。
- `isEmpty` 对 `null`、`""`、`[]`、`{}` 返回 true。
- 仅含空格的字符串默认不为空；如需去空格，应使用明确的字符串转换能力。


## 26.7 三值逻辑与失败策略

规则求值结果为：

```text
true | false | unknown
```

默认 fail-open：`unknown` 保留节点。节点可以通过 `onUnknown: 'exclude'` 显式改为排除。

逻辑组合采用 Kleene 三值语义，并允许短路求值：

```text
false AND unknown = false
true  AND unknown = unknown

true  OR unknown = true
false OR unknown = unknown

NOT unknown = unknown
```

最终节点状态至少包含：

```text
include | remove | reserve
```

其中静态 `hidden` 直接得到 `reserve`；条件为 false 时根据 `whenFalse` 得到 `remove` 或 `reserve`。

规则资源限制为固定跨平台常量：

```text
AST 最大深度：16
AST 最大节点数：256
单个物料单次求值预算：10,000 steps
```

每访问一个 AST 节点消耗一个 step，并允许短路提前结束。超过任一限制时停止该节点求值，返回 `unknown`，产生一次资源限制诊断，再按 `onUnknown` 决定最终状态。首期不允许宿主覆盖这些上限。

## 26.8 Viewer 管线

目标管线：

```text
schema + raw data
  -> material condition capability lookup
  -> condition evaluation
  -> node state partition
       remove:  stop
       reserve: binding -> measure -> layout -> pagination -> skip paint
       include: binding -> measure -> layout -> pagination -> paint
```

条件只读取原始运行时 `data`，不读取格式化绑定值、`resolvedProps` 或物料私有计算结果。

Viewer 在绑定前通过纯函数 `resolveConditionalSchema(schema, data, registry)` 生成派生 Schema，原始 Schema 始终不修改：

- `include`：沿用原节点。
- `remove`：从派生 Schema 的 `elements` 中过滤。
- `reserve`：克隆节点并设置运行时 `hidden: true`。

后续绑定、测量、布局、分页与 RenderSurface 全部消费派生 Schema。这样 `reserve` 复用现有静态 hidden 占位行为，`remove` 也不需要污染 PagePlan 契约。

条件运行时诊断使用独立的 `category: 'condition'` 与 `scope: 'condition'`，首期诊断码包括：

- `CONDITION_FIELD_MISSING`
- `CONDITION_CAST_FAILED`
- `CONDITION_TYPE_MISMATCH`
- `CONDITION_LIMIT_EXCEEDED`
- `CONDITION_EVALUATION_FAILED`

这些诊断均为 warning，不中断整页渲染。每次 render 按 `nodeId + code + AST 位置` 去重；`detail` 可以记录规则位置、字段路径和失败类型，但不得放入实际业务值。

## 26.9 Designer 编辑体验

Designer 只负责编辑，不接收条件预览数据，也不执行条件。所有节点在画布中保持可见；条件实际效果由宿主集成 Viewer 测试。

配置了 `renderCondition` 的节点在画布右上角和结构树节点旁显示小型条件图标；`enabled: false` 时图标弱化。标识不改变节点透明度或物料内容。

属性面板中新增独立“条件渲染”区块，位于“数据绑定”和“样式”之间，仅对注册能力的物料显示。

规则树在窄属性栏中完整内联编辑，不使用模态窗口：

- 逻辑组使用纵向卡片。
- 子组可折叠并显示摘要。
- 字段操作数支持字段选择，也支持从现有数据源面板直接拖入。
- 条件编辑器通过现有 `registerDatasourceDropTarget()` 注册每个字段操作数 drop slot。
- 拖拽数据中的 `sourceId`、标题等只用于交互反馈；Schema 只写入 `fieldPath`。
- 固定值根据显式类型显示相应输入控件。
- 有效编辑通过可撤销命令写回 Schema。
- 不完整的新规则保留在组件本地草稿中，不允许无效 AST 进入 Schema。
- 字段拖到空面板或逻辑组的“添加条件”区域时，创建本地 `field eq [待填写]` 草稿。
- 字段拖到已有字段操作数时替换其 `path`；拖到另一个可用操作数时形成字段与字段比较。
- `union` 字段首期拒绝拖入，因为系统不能猜测多个字段之间应使用 `and`、`or` 还是比较关系。

嵌套编辑的视觉压缩方式和规则摘要格式由实现沿用现有属性面板密度处理，不改变 AST 语义。

条件编辑使用专用 `UpdateRenderConditionCommand`，按用户逻辑动作记录撤销历史：

- 添加/删除条件、切换操作符、拖入字段、切换逻辑组，各生成一次撤销记录。
- 常量文本和数字连续输入使用同一 `mergeKey` 合并，失焦后形成一次记录。
- `enabled`、`whenFalse`、`onUnknown` 分别独立可撤销。
- 本地未完成草稿不进入命令历史。
- 命令保存修改前后的完整 `renderCondition` 快照，不为递归 AST 维护脆弱的路径级逆操作。

## 26.10 Schema 校验与编解码

`renderCondition` 是正式元素规范字段：

- Schema validation 递归校验 AST kind、操作符、操作数元数、空逻辑组以及深度/节点数限制。
- 非法条件令整个 Schema 校验失败，Viewer 拒绝打开；即使 `enabled: false` 也必须结构合法。
- 运行时 `unknown` 只处理合法规则遇到异常数据，不替代 Schema 结构校验。
- codec 将 `renderCondition` 加入元素 `knownKeys`，decode 做最小形状读取，encode 原样输出规范结构。
- 不把条件放入 `compat.passthrough`，也不增加旧字段别名、迁移 shim 或兼容格式。

## 26.11 实施顺序

按依赖从底向上实施：

1. Schema：新增条件类型、`MaterialNode.renderCondition`、递归 validation 和 codec 往返。
2. Core：实现安全路径读取、值转换、三值 AST 求值器、复杂度预算和条件能力类型。
3. Viewer：扩展条件诊断类型和 Material Registry，在绑定前生成派生运行时 Schema。
4. 物料：为首期 8 个物料导出共享能力常量，并接入 Designer/Viewer 注册。
5. Designer：新增 `UpdateRenderConditionCommand`、内联 ConditionEditor、数据源 drop slots、属性面板入口及画布/结构树标识。
6. 文档与样例：补充 Schema、Designer、Viewer 用法和互斥二维码示例。

每一步只实现当前已确定能力，不提前加入条件赋值、条件绑定、表格逐记录过滤、容器递归或脚本表达式。

## 26.12 测试与完成标准

测试矩阵：

- Schema：合法/非法 AST、变量作用域、操作数元数、深度/节点数限制、codec 往返。
- 求值器：全部操作符、显式转换、空值、三值真值表、短路、step 预算和安全路径。
- Designer：能力显隐、内联编辑、字段拖拽、union 拒绝、草稿不落 Schema、撤销/重做、条件图标。
- Viewer：`include/remove/reserve`、静态 hidden 优先、unknown 策略、诊断去重和 `updateData()` 重算。
- 物料：8 个首期物料验证 Designer 与 Viewer 使用同一能力定义。
- 集成场景：两个重叠二维码按互斥条件切换；自动高度文本在 `reserve` 下保留本次运行时测量空间。

完成前依次通过：

```text
pnpm build
pnpm lint
pnpm typecheck
```
