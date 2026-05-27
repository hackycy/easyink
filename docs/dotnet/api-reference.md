---
description: EasyInk.Printer API 参考：HTTP 和 WebSocket 接口，默认端口 18080，包含 PDF、renderSource、任务、日志和测试打印。
---

# API 参考 {#api-reference}

`EasyInk.Printer` 同时提供 HTTP 和 WebSocket 两套入口。默认端口是 `18080`。

先确认服务状态：

```bash
curl http://localhost:18080/api/status
```

如果配置了 API Key，所有 HTTP 请求都要带 `X-API-Key`。

## 响应格式 {#response}

所有接口统一返回 `PrinterResult`：

```json
{
  "id": "request-id",
  "success": true,
  "data": {},
  "errorInfo": null
}
```

失败时 `success=false`，错误信息在 `errorInfo.code` 和 `errorInfo.message`。

## HTTP 接口 {#http}

常用 HTTP 接口：

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/api/status` | 服务状态、版本、启动时间和内存信息 |
| `GET` | `/api/status/connections` | 当前 WebSocket 连接数 |
| `GET` | `/api/printers` | 打印机列表 |
| `GET` | `/api/printers/{name}/status` | 单个打印机状态，`name` 需要 URL 编码 |
| `POST` | `/api/print` | 同步打印 |
| `POST` | `/api/print/async` | 异步打印，返回 `jobId` |
| `POST` | `/api/test` | 打印测试页 |
| `GET` | `/api/jobs` | 所有任务 |
| `GET` | `/api/jobs/{id}` | 单个任务状态 |
| `GET` | `/api/logs` | 查询审计日志 |

打印机列表：

```bash
curl http://localhost:18080/api/printers
```

单个打印机状态：

```bash
curl http://localhost:18080/api/printers/HP%20LaserJet/status
```

## PDF 打印 {#pdf-print}

同步打印 PDF：

```bash
curl -X POST http://localhost:18080/api/print \
  -H "Content-Type: application/json" \
  -d '{
    "printerName": "HP LaserJet",
    "pdfBase64": "JVBERi0xLjQK...",
    "copies": 1
  }'
```

异步打印 PDF：

```bash
curl -X POST http://localhost:18080/api/print/async \
  -H "Content-Type: application/json" \
  -d '{
    "printerName": "HP LaserJet",
    "pdfBase64": "JVBERi0xLjQK..."
  }'
```

支持的 PDF 来源是：

- `pdfBase64`
- `pdfUrl`
- `pdfBytes`

HTTP JSON 最常用的是 `pdfBase64` 和 `pdfUrl`。二进制 `pdfBytes` 通常通过 `multipart/form-data` 或 WebSocket 二进制消息进入。

## Multipart PDF {#multipart}

HTTP 打印接口也支持 multipart。字段名是 `params` 和 `pdf`：

```bash
curl -X POST http://localhost:18080/api/print/async \
  -F 'params={"printerName":"HP LaserJet","copies":1};type=application/json' \
  -F 'pdf=@invoice.pdf;type=application/pdf'
```

HTTP 请求体总上限是 10 MB。更大的 PDF 建议走官方前端客户端，它会通过 WebSocket 分片上传。

## renderSource 打印 {#render-source}

启用 Printer-side Render 后，可以直接提交 EasyInk schema：

```bash
curl -X POST http://localhost:18080/api/print/async \
  -H "Content-Type: application/json" \
  -d '{
    "printerName": "HP LaserJet",
    "renderSource": {
      "type": "easyink",
      "schema": {
        "version": "1.0.0",
        "unit": "mm",
        "page": { "mode": "fixed", "width": 80, "height": 120 },
        "guides": { "x": [], "y": [] },
        "elements": []
      },
      "data": {
        "receipt": { "no": "R-001" }
      }
    },
    "renderOptions": {
      "pdf": { "printBackground": true },
      "wait": { "until": "easyinkReady", "timeoutMs": 5000 }
    }
  }'
```

HTML 输入也走同一字段，只是 `renderSource.type` 改成 `html`：

```json
{
  "printerName": "HP LaserJet",
  "renderSource": {
    "type": "html",
    "html": "<!doctype html><html><body><main class=\"ready\">Hello</main></body></html>"
  },
  "renderOptions": {
    "wait": { "selector": ".ready" }
  }
}
```

`renderSource` 支持 `resources` 和 `fonts`，字段和 Render 协议一致：`url`、`contentType`、`base64`，字体额外支持 `family`、`weight`、`style`。

:::warning 注意
PDF 输入和 `renderSource` 不能同时传。服务端会返回 `INVALID_PARAMS`。
:::

## 打印参数 {#print-params}

打印请求常用字段：

| 字段 | 说明 |
| --- | --- |
| `printerName` | 目标打印机名称 |
| `pdfBase64` / `pdfUrl` / `pdfBytes` | PDF 输入 |
| `renderSource` | HTML 或 EasyInk 输入 |
| `renderOptions` | Render 的 `pdf`、`wait`、`security`、`diagnostics` 选项 |
| `copies` | 打印份数，默认 `1` |
| `dpi` | PDFium/GDI 渲染 DPI，默认 `600` |
| `paperSize` | `{ width, height, unit }`，`unit` 为 `mm` 或 `inch` |
| `forcePaperSize` | 是否强制把 `paperSize` 传给底层打印设置 |
| `landscape` | 是否横向打印 |
| `offset` | `{ x, y, unit }` |
| `userData` | 审计字段，当前包含 `userId`、`documentType` |

`forcePaperSize` 默认是 `false`。只有设备必须按模板尺寸输出，否则会缩放或错位时，再打开它。

## 任务查询 {#jobs}

异步打印会返回 `jobId`。拿到后这样查：

```bash
curl http://localhost:18080/api/jobs
curl http://localhost:18080/api/jobs/550e8400-e29b-41d4-a716-446655440000
```

任务状态来自 Engine 队列，常见值是 `Queued`、`Printing`、`Completed`、`Failed`。

## 测试打印 {#test-printer}

Printer 提供测试页接口：

```bash
curl -X POST http://localhost:18080/api/test \
  -H "Content-Type: application/json" \
  -d '{
    "printerName": "HP LaserJet",
    "level": "quick"
  }'
```

`level` 不传时默认是 `quick`。这个接口会走 Engine 的 `TestPrinter()`，并把本机环境、端口、打印路径等元数据写进测试结果。

## WebSocket {#websocket}

连接地址：

```text
ws://localhost:18080/ws
```

带 API Key 时：

```text
ws://localhost:18080/ws?apiKey=your-secret-key
```

最小命令帧：

```json
{
  "command": "getPrinters",
  "id": "uuid-1"
}
```

带参数的异步打印：

```json
{
  "command": "printAsync",
  "id": "uuid-2",
  "params": {
    "printerName": "HP LaserJet",
    "pdfBase64": "JVBERi0xLjQK..."
  }
}
```

当前 WebSocket 命令包括：

- `print`
- `printAsync`
- `uploadPdfChunk`
- `printUploadedPdf`
- `printUploadedPdfAsync`
- `getPrinters`
- `getPrinterStatus`
- `getJobStatus`
- `getAllJobs`
- `queryLogs`
- `testPrinter`

WebSocket 完整消息上限是 60 MB。分片上传时，单片上限是 2 MB，总 PDF 上限是 50 MB，上传会话 10 分钟过期。

## WebSocket 分片上传 {#chunk-upload}

官方前端客户端的 `printPdf()` 用的就是这条路径。流程是：

```text
uploadPdfChunk * n -> printUploadedPdfAsync -> getJobStatus
```

每个 `uploadPdfChunk` 命令都带这些参数：

```json
{
  "uploadId": "upload-1",
  "chunkIndex": 0,
  "totalChunks": 3,
  "totalBytes": 3145728
}
```

二进制消息格式是：

```text
4 字节大端 metadata 长度 + metadata JSON + PDF bytes
```

如果你使用 `@easyink/print-integration-easyink-printer`，这层协议通常不需要手写。

## 认证 {#auth}

HTTP：

```bash
curl -H "X-API-Key: your-secret-key" http://localhost:18080/api/printers
```

WebSocket：

```text
ws://localhost:18080/ws?apiKey=your-secret-key
```

没有配置 API Key 时，这两处都不需要传。

## 错误码 {#error-codes}

当前常见错误码：

| 错误码 | 说明 |
| --- | --- |
| `INVALID_PARAMS` | 参数缺失或格式错误 |
| `INVALID_JSON` | JSON 解析失败 |
| `UNKNOWN_COMMAND` | 未知命令 |
| `JOB_NOT_FOUND` | 任务不存在 |
| `QUEUE_FULL` | 队列已满 |
| `PRINT_FAILED` | 打印失败 |
| `PRINT_TIMEOUT` | 打印超时 |
| `RENDER_FAILED` | Render 未启用、未配置或渲染失败 |
| `PRINT_TEST_FAILED` | 测试打印失败 |
| `INVALID_PDF_SOURCE` | PDF 来源无效 |
| `CHUNK_TOO_LARGE` | PDF 分块过大 |
| `PDF_TOO_LARGE` | PDF 文件过大 |
| `INVALID_CHUNK` | 分块索引或元数据无效 |
| `UPLOAD_NOT_FOUND` | 分块上传会话不存在或已过期 |
| `UPLOAD_INCOMPLETE` | 分块上传未完成 |
| `MESSAGE_TOO_LARGE` | WebSocket 消息过大 |
| `INVALID_MESSAGE` | WebSocket 消息格式无效 |
| `INTERNAL_ERROR` | 内部错误 |
| `UNAUTHORIZED` | 认证失败 |
| `NOT_FOUND` | 接口不存在 |

关于 API，目前停在这里就够用了。应用侧优先使用官方前端包；只有你要跨语言接入或调试协议时，再手写这些请求。
