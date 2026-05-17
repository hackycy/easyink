# @easyink/print-integration-easyink-printer

Official EasyInk.Printer client and Viewer print driver.

```ts
import { createEasyInkPrinterClient, createEasyInkPrinterDriver } from '@easyink/print-integration-easyink-printer'

const printer = createEasyInkPrinterClient({
  serviceUrl: 'http://localhost:18080',
  reconnect: true,
  maxReconnectAttempts: 3,
  reconnectDelayMs: 500,
  maxReconnectDelayMs: 5000,
})

viewer.registerPrintDriver(createEasyInkPrinterDriver({ client: printer }))

await viewer.open({ schema, data })
await printer.useDefaultPrinter()
await viewer.print({ driverId: 'easyink-printer' })
```

## Client capabilities

- HTTP printer discovery with request timeout handling.
- VueUse `useWebSocket` transport for command submission and job updates.
- Automatic reconnect with configurable maximum attempts, backoff delay, and failure state.
- PDF chunk upload over binary WebSocket frames.
- Async job polling via `printPdfAndWait()` and live `jobStatusChanged` updates.
- Optional `userData` forwarding for audit fields such as `UserId` and `LabelType`.

`connectionState` is one of `idle`, `connecting`, `connected`, `reconnecting`, or `error`. Use `lastError` and `reconnectAttempts` in diagnostics or settings screens.

```ts
const printer = createEasyInkPrinterClient({
  serviceUrl: 'http://localhost:18080',
  apiKey: 'optional-api-key',
  connectTimeoutMs: 5000,
  responseTimeoutMs: 15000,
  reconnect: true,
  maxReconnectAttempts: 5,
  reconnectDelayMs: 500,
  reconnectBackoffMultiplier: 2,
  maxReconnectDelayMs: 5000,
})

await printer.printPdf(pdfBlob, {
  printerName: 'Zebra ZD421',
  userData: {
    userId: 'demo-user-001',
    labelType: 'shipping-label',
  },
})
```
