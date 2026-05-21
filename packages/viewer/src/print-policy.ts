import type { DocumentSchema } from '@easyink/schema'
import type { ViewerPageMetrics, ViewerPrintOptions, ViewerPrintPolicy } from './types'
import { resolvePageModel } from '@easyink/core'

export interface ResolvePrintPolicyInput {
  schema: DocumentSchema
  options?: ViewerPrintOptions
  renderedPages?: ViewerPageMetrics[]
}

export class PrintPolicyError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'PrintPolicyError'
  }
}

export function resolvePrintPolicy(input: ResolvePrintPolicyInput): ViewerPrintPolicy {
  const { schema, options = {}, renderedPages = [] } = input
  const { page, unit } = schema
  const pageModel = resolvePageModel(schema)
  const requestedPageSizeMode = options.pageSizeMode ?? 'driver'
  const isContinuousPaper = pageModel.kind === 'continuous-paper'
  const usesDriverPaper = isContinuousPaper && requestedPageSizeMode === 'driver'
  const orientation = page.print?.orientation ?? 'auto'

  const offset = {
    horizontal: page.print?.horizontalOffset ?? 0,
    vertical: page.print?.verticalOffset ?? 0,
    unit,
  }

  if (usesDriverPaper) {
    return {
      pageMode: page.mode,
      pageSizeMode: 'driver',
      orientation,
      pageBreakBehavior: { after: 'auto', inside: 'auto' },
      offset,
    }
  }

  if (isContinuousPaper && requestedPageSizeMode === 'fixed') {
    const firstPage = renderedPages[0]
    if (!firstPage) {
      throw new PrintPolicyError(
        'PRINT_RENDER_METRICS_MISSING',
        'Continuous paper fixed-size printing requires rendered page metrics. Call render() before printing.',
      )
    }

    return {
      pageMode: page.mode,
      pageSizeMode: 'fixed',
      orientation,
      sheetSize: {
        width: firstPage.width,
        height: firstPage.height,
        unit: firstPage.unit,
        source: 'rendered',
      },
      pageBreakBehavior: { after: 'auto', inside: 'auto' },
      offset,
    }
  }

  return {
    pageMode: page.mode,
    pageSizeMode: 'fixed',
    orientation,
    sheetSize: { width: pageModel.width, height: pageModel.height, unit, source: 'schema' },
    pageBreakBehavior: {
      after: isContinuousPaper ? 'auto' : 'page',
      inside: isContinuousPaper ? 'auto' : 'avoid',
    },
    offset,
  }
}
