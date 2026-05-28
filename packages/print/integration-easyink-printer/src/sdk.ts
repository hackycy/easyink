import type { ManagedPrintViewer, ManagedPrintViewerOptions } from '@easyink/print-core'
import type { DocumentSchema, ViewerTaskCallbacks } from '@easyink/viewer'
import type { EasyInkPrinterClient, EasyInkPrinterClientOptions, EasyInkPrinterPaperSize, EasyInkPrinterPrintHtmlOptions, EasyInkPrinterUserData } from './client'
import type { EasyInkPrinterDriverPrintOptions, EasyInkPrinterDriverSubmitMode } from './driver'
import { createManagedPrintViewer } from '@easyink/print-core'
import { createEasyInkPrinterClient } from './client'
import { createEasyInkPrinterDriver } from './driver'

export type EasyInkPrintStrategy = 'browser-pdf' | 'printer-template' | 'preview-html'

export interface EasyInkPaperSize {
  widthMm: number
  heightMm: number
}

export interface EasyInkPrinterDefaults {
  printerName?: string
  copies?: number
  paper?: 'template' | 'driver' | EasyInkPaperSize
  strategy?: EasyInkPrintStrategy
  waitForCompletion?: boolean
  userData?: EasyInkPrinterUserData
}

export interface EasyInkPrinterOptions extends ManagedPrintViewerOptions {
  client?: EasyInkPrinterClient
  serviceUrl?: string
  apiKey?: string
  clientOptions?: Omit<EasyInkPrinterClientOptions, 'serviceUrl' | 'apiKey' | 'printerName' | 'defaultCopies'>
  printerName?: string
  copies?: number
  defaults?: EasyInkPrinterDefaults
}

export interface EasyInkPrinterPrintInput extends ViewerTaskCallbacks {
  schema: DocumentSchema
  data?: Record<string, unknown>
  printerName?: string
  copies?: number
  paper?: 'template' | 'driver' | EasyInkPaperSize
  strategy?: EasyInkPrintStrategy
  waitForCompletion?: boolean
  userData?: EasyInkPrinterUserData
}

export interface EasyInkPrinterPrintPdfInput {
  pdf: Blob
  printerName?: string
  copies?: number
  waitForCompletion?: boolean
  userData?: EasyInkPrinterUserData
}

export interface EasyInkPrinterPrintHtmlInput {
  html: string
  printerName?: string
  copies?: number
  paper?: 'driver' | EasyInkPaperSize
  waitForCompletion?: boolean
  userData?: EasyInkPrinterUserData
  readySelector?: string
  baseUrl?: string
  fileName?: string
}

export interface EasyInkPrinter {
  readonly client: EasyInkPrinterClient
  readonly viewer: ManagedPrintViewer
  ready: () => Promise<void>
  print: (input: EasyInkPrinterPrintInput) => Promise<void>
  printPdf: (input: EasyInkPrinterPrintPdfInput) => Promise<void>
  printHtml: (input: EasyInkPrinterPrintHtmlInput) => Promise<void>
  destroy: () => void
}

/**
 * Creates the high-level EasyInk Printer facade. The printer owns Viewer rendering,
 * PDF generation, upload, and optional job completion waiting.
 */
export function createEasyInkPrinter(options: EasyInkPrinterOptions): EasyInkPrinter {
  const viewer = createManagedPrintViewer(options)
  const client = options.client ?? createEasyInkPrinterClient({
    ...options.clientOptions,
    serviceUrl: options.serviceUrl,
    apiKey: options.apiKey,
    printerName: options.defaults?.printerName ?? options.printerName,
    defaultCopies: options.defaults?.copies ?? options.copies,
  })

  const printer: EasyInkPrinter = {
    client,
    viewer,
    async ready() {
      await client.connect()
      await client.refreshPrinters()
    },
    async print(input) {
      await printWithDriver(viewer, client, options, input)
    },
    async printPdf(input) {
      const jobId = await client.printPdf(input.pdf, {
        printerName: resolvePrinterName(input.printerName, options),
        copies: resolveCopies(input.copies, options),
        userData: input.userData ?? options.defaults?.userData,
      })
      if (resolveWaitForCompletion(input.waitForCompletion, options))
        await client.waitForJob(jobId)
    },
    async printHtml(input) {
      const renderOptions: EasyInkPrinterPrintHtmlOptions['renderOptions'] = {
        pdf: {
          printBackground: true,
          marginMm: input.paper && input.paper !== 'driver'
            ? { top: 0, right: 0, bottom: 0, left: 0 }
            : undefined,
        },
        wait: input.readySelector ? { selector: input.readySelector } : undefined,
      }
      const jobId = await client.printHtml(input.html, {
        printerName: resolvePrinterName(input.printerName, options),
        copies: resolveCopies(input.copies, options),
        userData: input.userData ?? options.defaults?.userData,
        baseUrl: input.baseUrl,
        fileName: input.fileName,
        ...resolvePaperOptions(input.paper),
        renderOptions,
      })
      if (resolveWaitForCompletion(input.waitForCompletion, options))
        await client.waitForJob(jobId)
    },
    destroy() {
      viewer.destroy()
    },
  }

  return printer
}

async function printWithDriver(
  viewer: ManagedPrintViewer,
  client: EasyInkPrinterClient,
  options: EasyInkPrinterOptions,
  input: EasyInkPrinterPrintInput,
): Promise<void> {
  const strategy = resolveStrategy(input, options)
  const paper = resolvePaper(input, options)
  const sdkRequestOptions = buildTemplateRequestOptions(strategy, paper, input.userData ?? options.defaults?.userData)

  return viewer.printWithDriver({
    ...input,
    pageSizeMode: 'fixed',
  }, createEasyInkPrinterDriver({
    id: 'easyink-printer',
    client,
    printerName: () => resolvePrinterName(input.printerName, options),
    copies: () => resolveCopies(input.copies, options),
    forcePageSize: () => resolveForcePageSize(paper),
    submitMode: mapStrategyToSubmitMode(strategy),
    waitForCompletion: resolveWaitForCompletion(input.waitForCompletion, options),
    resolveRequestOptions: () => sdkRequestOptions,
  }))
}

function resolvePrinterName(inputPrinterName: string | undefined, options: EasyInkPrinterOptions): string | undefined {
  return inputPrinterName
    ?? options.defaults?.printerName
    ?? options.printerName
}

function resolveCopies(inputCopies: number | undefined, options: EasyInkPrinterOptions): number | undefined {
  return inputCopies
    ?? options.defaults?.copies
    ?? options.copies
}

function resolveWaitForCompletion(inputWait: boolean | undefined, options: EasyInkPrinterOptions): boolean {
  return inputWait
    ?? options.defaults?.waitForCompletion
    ?? true
}

function resolveStrategy(
  input: EasyInkPrinterPrintInput,
  options: EasyInkPrinterOptions,
): EasyInkPrintStrategy {
  return input.strategy
    ?? options.defaults?.strategy
    ?? 'browser-pdf'
}

function resolvePaper(
  input: EasyInkPrinterPrintInput,
  options: EasyInkPrinterOptions,
): 'template' | 'driver' | EasyInkPaperSize {
  if (input.paper)
    return input.paper
  if (options.defaults?.paper)
    return options.defaults.paper
  return 'template'
}

function resolveForcePageSize(
  paper: 'template' | 'driver' | EasyInkPaperSize,
): boolean {
  return paper !== 'driver'
}

function buildTemplateRequestOptions(
  strategy: EasyInkPrintStrategy,
  paper: 'template' | 'driver' | EasyInkPaperSize,
  userData: EasyInkPrinterUserData | undefined,
): Partial<EasyInkPrinterDriverPrintOptions> {
  return {
    userData,
    ...resolvePaperOptions(paper),
    renderOptions: resolveStrategyRenderOptions(strategy, paper),
  }
}

function resolveStrategyRenderOptions(
  strategy: EasyInkPrintStrategy,
  paper: 'template' | 'driver' | EasyInkPaperSize,
): EasyInkPrinterDriverPrintOptions['renderOptions'] | undefined {
  if (strategy === 'printer-template') {
    return {
      pdf: { printBackground: true },
      wait: { until: 'easyinkReady' },
    }
  }
  if (strategy === 'preview-html') {
    const htmlPaper = resolvePaperOptions(paper).paperSize
    return {
      pdf: {
        paperWidthMm: htmlPaper?.width,
        paperHeightMm: htmlPaper?.height,
        printBackground: true,
        marginMm: { top: 0, right: 0, bottom: 0, left: 0 },
        preferCSSPageSize: true,
      },
      wait: { selector: '.easyink-ready', timeoutMs: 5000 },
    }
  }
  return undefined
}

function resolvePaperOptions(paper: 'template' | 'driver' | EasyInkPaperSize | undefined): Partial<EasyInkPrinterDriverPrintOptions> {
  if (!paper || paper === 'driver' || paper === 'template')
    return {}

  return {
    paperSize: toPrinterPaperSize(paper),
    forcePageSize: true,
  }
}

function toPrinterPaperSize(paper: EasyInkPaperSize): EasyInkPrinterPaperSize {
  return {
    width: paper.widthMm,
    height: paper.heightMm,
    unit: 'mm',
  }
}

function mapStrategyToSubmitMode(strategy: EasyInkPrintStrategy): EasyInkPrinterDriverSubmitMode {
  switch (strategy) {
    case 'printer-template':
      return 'renderSource'
    case 'preview-html':
      return 'html'
    default:
      return 'pdf'
  }
}
