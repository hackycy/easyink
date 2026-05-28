# @easyink/render-api-service

Internal h3-based Node HTTP facade for `EasyInk.Render`.

`EasyInk.Render` stays CLI/IPC-first. This package starts a small local h3 service that receives HTTP JSON requests, writes a temporary Render request file, calls `easyink-render render --json`, then returns either PDF bytes or JSON with `pdfBase64`.

## Start

```bash
pnpm -F @easyink/render-api-service build
pnpm -F @easyink/render-api-service start
```

Configuration can come from shell environment variables or dotenv files in the current working directory. For local development, copy `.env.sample` to `.env.local` and adjust values as needed.

When `EASYINK_RENDER_BIN` is not set, the service first looks for the current
platform binary produced by the Render host build, for example:

```text
lib/EasyInk.Render/releases/host/<version>/<platform>/easyink-render
```

So the usual local flow is:

```bash
./lib/EasyInk.Render/build-host.sh darwin-arm64
pnpm -F @easyink/render-api-service build
pnpm -F @easyink/render-api-service start
```

Development:

```bash
pnpm -F @easyink/render-api-service dev
```

## Docker

The package includes a full Docker image for the HTTP service, the Go
`easyink-render` CLI, and a runnable Debian Chromium. The Docker build runs the
same chain the CLI needs in production: build the embedded viewer runtime, build
the Render host binary, build the API service, then deploy the Node package.

```bash
docker compose -f internal-packages/render-api-service/docker-compose.yml up --build
```

The service listens on `http://127.0.0.1:18081` by default:

```bash
curl http://127.0.0.1:18081/health
curl -X POST http://127.0.0.1:18081/v1/render/browser/inspect \
  -H 'content-type: application/json' \
  -d '{}'
```

Docker defaults are tuned for Chromium in a container:

- `EASYINK_RENDER_API_HOST=0.0.0.0`
- `EASYINK_RENDER_BIN=/usr/local/bin/easyink-render`
- `EASYINK_RENDER_NO_DAEMON=true`
- `EASYINK_RENDER_BROWSER_KIND=chromium`
- `EASYINK_RENDER_BROWSER_PATH=/usr/bin/chromium`
- `EASYINK_RENDER_DISABLE_SANDBOX=true`

When `noDaemon` is enabled and no explicit profile root is provided, the API
service gives each render request an isolated temporary Chromium profile to avoid
profile singleton lock conflicts between requests. The compose volume keeps
Render diagnostics logs. Set environment variables before `docker compose up` to
override port, CORS, timeouts, queue size, daemon usage, or request work-dir
retention.

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

The service loads dotenv files with this precedence, from lowest to highest: `.env`, `.env.local`, `.env.${NODE_ENV}`, `.env.${NODE_ENV}.local`, then real shell environment variables. Real `.env` files are ignored by git; `.env.sample` documents safe defaults.

- `EASYINK_RENDER_API_HOST`: listen host, default `127.0.0.1`.
- `EASYINK_RENDER_API_PORT`: listen port, default `18081`.
- `EASYINK_RENDER_BIN`: Render CLI path. Explicit value wins; otherwise the service tries the local Render release output, then falls back to `easyink-render`.
- `EASYINK_RENDER_API_WORK_DIR`: temporary request/output root, default OS temp dir.
- `EASYINK_RENDER_API_KEEP_WORK_DIR`: keep per-request temp files for debugging. Accepts `1`, `true`, `yes`, or `on`.
- `EASYINK_RENDER_API_CLI_TIMEOUT_MS`: child process timeout, default `120000`.
- `EASYINK_RENDER_API_MAX_BODY_BYTES`: max HTTP JSON body size, default `67108864`.
- `EASYINK_RENDER_API_CORS_ORIGIN`: browser CORS origin for playground/demo calls, default `*`.

Default Render runtime can also be configured by environment. Per-request `runtime` still wins for that request.

- `EASYINK_RENDER_NO_DAEMON`
- `EASYINK_RENDER_FORCE_RESTART_DAEMON`
- `EASYINK_RENDER_DISABLE_SANDBOX`
- `EASYINK_RENDER_BROWSER_KIND`
- `EASYINK_RENDER_BROWSER_PATH`
- `EASYINK_RENDER_HEADLESS_MODE`
- `EASYINK_RENDER_PROFILE_ROOT`
- `EASYINK_RENDER_TEMP_DIR`
- `EASYINK_RENDER_LOG_DIR`
- `EASYINK_RENDER_MAX_CONCURRENCY`
- `EASYINK_RENDER_MAX_QUEUE_SIZE`
- `EASYINK_RENDER_REQUEST_TIMEOUT_MS`
- `EASYINK_RENDER_IDLE_TIMEOUT_MS`

Invalid numeric or boolean environment values fail at startup instead of being silently coerced.

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
- `runtime`: per-call CLI flag overrides such as `noDaemon`, `disableSandbox`, `browserKind`, `browserPath`, `logDir`, `requestTimeoutMs`.

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
    "disableSandbox": false,
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

const service = createRenderApiServer()

await service.listen()
```

Set `EASYINK_RENDER_BIN`, `EASYINK_RENDER_API_PORT`, and other environment variables before creating the service.

## Boundary

The Node service does not embed browser or render logic. It is intentionally a process facade over the Render CLI so the Go host keeps owning daemon reuse, browser configuration, protocol validation, security checks, diagnostics, and PDF generation.
