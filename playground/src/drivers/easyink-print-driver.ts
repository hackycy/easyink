import type { PrintDriver } from '@easyink/viewer'
import { createEasyInkPrinterDriver as createOfficialEasyInkPrinterDriver } from '@easyink/print-integration-easyink-printer'
import { useEasyInkPrint } from '../hooks/useEasyInkPrint'

export function createEasyInkPrintDriver(): PrintDriver {
  const service = useEasyInkPrint()

  return createOfficialEasyInkPrinterDriver({
    id: 'easyink-print-driver',
    client: service.client,
    printerName: () => service.printerName.value,
    copies: () => service.copies.value,
    forcePageSize: () => service.forcePageSize.value,
    resolveRequestOptions: () => ({
      userData: service.userData.value ? { ...service.userData.value } : undefined,
    }),
  })
}
