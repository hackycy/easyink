---
description: EasyInk 包概览：Designer、Viewer、Schema、Core、Datasource 等模块的职责划分与选型指南。
---

# 包概览

第一次看 EasyInk 的包列表，很容易有一种感觉：包很多，不知道该从哪装起。

其实不用一上来就把整张表背下来。先按“我现在要做什么”来选，就够了。

## 编辑与预览

大多数业务项目先装这两个包：

```bash
pnpm add @easyink/designer @easyink/viewer
```

- `@easyink/designer` 提供设计器组件和相关扩展接口。
- `@easyink/viewer` 提供预览、打印和导出所需的运行时。

如果你现在处在“先把页面跑起来”的阶段，这两个包已经够用了。

## 模板能力

接下来最常用的是这几类基础包：

| 包 | 你什么时候会碰到它 |
| --- | --- |
| `@easyink/schema` | 你想手动构造、归一化、校验模板 |
| `@easyink/core` | 你在做字体、物料扩展、布局或底层能力复用 |
| `@easyink/datasource` | 你想在业务层维护数据源字段树 |
| `@easyink/schema-tools` | 你要做 Schema 校验、对齐或 AI 生成后的修复 |

通常是这样的顺序：先用 Designer 和 Viewer，遇到更细的模板问题时，再往这些包下钻。

## 打印集成

打印相关包分两层看会更清楚。

先看基础层：

- `@easyink/print-core`：Viewer 页面提取、尺寸换算和托管打印面等共享工具。

再看官方集成层：

- `@easyink/print-integration-easyink-printer`：对接 Windows 上的 EasyInk.Printer。
- `@easyink/print-integration-hiprint`：对接 electron-hiprint。

如果你的目标只是把模板打出去，优先选官方集成包，不用先自己写驱动。

## 导出能力

导出也分两层：

| 包 | 作用 |
| --- | --- |
| `@easyink/export-runtime` | 导出运行时和插件注册表 |
| `@easyink/export-plugin-dom-pdf` | 把 Viewer 页面导出成 PDF 的官方插件 |

这层设计的意思很简单：Viewer 负责把页面渲染出来，导出插件负责把这些页面变成文件。

## Designer 扩展

这时你通常会碰到下面这些包：

| 包 | 作用 |
| --- | --- |
| `@easyink/builtin` | 内置物料注册表 |
| `@easyink/locales` | 内置语言包实现，设计器会继续透出它们 |
| `@easyink/ui` | 设计器内部共用 UI 组件 |
| `@easyink/icons` | 图标资源 |

这些包更多是扩展和维护层会接触到的东西。普通业务接入一般不需要直接操作全部内容。

## 物料包

仓库里每种内置物料都拆成独立包，比如：

- `@easyink/material-text`
- `@easyink/material-image`
- `@easyink/material-barcode`
- `@easyink/material-qrcode`
- `@easyink/material-rect`
- `@easyink/material-ellipse`
- `@easyink/material-line`
- `@easyink/material-container`
- `@easyink/material-page-number`
- `@easyink/material-table-static`
- `@easyink/material-table-data`
- `@easyink/material-flow-row`
- `@easyink/material-chart`

你不用一开始就单独安装它们。多数情况下，它们会通过内置注册表进入 Designer 和 Viewer。

只有当你在研究自定义物料、对照内置实现写扩展时，才需要逐个看这些包。

## AI 与 MCP

AI 相关能力也单独拆了出来：

- `@easyink/ai`：给 Designer 提供 AI 面板和 MCP 客户端能力。
- `@easyink/mcp-server`：独立的 MCP 服务端。

这两个包不属于 Designer 运行时必需依赖。你只有在接 AI 生成模板工作流时，才需要引入它们。

## 选包原则

如果你不想每次都从零判断，可以直接按下面这个规则来：

- 只做编辑和预览：装 `@easyink/designer`、`@easyink/viewer`
- 做打印：再加官方打印集成包
- 做导出：再加导出运行时和对应插件
- 做高级扩展：再看 `schema`、`core`、物料包和 AI 包

关于包，目前知道这些就够用了。后面读具体章节时，再按需深入某个包即可。
