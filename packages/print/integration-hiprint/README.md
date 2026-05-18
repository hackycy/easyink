# @easyink/print-integration-hiprint

Official HiPrint client and managed print SDK.

```ts
import { createHiPrintClient, createHiPrintPrintSdk } from '@easyink/print-integration-hiprint'

const hiPrint = createHiPrintClient()
const printer = createHiPrintPrintSdk({
  client: hiPrint,
  viewer: 'iframe',
})

await printer.print({
  schema,
  data,
  printerName: 'Printer A',
  copies: 1,
})
```

The SDK owns the Viewer render lifecycle. Each `print()` call creates the
configured render surface, opens the schema/data, submits the rendered pages to
HiPrint, and destroys the surface by default. Use `autoDestroy: false` only when
you want to reuse the managed viewer for batch printing, then call
`printer.destroy()` when the batch ends.

`viewer` accepts:

- `iframe`: isolated render document, recommended for browser apps.
- `dom`: render in the current document, mostly useful for tests and controlled
  host pages.

The HiPrint client connection remains application-owned. Call
`hiPrint.disconnect()` when your app no longer wants to keep the HiPrint socket.

## Client API audit

This package intentionally uses only the runtime APIs exposed by
`vue-plugin-hiprint`:

- `hiprint.init()`
- `hiprint.refreshPrinterList(callback)`
- `new hiprint.PrintTemplate()`
- `template.addPrintPanel(options)`
- `panel.addPrintHtml({ options })`
- `template.print2(data, options)`
- `template.on('printSuccess' | 'printError', callback)`
- `hiprint.hiwebSocket.setHost(url, token, callback)`
- `hiprint.hiwebSocket.stop()`
- `hiprint.hiwebSocket.printerList`

`printerName`, `copies`, `orientation`, and `forcePageSize` are EasyInk-level
options. `orientation` is translated to the upstream panel `orient` field
(`1 = portrait`, `2 = landscape`) and to `print2.landscape`.
