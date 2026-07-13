import type { ViewerPrintPolicy } from './types'
import type { ViewerHost } from './viewer-host'

export function runPrintWithIsolation(host: ViewerHost, printPolicy: ViewerPrintPolicy): void {
  const container = host.mount
  const doc = container.ownerDocument
  const ancestors: HTMLElement[] = []
  let removeStyle: (() => void) | undefined

  try {
    let el: HTMLElement | null = container.parentElement
    while (el) {
      el.setAttribute('data-ei-print-ancestor', '')
      ancestors.push(el)
      if (el === doc.body)
        break
      el = el.parentElement
    }
    container.setAttribute('data-ei-printing', '')

    removeStyle = host.appendStyle(buildPrintStyles(printPolicy))

    host.print()
  }
  finally {
    removeStyle?.()
    container.removeAttribute('data-ei-printing')
    for (const ancestor of ancestors) {
      ancestor.removeAttribute('data-ei-print-ancestor')
    }
  }
}

export function buildPrintStyles(printPolicy: ViewerPrintPolicy): string {
  const pageSizeCSS = printPolicy.pageSizeMode === 'driver'
    ? (printPolicy.orientation === 'auto' ? '' : `    size: ${printPolicy.orientation};\n`)
    : `    size: ${printPolicy.sheetSize!.width}${printPolicy.sheetSize!.unit} ${printPolicy.sheetSize!.height}${printPolicy.sheetSize!.unit};\n`
  const offset = printPolicy.offset
  const offsetCSS = (offset.horizontal !== 0 || offset.vertical !== 0)
    ? `transform: translate(${offset.horizontal}${offset.unit}, ${offset.vertical}${offset.unit}) !important;`
    : ''

  return `@media print {
  @page {
${pageSizeCSS}    margin: 0;
  }
  [data-ei-print-ancestor] {
    display: block !important;
    position: static !important;
    overflow: visible !important;
    visibility: visible !important;
    margin: 0 !important;
    padding: 0 !important;
    border: none !important;
    background: none !important;
    width: auto !important;
    height: auto !important;
    min-height: 0 !important;
    max-height: none !important;
    box-shadow: none !important;
    opacity: 1 !important;
    transform: none !important;
    z-index: auto !important;
    inset: auto !important;
    flex: none !important;
  }
  [data-ei-print-ancestor] > *:not([data-ei-print-ancestor]):not([data-ei-printing]) {
    display: none !important;
  }
  [data-ei-printing] {
    display: block !important;
    position: static !important;
    overflow: visible !important;
    padding: 0 !important;
    margin: 0 !important;
    width: auto !important;
    height: auto !important;
    min-height: 0 !important;
    background: none !important;
    border: none !important;
    box-shadow: none !important;
  }
  .ei-viewer-page-zoom {
    width: auto !important;
    height: auto !important;
    overflow: visible !important;
  }
  .ei-viewer-page-slot {
    width: auto !important;
    height: auto !important;
    margin: 0 !important;
  }
  .ei-viewer-page {
    box-shadow: none !important;
    margin: 0 !important;
    transform: none !important;
    break-after: ${printPolicy.pageBreakBehavior.after};
    break-inside: ${printPolicy.pageBreakBehavior.inside};
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
    ${offsetCSS}
  }
  .ei-viewer-page-slot:last-child .ei-viewer-page {
    break-after: auto;
  }
}`
}
