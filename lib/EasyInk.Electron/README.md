# EasyInk.Electron

EasyInk.Electron 是 EasyInk 的本地打印服务 Electron 版本。它参考 `lib/EasyInk.Net` 的 Engine / Printer 分层，但打印链路不依赖 .NET、PDFium/GDI 或 SumatraPDF，而是使用 Electron 内置 Chromium 的 `webContents.print()` 能力。

## 技术栈

- 脚手架：`alex8088/electron-vite`，通过 `pnpm create @quick-start/electron` 生成。
- 桌面运行时：Electron + Chromium。
- Renderer：Vue 3 + TypeScript + Pinia + vue-router。
- UI：shadcn-vue 风格组件目录，`class-variance-authority`、`clsx`、`tailwind-merge` 辅助组合样式。

## 目录结构

```text
src/main
├── engine
│   ├── engine-api.ts
│   ├── models.ts
│   └── services
│       ├── chromium-print-service.ts
│       ├── chromium-printer-service.ts
│       ├── print-job-queue.ts
│       └── providers/print-source-provider.ts
└── printer
    ├── app-context.ts
    ├── api/print-controller.ts
    ├── config/host-config.ts
    ├── ipc/ipc-handlers.ts
    ├── server
    │   ├── http-server.ts
    │   └── websocket-server.ts
    └── services
        ├── abstractions.ts
        ├── audit-service.ts
        ├── print-debug-log-service.ts
        └── simple-logger.ts
```

`engine` 只处理打印机查询、内容来源解析、同步打印、异步队列和命令协议。`printer` 是宿主层，负责配置、IPC、本地 HTTP API、审计日志和应用生命周期。

## 打印来源

`PrintRequestParams` 兼容 .NET 版本的 PDF 来源，并新增 HTML 直打和 Viewer 打印：

| 字段         | 说明                                            |
| ------------ | ----------------------------------------------- |
| `pdfBase64`  | Base64 PDF，写入临时 PDF 后交给 Chromium 打印。 |
| `pdfUrl`     | 远程 PDF URL，Chromium 直接加载。               |
| `pdfBytes`   | IPC 中传入 PDF 字节，写入临时 PDF。             |
| `html`       | HTML 字符串，写入临时 HTML 后打印。             |
| `htmlBase64` | Base64 HTML。                                   |
| `htmlUrl`    | 远程 HTML URL。                                 |
| `viewer`     | 已渲染 Viewer 页面 DOM，包装为打印 HTML。       |

HTML 输入支持 `baseUrl`，用于相对路径资源解析；`offset` 会被注入为 print CSS transform。

Viewer 输入面向已经渲染出 `.ei-viewer-page` 的业务端。传入 `viewer.pages` 后，Electron 会生成独立 HTML 文档，保留可选的 `viewer.head` 与 `viewer.styles`，并为每页添加分页规则。

```json
{
  "printerName": "HP LaserJet",
  "viewer": {
    "title": "Receipt",
    "styles": ".ei-viewer-page { width: 80mm; min-height: 120mm; }",
    "pages": ["<div class=\"ei-viewer-page\">...</div>"]
  },
  "forcePaperSize": true,
  "paperSize": { "width": 80, "height": 120, "unit": "mm" }
}
```

## 命令协议

命令格式与 `EasyInk.Engine` 保持一致：

```json
{
  "command": "printAsync",
  "id": "request-id",
  "params": {
    "printerName": "HP LaserJet",
    "html": "<h1>Hello</h1>",
    "copies": 1
  }
}
```

支持命令：

| 命令               | 说明                             |
| ------------------ | -------------------------------- |
| `getPrinters`      | 获取 Chromium 可见的系统打印机。 |
| `getPrinterStatus` | 查询单个打印机状态。             |
| `print`            | 同步打印。                       |
| `printAsync`       | 加入异步队列。                   |
| `getJobStatus`     | 查询任务。                       |
| `getAllJobs`       | 查询任务列表。                   |

## HTTP API

默认监听 `127.0.0.1:18081`。

| 方法   | 路径                          | 说明               |
| ------ | ----------------------------- | ------------------ |
| `GET`  | `/api/status`                 | 服务状态。         |
| `GET`  | `/api/status/connections`     | WebSocket 连接数。 |
| `GET`  | `/api/printers`               | 打印机列表。       |
| `GET`  | `/api/printers/{name}/status` | 打印机状态。       |
| `POST` | `/api/print`                  | 同步打印。         |
| `POST` | `/api/print/async`            | 异步打印。         |
| `GET`  | `/api/jobs`                   | 任务列表。         |
| `GET`  | `/api/jobs/{id}`              | 任务状态。         |
| `GET`  | `/api/logs`                   | SQLite 审计日志。  |

`/api/logs` 支持 `startTime`、`endTime`、`printerName`、`userId`、`status`、`limit`、`offset` 查询参数，与 .NET 版日志查询保持一致。

WebSocket 默认挂在 `ws://127.0.0.1:18081/ws`，支持 `print`、`printAsync`、`uploadPdfChunk`、`printUploadedPdf`、`printUploadedPdfAsync`、`getPrinters`、`getPrinterStatus`、`getJobStatus`、`getAllJobs`、`queryLogs`，用于兼容官方打印集成客户端。

## 开发

```bash
pnpm -F @easyink/electron dev
pnpm -F @easyink/electron typecheck
pnpm -F @easyink/electron build
```
