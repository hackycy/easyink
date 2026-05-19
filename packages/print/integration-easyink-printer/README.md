# @easyink/print-integration-easyink-printer

Official EasyInk Printer client and managed document printer.

```ts
import {
  createEasyInkPrinter,
  createEasyInkPrinterClient,
} from '@easyink/print-integration-easyink-printer'

const client = createEasyInkPrinterClient({
  serviceUrl: 'http://localhost:18080',
  reconnect: true,
})

const printer = createEasyInkPrinter({
  client,
  viewer: 'iframe',
})

await printer.print({
  schema,
  data,
  printerName: 'Zebra ZD421',
  copies: 1,
  forcePageSize: true,
  requestOptions: {
    userData: {
      userId: 'demo-user-001',
      labelType: 'shipping-label',
    },
  },
})
```

The printer owns the Viewer render lifecycle and PDF pipeline. Each `print()` call
creates the configured render surface, opens the schema/data, renders Viewer
pages to PDF, uploads the PDF through EasyInk Printer, waits for completion by
default, and destroys the render surface.

`viewer` accepts:

- `iframe`: isolated render document, recommended for browser apps.
- `dom`: render in the current document, mostly useful for tests and controlled
  host pages.

The client connection remains application-owned. Call `client.disconnect()` when
your app no longer wants to keep the WebSocket open.

## Client capabilities

- HTTP printer discovery with request timeout handling.
- VueUse `useWebSocket` transport for command submission and job updates.
- Automatic reconnect with configurable maximum attempts, backoff delay, and failure state.
- PDF chunk upload over binary WebSocket frames.
- Async job polling via `printPdfAndWait()` and live `jobStatusChanged` updates.
- Optional `userData` forwarding for audit fields such as `UserId` and `LabelType`.
