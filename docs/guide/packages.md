# 包概览

EasyInk 由以下独立发布到 npm 的包组成，按职责分为以下几类。

## 面向应用

| 包 | 说明 | 版本 |
|---|---|---|
| `@easyink/designer` | 设计器工作台 | [![npm](https://img.shields.io/npm/v/@easyink/designer?style=flat&colorA=080f12&colorB=1fa669)](https://npmjs.com/package/@easyink/designer) |
| `@easyink/viewer` | 预览、打印、导出引擎 | [![npm](https://img.shields.io/npm/v/@easyink/viewer?style=flat&colorA=080f12&colorB=1fa669)](https://npmjs.com/package/@easyink/viewer) |

## 核心

| 包 | 说明 | 版本 |
|---|---|---|
| `@easyink/core` | 命令、选区、几何、单位、字体 | [![npm](https://img.shields.io/npm/v/@easyink/core?style=flat&colorA=080f12&colorB=1fa669)](https://npmjs.com/package/@easyink/core) |
| `@easyink/schema` | Schema 类型、默认值、迁移、序列化 | [![npm](https://img.shields.io/npm/v/@easyink/schema?style=flat&colorA=080f12&colorB=1fa669)](https://npmjs.com/package/@easyink/schema) |
| `@easyink/schema-tools` | Schema 校验、数据源对齐工具 | [![npm](https://img.shields.io/npm/v/@easyink/schema-tools?style=flat&colorA=080f12&colorB=1fa669)](https://npmjs.com/package/@easyink/schema-tools) |
| `@easyink/datasource` | 数据源协议与字段树 | [![npm](https://img.shields.io/npm/v/@easyink/datasource?style=flat&colorA=080f12&colorB=1fa669)](https://npmjs.com/package/@easyink/datasource) |
| `@easyink/shared` | 通用类型、工具函数、常量 | [![npm](https://img.shields.io/npm/v/@easyink/shared?style=flat&colorA=080f12&colorB=1fa669)](https://npmjs.com/package/@easyink/shared) |

## UI 与物料框架

| 包 | 说明 | 版本 |
|---|---|---|
| `@easyink/ui` | 设计器 UI 组件库 | [![npm](https://img.shields.io/npm/v/@easyink/ui?style=flat&colorA=080f12&colorB=1fa669)](https://npmjs.com/package/@easyink/ui) |
| `@easyink/icons` | 图标资源 | [![npm](https://img.shields.io/npm/v/@easyink/icons?style=flat&colorA=080f12&colorB=1fa669)](https://npmjs.com/package/@easyink/icons) |
| `@easyink/builtin` | 内置物料注册表 | [![npm](https://img.shields.io/npm/v/@easyink/builtin?style=flat&colorA=080f12&colorB=1fa669)](https://npmjs.com/package/@easyink/builtin) |
| `@easyink/locales` | 设计器内置语言包（由 `@easyink/designer/locale` 透出） | [![npm](https://img.shields.io/npm/v/@easyink/locales?style=flat&colorA=080f12&colorB=1fa669)](https://npmjs.com/package/@easyink/locales) |
| `@easyink/prop-schemas` | 设计器内置物料基础属性 Schema | [![npm](https://img.shields.io/npm/v/@easyink/prop-schemas?style=flat&colorA=080f12&colorB=1fa669)](https://npmjs.com/package/@easyink/prop-schemas) |
| `@easyink/samples` | 示例模板与演示数据 | [![npm](https://img.shields.io/npm/v/@easyink/samples?style=flat&colorA=080f12&colorB=1fa669)](https://npmjs.com/package/@easyink/samples) |

## 物料

每个物料包实现一种文档元素类型（已内置）

| 包 | 说明 | 版本 |
|---|---|---|
| `@easyink/material-text` | 文本 | [![npm](https://img.shields.io/npm/v/@easyink/material-text?style=flat&colorA=080f12&colorB=1fa669)](https://npmjs.com/package/@easyink/material-text) |
| `@easyink/material-image` | 图片 | [![npm](https://img.shields.io/npm/v/@easyink/material-image?style=flat&colorA=080f12&colorB=1fa669)](https://npmjs.com/package/@easyink/material-image) |
| `@easyink/material-svg-custom` | SVG 自定义 | [![npm](https://img.shields.io/npm/v/@easyink/material-svg-custom?style=flat&colorA=080f12&colorB=1fa669)](https://npmjs.com/package/@easyink/material-svg-custom) |
| `@easyink/material-svg-heart` | SVG 心形 | [![npm](https://img.shields.io/npm/v/@easyink/material-svg-heart?style=flat&colorA=080f12&colorB=1fa669)](https://npmjs.com/package/@easyink/material-svg-heart) |
| `@easyink/material-svg-star` | SVG 星形 | [![npm](https://img.shields.io/npm/v/@easyink/material-svg-star?style=flat&colorA=080f12&colorB=1fa669)](https://npmjs.com/package/@easyink/material-svg-star) |
| `@easyink/material-rect` | 矩形 | [![npm](https://img.shields.io/npm/v/@easyink/material-rect?style=flat&colorA=080f12&colorB=1fa669)](https://npmjs.com/package/@easyink/material-rect) |
| `@easyink/material-ellipse` | 椭圆 | [![npm](https://img.shields.io/npm/v/@easyink/material-ellipse?style=flat&colorA=080f12&colorB=1fa669)](https://npmjs.com/package/@easyink/material-ellipse) |
| `@easyink/material-line` | 线条 | [![npm](https://img.shields.io/npm/v/@easyink/material-line?style=flat&colorA=080f12&colorB=1fa669)](https://npmjs.com/package/@easyink/material-line) |
| `@easyink/material-barcode` | 条形码 | [![npm](https://img.shields.io/npm/v/@easyink/material-barcode?style=flat&colorA=080f12&colorB=1fa669)](https://npmjs.com/package/@easyink/material-barcode) |
| `@easyink/material-qrcode` | 二维码 | [![npm](https://img.shields.io/npm/v/@easyink/material-qrcode?style=flat&colorA=080f12&colorB=1fa669)](https://npmjs.com/package/@easyink/material-qrcode) |
| `@easyink/material-chart` | 图表 | [![npm](https://img.shields.io/npm/v/@easyink/material-chart?style=flat&colorA=080f12&colorB=1fa669)](https://npmjs.com/package/@easyink/material-chart) |
| `@easyink/material-container` | 容器 | [![npm](https://img.shields.io/npm/v/@easyink/material-container?style=flat&colorA=080f12&colorB=1fa669)](https://npmjs.com/package/@easyink/material-container) |
| `@easyink/material-page-number` | 页码 | [![npm](https://img.shields.io/npm/v/@easyink/material-page-number?style=flat&colorA=080f12&colorB=1fa669)](https://npmjs.com/package/@easyink/material-page-number) |
| `@easyink/material-table-kernel` | 表格内核 | [![npm](https://img.shields.io/npm/v/@easyink/material-table-kernel?style=flat&colorA=080f12&colorB=1fa669)](https://npmjs.com/package/@easyink/material-table-kernel) |
| `@easyink/material-table-static` | 静态表格 | [![npm](https://img.shields.io/npm/v/@easyink/material-table-static?style=flat&colorA=080f12&colorB=1fa669)](https://npmjs.com/package/@easyink/material-table-static) |
| `@easyink/material-table-data` | 数据表格 | [![npm](https://img.shields.io/npm/v/@easyink/material-table-data?style=flat&colorA=080f12&colorB=1fa669)](https://npmjs.com/package/@easyink/material-table-data) |
| `@easyink/material-flow-row` | 流式数据行 | [![npm](https://img.shields.io/npm/v/@easyink/material-flow-row?style=flat&colorA=080f12&colorB=1fa669)](https://npmjs.com/package/@easyink/material-flow-row) |

## 打印

| 包 | 说明 | 版本 |
|---|---|---|
| `@easyink/print-core` | 打印基础工具 | [![npm](https://img.shields.io/npm/v/@easyink/print-core?style=flat&colorA=080f12&colorB=1fa669)](https://npmjs.com/package/@easyink/print-core) |
| `@easyink/print-integration-easyink-printer` | EasyInk.Printer 打印集成 | [![npm](https://img.shields.io/npm/v/@easyink/print-integration-easyink-printer?style=flat&colorA=080f12&colorB=1fa669)](https://npmjs.com/package/@easyink/print-integration-easyink-printer) |
| `@easyink/print-integration-hiprint` | HiPrint 打印集成 | [![npm](https://img.shields.io/npm/v/@easyink/print-integration-hiprint?style=flat&colorA=080f12&colorB=1fa669)](https://npmjs.com/package/@easyink/print-integration-hiprint) |

## 导出

| 包 | 说明 | 版本 |
|---|---|---|
| `@easyink/export-runtime` | 导出运行时（框架无关） | [![npm](https://img.shields.io/npm/v/@easyink/export-runtime?style=flat&colorA=080f12&colorB=1fa669)](https://npmjs.com/package/@easyink/export-runtime) |
| `@easyink/export-plugin-dom-pdf` | DOM-to-PDF 导出插件 | [![npm](https://img.shields.io/npm/v/@easyink/export-plugin-dom-pdf?style=flat&colorA=080f12&colorB=1fa669)](https://npmjs.com/package/@easyink/export-plugin-dom-pdf) |

## 扩展

| 包 | 说明 | 版本 |
|---|---|---|
| `@easyink/ai` | AI 集成（对话、MCP、提示词模板） | [![npm](https://img.shields.io/npm/v/@easyink/ai?style=flat&colorA=080f12&colorB=1fa669)](https://npmjs.com/package/@easyink/ai) |
| `@easyink/mcp-server` | MCP 服务端，LLM 生成模板 | [![npm](https://img.shields.io/npm/v/@easyink/mcp-server?style=flat&colorA=080f12&colorB=1fa669)](https://npmjs.com/package/@easyink/mcp-server) |

## 开发辅助

| 包 | 说明 | 发布状态 |
|---|---|---|
| `@easyink/skills` | EasyInk 开发工作流用的 Codex skills，包含 contribution 和 material 开发辅助 | 私有 workspace 包，不发布到 npm |
