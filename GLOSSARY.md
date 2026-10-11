# EasyInk 领域术语

统一文档编辑、物料能力和预览输出中的名称。具体接口与迁移方案见对应架构文档和重构地图。

## Language

**文档 Schema（Document Schema）**：
描述模板内容、布局与数据关系的持久化文档模型。
_Avoid_: 插件配置、工作台状态

**物料类型（Material Type）**：
文档中一类元素的稳定身份，用来关联该类元素的领域含义与可用能力。
_Avoid_: 插件身份、渲染器身份

**物料节点（Material Node）**：
文档中某个物料类型的具体元素，携带该元素的内容、位置和数据关系。
_Avoid_: 插件实例

**物料定义（Material Definition）**：
对一类物料的创建规则、数据绑定规则和固有能力的描述。
_Avoid_: 完整插件包、属性面板、渲染实现

**物料能力装配层（Material Capability Assembly）**：
将物料定义、编辑能力、预览能力与界面扩展组合成可用宿主的层次。
_Avoid_: Schema 扩展层

**EasyInk 插件（EasyInk Plugin）**：
向 EasyInk 宿主贡献一组能力的安装与生命周期单位，可以服务一个物料、多个物料或非物料功能。
_Avoid_: 物料节点、一插件一物料

**能力贡献（Capability Contribution）**：
某个插件提供的一项物料定义、渲染能力或界面能力。
_Avoid_: 插件整体、旧 Designer Contribution 对象

**Designer Contribution（旧接口）**：
现有 Designer 接入面板、工具栏动作和命令的扩展单位。
_Avoid_: 所有能力贡献的通称

**设计态渲染器（Designer Renderer）**：
呈现物料的编辑形态并提供其设计交互的能力。
_Avoid_: 打印渲染器、Viewer UI

**运行态渲染器（Viewer Renderer）**：
根据文档与实际数据生成物料输出，并按需要参与测量和分页的能力。
_Avoid_: 工作台组件、预览工具栏

**物料目录（Material Palette）**：
向编辑者呈现可插入物料及其预设变体的界面入口集合。
_Avoid_: 物料定义注册表

**Viewer UI**：
承载预览操作、诊断提示或叠加界面的交互界面，不属于文档输出内容。
_Avoid_: Viewer Renderer、打印页面内容

**渲染会话（Render Session）**：
一次基于确定文档、数据和渲染环境的输出计算及其临时状态范围。
_Avoid_: 插件生命周期、文档持久化状态

**已提交输出（Committed Output）**：
某次渲染成功后正式对外呈现的一致结果，包含页面内容、页数及其对应的文档和数据版本。
_Avoid_: 正在计算的结果、最新请求、文档 Schema
