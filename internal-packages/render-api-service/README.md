# @easyink/render-api-service

Internal Node HTTP facade for `EasyInk.Render`.

`EasyInk.Render` stays CLI/IPC-first. This package starts a small local Node service that receives HTTP JSON requests, writes a temporary Render request file, calls `easyink-render render --json`, then returns either PDF bytes or JSON with `pdfBase64`.

## Start

```bash
pnpm -F @easyink/render-api-service build
EASYINK_RENDER_BIN=/path/to/easyink-render pnpm -F @easyink/render-api-service start
```

Development:

```bash
EASYINK_RENDER_BIN=lib/EasyInk.Render/host/easyink-render pnpm -F @easyink/render-api-service dev
```

## Render Smoke Test

The Docker smoke test imports `@easyink/samples`, builds a request from
`supermarketReceiptTemplate` and `supermarketDemoData`, compiles the Linux
Render host in `golang:1.23-bookworm`, then renders the receipt in
`chromedp/headless-shell:latest`.

```bash
pnpm -F @easyink/render-api-service test:render-smoke
```

The generated PDF and diagnostics are written to:

```text
temp/easyink-render-supermarket-smoke/output/supermarket-receipt.pdf
temp/easyink-render-supermarket-smoke/supermarket-diagnostics.json
```

Environment:

- `EASYINK_RENDER_API_HOST`: listen host, default `127.0.0.1`.
- `EASYINK_RENDER_API_PORT`: listen port, default `18081`.
- `EASYINK_RENDER_BIN`: Render CLI path, default `easyink-render`.
- `EASYINK_RENDER_API_WORK_DIR`: temporary request/output root, default OS temp dir.
- `EASYINK_RENDER_API_KEEP_WORK_DIR=1`: keep per-request temp files for debugging.
- `EASYINK_RENDER_API_CLI_TIMEOUT_MS`: child process timeout, default `120000`.

## API Shape

### `GET /health`

Lightweight service health check. Does not invoke Render CLI.

```json
{
  "ok": true,
  "service": "easyink-render-api",
  "uptimeMs": 1024
}
```

### `GET /v1/render/version`

Calls:

```bash
easyink-render version
```

Response:

```json
{
  "success": true,
  "version": "easyink-render 0.1.0 protocol=1.0"
}
```

### `POST /v1/render/pdf`

Renders HTML, EasyInk schema, or existing PDF input through the Render CLI.

Request body is the existing Render `PrintPDFRequest` plus two API-only fields:

- `response`: HTTP response controls. `type` is `base64Json` or `pdf`; `includeDiagnostics` embeds parsed diagnostics JSON when JSON output is used.
- `runtime`: per-call CLI flag overrides such as `noDaemon`, `browserKind`, `browserPath`, `logDir`, `requestTimeoutMs`.

`response` and `runtime` are stripped before the JSON is passed to `easyink-render`, because the Go CLI rejects unknown request fields.

Default response type is `base64Json`, unless `Accept: application/pdf` is sent.

```json
{
  "requestId": "html-001",
  "source": {
    "type": "html",
    "html": "<!doctype html><html><body><main class=\"ready\">Hello</main></body></html>"
  },
  "wait": {
    "selector": ".ready",
    "timeoutMs": 5000
  },
  "pdf": {
    "printBackground": true
  },
  "response": {
    "type": "base64Json",
    "includeDiagnostics": true
  },
  "runtime": {
    "noDaemon": false,
    "requestTimeoutMs": 30000
  }
}
```

JSON success:

```json
{
  "success": true,
  "requestId": "html-001",
  "pageCount": 1,
  "diagnosticsPath": "/Users/me/.local/state/easyink-render/diagnostics/html-001/diagnostics.json",
  "pdfBase64": "JVBERi0x..."
}
```

PDF success:

- Status `200`
- `Content-Type: application/pdf`
- `X-EasyInk-Request-Id`
- `X-EasyInk-Page-Count`
- `X-EasyInk-Diagnostics-Path`

Failure:

```json
{
  "success": false,
  "requestId": "html-001",
  "diagnosticsPath": "/path/to/diagnostics.json",
  "error": {
    "code": "RENDER_TIMEOUT",
    "message": "Render timeout after 5000ms",
    "exitCode": 8,
    "stderr": "optional child-process stderr"
  }
}
```

HTTP status mapping:

- `400`: invalid JSON or body too large.
- `422`: Render request/security/PDF validation failed.
- `502`: Render CLI unavailable, daemon unavailable, browser unavailable, or render failed.
- `504`: Render timeout.

### Daemon Management

These endpoints forward directly to the CLI and return `{ "success": boolean, "data": unknown, "stderr"?: string }`.

- `GET /v1/render/daemon/status`
- `POST /v1/render/daemon/start`
- `POST /v1/render/daemon/stop`
- `POST /v1/render/daemon/restart`

### `POST /v1/render/browser/inspect`

Calls `easyink-render browser inspect`. Optional body:

```json
{
  "runtime": {
    "browserKind": "headless-shell",
    "browserPath": "/path/to/headless-shell"
  }
}
```

### `GET /v1/render/diagnostics/:pathOrId`

Calls:

```bash
easyink-render diagnostics show <path-or-id>
```

Use this to load a diagnostics id returned by Render, or a URL-encoded diagnostics file path.

## TypeScript Usage

```ts
import { createRenderApiServer } from '@easyink/render-api-service'

const service = createRenderApiServer({
  binary: '/path/to/easyink-render',
  port: 18081,
})

await service.listen()
```

## Boundary

The Node service does not embed browser or render logic. It is intentionally a process facade over the Render CLI so the Go host keeps owning daemon reuse, browser configuration, protocol validation, security checks, diagnostics, and PDF generation.
