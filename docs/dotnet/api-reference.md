# API 参考

EasyInk.Printer 同时提供 HTTP 和 WebSocket 两套入口。默认端口是 `18080`。

## 统一响应格式

```json
{
  "id": "request-id",
  "success": true,
  "data": {},
  "errorInfo": null
}
```

这一层统一返回 `PrinterResult` 结构。成功和失败都走同一套外壳，差别主要在 `success` 和 `errorInfo`。

## 常用 HTTP 接口

### 打印机列表

```bash
curl http://localhost:18080/api/printers
```

### 单个打印机状态

```bash
curl http://localhost:18080/api/printers/HP%20LaserJet/status
```

### 同步打印

```bash
curl -X POST http://localhost:18080/api/print \
  -H "Content-Type: application/json" \
  -d '{
    "printerName": "HP LaserJet",
    "pdfBase64": "JVBERi0xLjQK...",
    "copies": 1
  }'
```

### 异步打印

```bash
curl -X POST http://localhost:18080/api/print/async \
  -H "Content-Type: application/json" \
  -d '{
    "printerName": "HP LaserJet",
    "pdfBase64": "JVBERi0xLjQK..."
  }'
```

### 任务查询

```bash
curl http://localhost:18080/api/jobs
curl http://localhost:18080/api/jobs/550e8400-e29b-41d4-a716-446655440000
```

## `print` 请求输入

当前打印请求里，最核心的字段是：

- `printerName`
- `pdfBase64` / `pdfUrl` / `pdfBytes`
- `renderSource`
- `copies`
- `dpi`
- `paperSize`
- `forcePaperSize`
- `userData`

这里最需要注意的一条规则是：PDF 输入和 `renderSource` 不能同时传。服务端会把它当成参数错误处理。

## `renderSource` 直接打印

如果你不是上传 PDF，而是希望服务端先做 Render，也可以直接提交 render source。

EasyInk schema + data 的例子：

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
    }
  }'
```

HTML 的例子也成立，只要 `renderSource.type` 换成 `html` 并传入 `html` 内容即可。

## WebSocket 场景

当你要做长连接、实时状态或大文件上传时，WebSocket 更合适。

连接地址：

```text
ws://localhost:18080/ws
```

最小命令帧示例：

```json
{
  "command": "getPrinters",
  "id": "uuid-1"
}
```

当前命令集至少包括：

- `print`
- `printAsync`
- `getPrinters`
- `getPrinterStatus`
- `getJobStatus`
- `getAllJobs`
- `queryLogs`
- `uploadPdfChunk`
- `printUploadedPdf`
- `printUploadedPdfAsync`

如果你用的是官方前端集成包，这层协议通常不需要你自己手写。
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
