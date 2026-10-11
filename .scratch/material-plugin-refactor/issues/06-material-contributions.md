# 确定物料能力的单一来源与 builtin 组合职责

Type: grilling
Labels: wayfinder:grilling
Status: resolved
Assignee: Codex
Parent: [EasyInk 物料能力装配层重构地图](../map.md)
Blocked by: 04, 05

## Question

如何逐字段固定物料的领域来源和能力贡献，保留现有编辑、绑定与输出行为，同时删除 builtin 重复定义和旧 bundle？

## Answer

> 本票经 2026-10-11 多轮讨论已收敛。以下是唯一有效的物料能力与集合决议；早期要求调用方拼装 model/renderer/UI、单独选择 AI、以字符串列表替代 all/basic、翻译或可选能力缺失即整体失败等草案均已被替代。类型名和私有文件名可在这些约束内实现，不能反向增加用户配置步骤。

### 一、完整物料是普通使用单位

普通使用者选择完整物料或完整集合。一个物料包集中维护自己的领域定义、Designer/Viewer 实现、属性、目录、文案和 AI 描述；框架为 Designer、Viewer 和其他消费者生成对应宿主投影。使用者不导入或排列 model、renderer、properties、locale、AI 等内部能力。

一个完整物料在对应宿主入口必须具备：

| 宿主 | 核心要求 |
| --- | --- |
| Designer | 同一物料模型 + 设计态 renderer 或受管 loader |
| Viewer | 同一物料模型 + 运行态 renderer 或受管 loader，且入口不引入 Designer/Vue |

缺少对应宿主的核心 renderer/loader 是物料定义错误：类型检查尽早发现，创建时校验兜底，按生命周期决议整体回滚。已经声明 loader 的惰性实现不要求创建时下载；惰性加载失败按运行阶段诊断和局部降级处理。

缺少 palette、properties、AI 或局部文案不阻止物料使用：没有 palette 就不显示插入入口，没有 properties 就不生成物料专属表单，没有 AI 就跳过专属 AI 知识，文案问题按非阻断 fallback/诊断处理。迁移现有内置物料时必须保留其已有功能，不能以“可选”名义删除。

文档引用未安装的物料仍保留原 Schema 节点，显示未知物料占位并允许其余文档运行；renderer 不得猜测缺失模型。

### 二、共享模型是领域单一来源

物料包内的共享模型由两端完整物料共同引用，负责：

- `type` 和 `createDefaultNode`：保持单位换算、默认值、输入合并和节点创建语义，不新增第二份默认值对象。
- `binding`：绑定种类、主属性和 data contract；不能从 `bindable` 猜测绑定规则。
- `capabilities`：静态的旋转、缩放、子节点等能力；依赖节点状态的即时控制仍由 Designer renderer 提供。
- `condition`：条件能力。省略沿用 core 默认，`false` 明确关闭；Designer 与 Viewer 使用同一归一化规则。
- `pageAware`：逐页物料标志，只声明一次；节点 `repeat.scope` 与既有合成逻辑保持。

renderer 负责绘制、测量、分页、设计交互和运行实例，不重复声明 binding、condition 或 pageAware。更换 renderer 不得改变这些模型语义。Schema、codec、migration、文档版本和节点持久化格式不因本票改变。

模型缺省行为保持当前 core 语义：condition 继续使用 `resolveMaterialConditionCapability`，pageAware 默认 false。复杂 chart/table data contract 归所属 kernel，但由物料共享模型引用，不由 builtin 复制。

### 逐字段 owner 与消费矩阵

| 内容 | 唯一来源与代码方向 | 消费者 |
| --- | --- | --- |
| type、createDefaultNode、capabilities、condition、pageAware | 各物料包共享模型；契约归 plugin-api/material | Designer、Viewer |
| binding 与 data contract | 从 builtin/src/bindings.ts 归入物料共享模型，复用所属 kernel | 绑定编辑、运行态数据投影、AI |
| 设计态 factory、动态 geometry/resize/drop 策略 | 物料 Designer 实现；契约归 plugin-api/designer | Designer；节点挂载资源独立清理 |
| render、measure、getRenderSize、fragmentPaginator | 物料 Viewer 实现；契约归 plugin-api/viewer | Viewer；会话/输出寿命由 Render Session 票据细化 |
| PropSchema、sectionFilter、特殊属性组件 | 物料 Designer 完整入口，复用现有属性编辑实现 | PropertiesPanel，保留 read/commit/visible/disabled、撤销及 flushPendingEdits |
| 名称、图标、分组引用、顺序、预设和 dragData | 物料 Designer 目录定义；公共组描述单一来源 | 插入面板；不进入 Viewer UI 依赖图 |
| locale 与 ai 描述 | 所属物料及共享公共来源，框架负责内部装配 | 文案查找与当前 Host 的 AI manifest |

通用声明 helper 可放对应 plugin-api 子入口；绑定、条件、布局与渲染计算继续复用 core，不让 core 反向依赖插件层。共享目录分组定义和文案按 [UI 票据的代码落点](./07-ui-slots.md#公共目录数据的代码落点)集中维护，物料不能反向导入 builtin。`useTokens` 当前只有类型声明、没有配置或消费者，不把它当作已有功能验收，也不借迁移新建机制。

### 三、物料包与公共出口

单物料使用简洁导出名，不加 `Material` 后缀：

```ts
// Designer
import { text } from '@easyink/material-text'
import { image } from '@easyink/material-image'
const materials = [text, image]
```

```ts
// Viewer：名称相同，物理入口隔离
import { text } from '@easyink/material-text/viewer'
import { image } from '@easyink/material-image/viewer'
const materials = [text, image]
```

多词导出名采用 lowerCamelCase，例如 `pageNumber`、`chartCustom`；这只是代码名，不修改持久化 `type`。同一物料包可以在内部按 `model`、`designer`、`viewer`、`properties`、`palette`、`locale`、`ai` 文件分工，但每个宿主出口只组合一次，不能让 Viewer 依赖包含 Designer/Vue 的聚合对象。

集合出口保持现有选择方式：

| 用途 | 出口 | 导出 |
| --- | --- | --- |
| Designer 全量 | `@easyink/builtin/all` | `materials` |
| Designer 基础 | `@easyink/builtin/basic` | `materials` |
| Viewer 全量 | `@easyink/builtin/all/viewer` | `materials` |
| Viewer 基础 | `@easyink/builtin/basic/viewer` | `materials` |
| 空集合 | 对应 `none` 语义 | 空 `materials` |

`@easyink/builtin` 根入口的 `materials` 等同 Designer all；`@easyink/builtin/none` 提供不引用具体物料、Designer/Vue 的空数组，可用于两端。以上是新契约出口，不是旧装配 API 的兼容别名。节点工厂与模型类型等非装配导出的保留入口，由破坏性切换票据按实际消费者核对。

默认仍为 all；all/basic 成员、顺序和排除行为按现有基线保持，basic 的筛选不是重新定义物料。builtin 只维护一份成员清单并生成宿主出口，不复制物料领域字段，不恢复旧 bundle 或 `register` 导出，不改成物料名称字符串列表。Viewer 出口的 JavaScript 和 `.d.ts` 依赖图必须隔离 Designer/Vue。

集合生成在库构建阶段将一份成员清单转成两端静态 import/export；物料使用者无需运行额外脚本。当前 all 为 25 种、basic 为 17 种，basic 排除 chart 与 signature；成员和目录顺序在实现前按源码基线冻结，不按集合名字重新解释。共享模型和集合成员关系均不得变成两份手工维护源。

### 四、目录、文案和 AI 随物料提供

Designer 完整物料自带默认插入目录信息：名称、图标、默认分组、显示顺序和创建预设。选择 `[text, image]` 即可获得对应目录，不另传 `catalogs` 数组或目录插件。一个物料可提供零个、一个或多个预设；多个预设共享同一模型，不重复安装。目录分组的公共名称和顺序只定义一次，框架聚合条目；materials 数组顺序不能替代现有目录顺序。Viewer 出口不携带图标和目录组件依赖。

物料文案随完整物料提供，通用文案由框架内部统一装配。文案缺失、重复或局部无效不能阻止创建、编辑、预览或打印：应用显式文案优先；同 key 同文本允许共享；同 key 不同文本按稳定声明顺序选首个有效值并记录非阻断诊断，缺失时返回 key。诊断包含语言、完整 key、来源和采用来源，去重且不逐帧刷屏。保持现有整棵语言树选择语义，不把文案冲突升级为物料身份冲突。

AI 描述随完整物料提供。选择 `text` 后，当前 Host 的只读 AI manifest 自动包含它的属性、绑定、场景和组合知识；使用者不导入或注册 `textAi`，builtin 不维护 `builtinAIMaterialDescriptors`。没有 AI 描述的物料仍可正常编辑、预览和打印，Assistant 只跳过其专属知识。manifest 只从当前 Host 已选物料生成，并过滤组件、函数、symbol 和运行句柄；物料不依赖 Assistant UI 或完整 Store。

### 五、物料组合与验收

- text、image、table-data、chart-custom 等物料必须能以完整物料在 Designer 和 Viewer 独立消费；chart-custom 的受管惰性 loader 必须保留。
- 自行组合使用完整物料数组，不手工列能力插件；all/basic/none 与现有目录分组、条目顺序、预设、默认值、绑定、条件、逐页处理、文案和 AI manifest 对照冻结基线。
- 替换某物料 Viewer renderer 不改变共享模型；未安装物料保留节点和诊断；缺少 palette/properties/AI 只影响对应功能。
- 新增物料只需修改自身包和显式集合成员清单，框架不得按新 `material type` 增加分支。
- 验收检查最终 Designer/Viewer JavaScript 与声明依赖图，Viewer 无 Designer/Vue/Assistant UI；不能只凭源码搜索或 external 配置证明隔离。

本票的 Answer 记录架构决议，不表示代码已经实现。后续 UI、Render Session、0.1.0 切换和验收票据必须遵循这里的完整物料与单一来源约束。

## 决策历史

2026-10-11 用户逐轮确认：共享模型字段归属、简洁单物料导出名、目录随物料提供、AI 描述随完整物料提供。翻译冲突的致命失败规则在生命周期票据中被用户撤回，物料票据按非阻断文案处理。
