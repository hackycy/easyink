# API 参考

EasyInk.Printer 提供 HTTP 和 WebSocket 两种通信方式，默认端口 `18080`。

## 基础约定

- 基地址：`http://localhost:18080/api/`
- 响应格式统一为 `PrinterResult`：

```json
{
  "id": "请求ID",
  "success": true,
  "data": {},
  "errorInfo": null
}
```

错误时 `success` 为 `false`，`errorInfo` 包含 `code` 和 `message`。

## HTTP API

### 打印机

#### GET /api/printers

获取所有打印机。

```bash
curl http://localhost:18080/api/printers
```

响应 `data` 结构：

```json
{
  "printers": [
    {
      "name": "HP LaserJet Pro",
      "isDefault": true,
      "status": {
        "isReady": true,
        "statusCode": "READY",
        "message": "打印机就绪",
        "isOnline": true,
        "hasPaper": true,
        "isPaperJam": false,
        "printerState": "0"
      },
      "supportedPaperSizes": [
        { "name": "A4", "width": 826, "height": 1169 }
      ]
    }
  ]
}
```

#### GET /api/printers/{name}/status

获取指定打印机状态。

```bash
curl http://localhost:18080/api/printers/HP%20LaserJet/status
```

响应 `data` 结构：

```json
{
  "isReady": true,
  "statusCode": "READY",
  "message": "打印机就绪",
  "isOnline": true,
  "hasPaper": true,
  "isPaperJam": false,
  "printerState": "0"
}
```

状态码：`READY` / `PRINTER_OFFLINE` / `PAPER_JAM` / `PAPER_OUT` / `PRINTER_STOPPED` / `PRINTER_ERROR` / `PRINTER_NOT_FOUND` / `WMI_UNAVAILABLE`

### 打印

#### POST /api/print

同步打印，等待完成后返回结果。

**JSON 方式（Base64 / URL）：**

```bash
curl -X POST http://localhost:18080/api/print \
  -H "Content-Type: application/json" \
  -d '{
    "printerName": "HP LaserJet",
    "pdfBase64": "JVBERi0xLjQK...",
    "copies": 1,
    "landscape": false,
    "dpi": 600
  }'
```

**Multipart 方式（二进制 PDF）：**

```bash
curl -X POST http://localhost:18080/api/print \
  -F 'params={"printerName":"HP LaserJet","copies":1}' \
  -F 'pdf=@document.pdf'
```

**Render 方式（EasyInk schema + data）：**

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

**Render 方式（HTML）：**

```bash
curl -X POST http://localhost:18080/api/print/async \
  -H "Content-Type: application/json" \
  -d '{
    "printerName": "HP LaserJet",
    "paperSize": { "width": 80, "height": 120, "unit": "mm" },
    "renderSource": {
      "type": "html",
      "html": "<!doctype html><html><body><main class=\"easyink-ready\">Hello</main></body></html>"
    },
    "renderOptions": {
      "pdf": {
        "printBackground": true,
        "marginMm": { "top": 0, "right": 0, "bottom": 0, "left": 0 }
      },
      "wait": { "selector": ".easyink-ready" }
    }
  }'
```

参数：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `printerName` | string | 是 | 打印机名称 |
| `pdfBase64` | string | 四选一 | Base64 编码的 PDF |
| `pdfUrl` | string | 四选一 | 远程 PDF URL |
| `pdfBytes` | binary | 四选一 | 二进制 PDF（multipart） |
| `renderSource` | object | 四选一 | Render 输入，支持 `{type:"easyink", schema, data}` 或 `{type:"html", html}` |
| `renderOptions` | object | 否 | Render 选项，包含 `pdf`、`wait`、`security`、`diagnostics` |
| `copies` | int | 否 | 份数，默认 1 |
| `landscape` | bool | 否 | 横向打印 |
| `dpi` | int | 否 | 分辨率，默认 600 |
| `paperSize` | object | 否 | PDF/模板纸张尺寸 `{width, height, unit}`；默认使用 PDF 原生尺寸 |
| `forcePaperSize` | bool | 否 | 是否强制把 `paperSize` 作为驱动纸张参数，默认 `false` |
| `offset` | object | 否 | 打印偏移 `{x, y}` |
| `userData` | object | 否 | 用户数据，用于审计日志 `{userId, documentType}` |

热敏小票机、连续纸默认保持 `forcePaperSize=false`，由驱动使用当前介质尺寸；只有设备必须显式指定尺寸时再开启。

`renderSource` 会先由 EasyInk.Printer 内置的 Render 运行时转换成 PDF，再进入和 PDF 打印相同的物理打印链路。不要在同一个请求里同时传 `pdfBase64` / `pdfUrl` / `pdfBytes` 和 `renderSource`，服务端会按参数错误处理。

`renderOptions.pdf.paperWidthMm` / `paperHeightMm` 未提供时，Printer 会用顶层 `paperSize` 补齐；顶层 `landscape=true` 也会补到 `renderOptions.pdf.landscape`。HTML 打印通常建议提供 `wait.selector` 或 `wait.until`，让浏览器渲染完成后再生成 PDF。

#### POST /api/print/async

异步打印，立即返回 jobId。

```bash
curl -X POST http://localhost:18080/api/print/async \
  -H "Content-Type: application/json" \
  -d '{"printerName":"HP LaserJet","pdfBase64":"..."}'
```

响应 `data`：

```json
{ "jobId": "550e8400-e29b-41d4-a716-446655440000" }
```

### 任务

#### GET /api/jobs

获取所有任务。

```bash
curl http://localhost:18080/api/jobs
```

#### GET /api/jobs/{id}

查询指定任务状态。

```bash
curl http://localhost:18080/api/jobs/550e8400-...
```

响应 `data`：

```json
{
  "jobId": "550e8400-...",
  "printerName": "HP LaserJet",
  "status": "Completed",
  "createdAt": "2025-01-01T00:00:00Z",
  "startedAt": "2025-01-01T00:00:00Z",
  "completedAt": "2025-01-01T00:00:01Z",
  "errorMessage": null,
  "result": { "id": "...", "success": true, "data": null, "errorInfo": null }
}
```

任务状态：`Queued` / `Printing` / `Completed` / `Failed`

### 审计日志

#### GET /api/logs

查询审计日志，支持筛选。

```bash
curl "http://localhost:18080/api/logs?printerName=HP&status=completed&startTime=2025-01-01&endTime=2025-12-31&userId=user1&limit=50&offset=0"
```

参数：

| 字段 | 说明 |
|------|------|
| `printerName` | 按打印机名筛选（模糊匹配） |
| `status` | 按状态筛选 |
| `startTime` | 开始时间（ISO 8601） |
| `endTime` | 结束时间（ISO 8601） |
| `userId` | 按用户 ID 筛选 |
| `limit` | 返回条数上限，默认 100 |
| `offset` | 偏移量，默认 0 |

### 服务状态

#### GET /api/status

服务运行状态，包含版本、运行时间、内存使用。

```bash
curl http://localhost:18080/api/status
```

#### GET /api/status/connections

返回当前 WebSocket 连接数。

```bash
curl http://localhost:18080/api/status/connections
```

响应 `data` 结构：

```json
{ "count": 1 }
```

## WebSocket

连接地址：`ws://localhost:18080/ws`

### 文本帧（JSON 命令）

```json
{
  "command": "print",
  "id": "uuid-1",
  "params": {
    "printerName": "HP LaserJet",
    "pdfBase64": "JVBERi0xLjQK...",
    "copies": 1
  }
}
```

### 二进制帧（大 PDF 上传）

```
┌────────────────┬─────────────────┬─────────────────┐
│ 4 字节 (uint32) │ N 字节 (JSON)    │ 剩余 (PDF 二进制) │
│ 元数据长度 N     │ 元数据           │ PDF 数据         │
└────────────────┴─────────────────┴─────────────────┘
```

### 分块上传

大 PDF（最大 50 MB）可通过分块上传：

1. 将 PDF 切分为不超过 2 MB 的块
2. 逐块发送 `uploadPdfChunk` 命令
3. 最后发送 `printUploadedPdf` 或 `printUploadedPdfAsync` 触发打印

官方 `@easyink/print-integration-easyink-printer` 前端客户端按 1 MB 切块上传，低于服务端 2 MB 上限。

### 支持的命令

| 命令 | 说明 |
|------|------|
| `print` | 同步打印 |
| `printAsync` | 异步打印 |
| `getPrinters` | 获取打印机列表 |
| `getPrinterStatus` | 获取打印机状态 |
| `getJobStatus` | 查询任务状态 |
| `getAllJobs` | 获取所有任务 |
| `queryLogs` | 查询审计日志 |
| `uploadPdfChunk` | 分块上传 PDF |
| `printUploadedPdf` | 打印已上传的 PDF |
| `printUploadedPdfAsync` | 异步打印已上传的 PDF |

### 前端示例

```ts
const ws = new WebSocket('ws://localhost:18080/ws')

ws.onopen = () => {
  // 获取打印机列表
  ws.send(JSON.stringify({
    command: 'getPrinters',
    id: crypto.randomUUID(),
  }))
}

ws.onmessage = (event) => {
  const result = JSON.parse(event.data)
  if (result.success) {
    console.log(result.data)
  }
}

// 打印
function print(printerName: string, pdfBase64: string) {
  ws.send(JSON.stringify({
    command: 'print',
    id: crypto.randomUUID(),
    params: { printerName, pdfBase64, copies: 1 },
  }))
}
```

## 认证

设置 API Key 后，所有请求需携带 `X-API-Key` 头：

```bash
curl -H "X-API-Key: your-secret-key" http://localhost:18080/api/printers
```

WebSocket 连接时通过 URL 参数传递：

```
ws://localhost:18080/ws?apiKey=your-secret-key
```

## 错误码

| 错误码 | 说明 |
|--------|------|
| `INVALID_PARAMS` | 参数缺失或格式错误 |
| `INVALID_JSON` | JSON 解析失败 |
| `UNKNOWN_COMMAND` | 未知命令 |
| `JOB_NOT_FOUND` | 任务不存在 |
| `QUEUE_FULL` | 队列已满 |
| `PRINT_FAILED` | 打印失败 |
| `PRINT_TIMEOUT` | 打印超时 |
| `INVALID_PDF_SOURCE` | PDF 来源无效 |
| `CHUNK_TOO_LARGE` | PDF 分块过大（超过 2 MB） |
| `PDF_TOO_LARGE` | PDF 文件过大（超过 50 MB） |
| `INVALID_CHUNK` | 分块索引或元数据无效 |
| `UPLOAD_NOT_FOUND` | 分块上传会话不存在或已过期（10 分钟 TTL） |
| `UPLOAD_INCOMPLETE` | 分块上传未完成 |
| `MESSAGE_TOO_LARGE` | WebSocket 消息过大 |
| `INVALID_MESSAGE` | WebSocket 消息格式无效 |
| `INTERNAL_ERROR` | 内部错误 |
| `UNAUTHORIZED` | 认证失败 |
| `NOT_FOUND` | 接口不存在 |
