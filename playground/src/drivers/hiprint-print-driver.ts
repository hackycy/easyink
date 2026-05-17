import type { PrintDriver } from '@easyink/viewer'
import { createHiPrintDriver as createOfficialHiPrintDriver } from '@easyink/print-integration-hiprint'
import { usePrinter } from '../hooks/useHiPrint'

export function createHiPrintDriver(): PrintDriver {
  const printer = usePrinter()

  return createOfficialHiPrintDriver({
    id: 'hiprint-driver',
    client: printer.client,
    printerName: () => printer.printerDevice.value,
    copies: () => printer.copies.value,
    forcePageSize: () => printer.forcePageSize.value,
  })
}
