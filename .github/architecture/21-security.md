# 21. 安全模型

## 21.1 数据路径安全

- 数据路径解析器必须阻止访问 `__proto__`、`constructor`、`prototype`。
- 规范路径使用 `/` 分隔，并兼容旧 `.` 路径导入；解析时不得允许原型链穿透。
- 字段树注册阶段应避免歧义路径，并在导入层统一做路径规范化。

## 21.2 渲染安全

- 动态数据插入 DOM 时默认使用 `textContent`，而不是 `innerHTML`。
- 富文本元素若允许 HTML 输入，必须在进入 Viewer 前经过 sanitize 处理或被限制在可信来源边界内。
- 图片 URL 可由业务侧叠加白名单策略；架构层不主动发起跨域兜底。

## 21.3 设计器安全

- 属性面板不执行任意脚本，不提供模板动态计算输入入口。
- 绑定标签仅展示字段路径，不执行字段值。
- 内部扩展点默认只允许注册组件、元素定义和 Hook，不允许注入任意运行时代码沙箱。

## 21.4 非目标

- 运行时模板动态计算沙箱（当前自定义绑定函数只面向可信模板，不构成沙箱）
- 自定义 ECharts option 代码沙箱（`chart-custom` 的 `props.optionCode` 只面向可信模板作者）
- helper 函数白名单执行
- 物理打印设备层面的安全与合规策略

## 21.5 绑定显示格式函数

`BindingRef.format.custom.source` 允许可信模板保存同步 JavaScript 函数表达式，例如 `(value, data) => String(value)`。

安全边界：

- 第一版只承诺可信模板场景，不允许把它当成可打开不可信模板的沙箱
- Viewer 向函数传入当前绑定值和当前正在消费的完整运行时 data，不传入 DOM 或网络能力
- 实现会屏蔽常见全局入口以减少误用，但这不是强隔离；可信模板作者仍需为死循环、长耗时和副作用负责
- 格式化异常必须转成 `datasource` warning，打印输出保留原始值

## 21.6 自定义 ECharts Option 代码

`chart-custom` 支持在 Schema 中保存 `props.optionCode`，由 Viewer/Designer 执行后得到完整 ECharts option。它用于可信模板中的复杂图表装配，不是面向不可信模板的脚本沙箱。

安全边界：

- Schema 只保存源码字符串和 JSON-safe props，不保存函数对象。
- 代码执行上下文提供 `ctx` 和完整 `echarts` 包。`ctx` 包含运行时 `data`、绑定得到的 option、节点、尺寸、单位和当前 props。
- 实现会遮蔽 `window`、`document`、`globalThis`、`fetch`、`XMLHttpRequest`、`localStorage`、`sessionStorage` 等常见入口，降低误用概率，但这不是安全隔离。
- 模板作者仍需为死循环、长耗时、内存占用和其他副作用负责。宿主若允许导入不可信模板，应在导入/发布流程外置审查或禁用该物料。
- 执行或 JSON 解析异常必须转成图表物料 warning diagnostic，并回退到默认 option，不能中断整页渲染、打印或导出。

数据源直接绑定 `props.option` 时不执行脚本；绑定结果可以是对象或 JSON 字符串。JSON 字符串解析失败同样进入 warning diagnostic。
