import type { DocumentSchema } from '@easyink/schema'
import type { ViewerPageMetrics, ViewerPrintOptions, ViewerPrintPolicy } from './types'

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
  const requestedPageSizeMode = options.pageSizeMode ?? 'driver'
  const isContinuousPaper = page.pageModel?.kind === 'continuous-paper' || page.mode === 'stack' || page.mode === 'continuous'
  const isLabelSheet = page.pageModel?.kind === 'label-sheet' || page.mode === 'label'
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

  let width = page.width
  let height = page.height
  let source: 'schema' | 'label' = 'schema'

  if (isLabelSheet) {
    const columns = page.label?.columns || 1
    const rows = page.label?.rows || 1
    const gapX = page.label?.gap || 0
    const gapY = page.label?.rowGap || 0
    width = page.width * columns + gapX * Math.max(columns - 1, 0)
    height = page.height * rows + gapY * Math.max(rows - 1, 0)
    source = 'label'
  }

  return {
    pageMode: page.mode,
    pageSizeMode: 'fixed',
    orientation,
    sheetSize: { width, height, unit, source },
    pageBreakBehavior: {
      after: isContinuousPaper ? 'auto' : 'page',
      inside: isContinuousPaper ? 'auto' : 'avoid',
    },
    offset,
  }
}
