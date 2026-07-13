import type { DocumentSchema, MaterialNode } from '@easyink/schema'
import type { JsonValue, PageMode } from '@easyink/shared'
import type { LayoutDiagnostic, LayoutDocument, LayoutFragment, OutputPagePlan } from './layout-plan'
import type {
  LayoutPlanDiagnostic,
  MaterialBreakOpportunity,
  MaterialFragmentAdapter,
  MaterialFragmentContribution,
  MaterialFragmentPlan,
  MaterialFragmentRequest,
  MaterialLayoutPlan,
} from './material-layout-plan'
import { assertJsonValue } from '@easyink/shared'
import { readNodeFlowConstraints } from './layout-plan'
import { freezeMaterialFragmentPlan, freezeMaterialLayoutPlan, validateMaterialLayoutPlan } from './material-layout-plan'
import { resolvePageModel } from './page-model'

export interface PaginationOptions {
  originalSchema?: DocumentSchema
  resolveFragmentAdapter?: (fragment: LayoutFragment) => MaterialFragmentAdapter | undefined
  retainBlankPage?: (page: OutputPagePlan) => boolean
}

export interface PaginationResult {
  mode: PageMode
  pages: OutputPagePlan[]
  diagnostics: LayoutDiagnostic[]
}

const FRAGMENT_SIZE_TOLERANCE = 1e-9
const LEGACY_FRAGMENT_FIELDS = new Set([
  'availableHeight',
  'box',
  'continuation',
  'currentPage',
  'fragment',
  'id',
  'nextPage',
  'page',
  'pageContext',
  'pageIndex',
  'pageNumber',
  'pages',
  'repeat',
  'sheetIndex',
  'sourceInstanceKey',
  'sourceNodeId',
  'totalPages',
  'yOffset',
])
const FRAGMENT_CONTRIBUTION_FIELDS = new Set([
  'inlineSize',
  'blockSize',
  'consumedRange',
  'renderPayload',
  'diagnostics',
])

export function chooseBreak(
  plan: MaterialLayoutPlan<unknown>,
  startBlockOffset: number,
  availableHeight: number,
): MaterialBreakOpportunity | { id: '$end', blockOffset: number, penalty: number } | undefined {
  assertValidPaginationPlan(plan)
  const height = plan.borderBox.height
  if (!Number.isFinite(startBlockOffset) || startBlockOffset < 0 || startBlockOffset > height
    || !Number.isFinite(availableHeight) || availableHeight < 0) {
    throw new Error('MATERIAL_BREAK_INPUT_INVALID')
  }

  const limit = Math.min(startBlockOffset + availableHeight, height)
  if (height <= limit)
    return { id: '$end', blockOffset: height, penalty: 0 }

  let chosen: MaterialBreakOpportunity | undefined
  for (const candidate of plan.breakOpportunities) {
    if (candidate.blockOffset <= startBlockOffset)
      continue
    if (candidate.blockOffset > limit)
      break
    if (!chosen || candidate.penalty < chosen.penalty
      || (candidate.penalty === chosen.penalty && candidate.blockOffset > chosen.blockOffset)) {
      chosen = candidate
    }
  }
  return chosen
}

export function fragmentRangeMadeProgress(
  requested: Readonly<{ startBlockOffset: number, endBlockOffset: number }>,
  returned: Readonly<{ startBlockOffset: number, endBlockOffset: number }>,
): boolean {
  return returned.startBlockOffset === requested.startBlockOffset
    && returned.endBlockOffset === requested.endBlockOffset
    && returned.endBlockOffset > returned.startBlockOffset
}

export function commitMaterialFragment(
  inputRequest: MaterialFragmentRequest,
  contribution: MaterialFragmentContribution,
  inputPlacement: Readonly<{ x: number, y: number }>,
): MaterialFragmentPlan {
  const request = readFragmentRequest(inputRequest)
  const placement = readFragmentPlacement(inputPlacement)
  validateFragmentRequest(request)
  const facts = readFragmentContribution(contribution)

  if (!fragmentRangeMadeProgress(request, facts.consumedRange))
    throw new Error('MATERIAL_FRAGMENT_RANGE_MISMATCH')

  const expectedBlockSize = request.endBlockOffset - request.startBlockOffset
  if (!Number.isFinite(facts.inlineSize) || !Number.isFinite(facts.blockSize)
    || facts.inlineSize < 0 || facts.blockSize < 0
    || Math.abs(facts.inlineSize - request.plan.borderBox.width) > FRAGMENT_SIZE_TOLERANCE
    || Math.abs(facts.blockSize - expectedBlockSize) > FRAGMENT_SIZE_TOLERANCE) {
    throw new Error('MATERIAL_FRAGMENT_BOX_INVALID')
  }

  validateFragmentDiagnostics(facts.diagnostics, request.plan)
  if (facts.renderPayload !== undefined) {
    try {
      assertJsonValue(facts.renderPayload)
    }
    catch {
      throw new Error('MATERIAL_FRAGMENT_RENDER_PAYLOAD_INVALID')
    }
  }

  return freezeMaterialFragmentPlan({
    id: JSON.stringify([
      'material-fragment',
      request.plan.instanceKey,
      request.pageIndex,
      request.startBlockOffset,
      request.endBlockOffset,
    ]),
    sourceInstanceKey: request.plan.instanceKey,
    sourceNodeId: request.plan.nodeId,
    box: { x: placement.x, y: placement.y, width: facts.inlineSize, height: facts.blockSize },
    consumedRange: facts.consumedRange,
    ...(facts.renderPayload === undefined ? {} : { renderPayload: facts.renderPayload }),
    diagnostics: facts.diagnostics,
  })
}

export function runPagination(
  schema: DocumentSchema,
  document: LayoutDocument,
  options: PaginationOptions = {},
): PaginationResult {
  const strategy = schema.page.pagination?.strategy ?? inferPaginationStrategy(schema)
  const diagnostics = [...document.diagnostics]

  if (strategy === 'fixed-sheets')
    return { mode: schema.page.mode, pages: createFixedSheets(schema, document, diagnostics, options), diagnostics }
  if (strategy === 'auto-sheets')
    return { mode: schema.page.mode, pages: createAutoSheets(schema, document, diagnostics, options), diagnostics }
  if (strategy === 'none')
    return { mode: schema.page.mode, pages: createContinuousSheet(schema, document, diagnostics, options), diagnostics }

  diagnostics.push({
    code: 'UNKNOWN_PAGINATION_STRATEGY',
    severity: 'error',
    message: `Unknown pagination strategy: ${strategy}`,
    stage: 'pagination',
  })
  return { mode: schema.page.mode, pages: [], diagnostics }
}

function inferPaginationStrategy(schema: DocumentSchema): NonNullable<DocumentSchema['page']['pagination']>['strategy'] {
  const pageModelKind = schema.page.pageModel?.kind
  if (pageModelKind === 'continuous-paper' || schema.page.mode === 'continuous')
    return 'none'
  return 'fixed-sheets'
}

function createFixedSheets(
  schema: DocumentSchema,
  document: LayoutDocument,
  diagnostics: LayoutDiagnostic[],
  options: PaginationOptions,
): OutputPagePlan[] {
  const page = schema.page
  const pageModel = resolvePageModel(schema)
  const pageWidth = pageModel.width
  const pageHeight = pageModel.height
  const pageCount = Math.max(page.pagination?.pageCount ?? page.pages ?? 1, 1)
  const pageFragments = Array.from({ length: pageCount }, () => [] as LayoutFragment[])

  for (const fragment of document.fragments) {
    const box = fragment.plan.borderBox
    let pageIndex = Math.max(Math.min(Math.floor(box.y / pageHeight), pageCount - 1), 0)
    if (box.height === 0) {
      pageFragments[pageIndex]!.push(fragment)
      continue
    }

    let startBlockOffset = 0
    let firstPlacement = true
    const fragmentAdapter = options.resolveFragmentAdapter?.(fragment)
    while (startBlockOffset < box.height) {
      const pageStart = pageIndex * pageHeight
      const relativeTop = firstPlacement ? Math.max(box.y - pageStart, 0) : 0
      const availableHeight = Math.max(pageHeight - relativeTop, 0)
      const selected = chooseBreak(fragment.plan, startBlockOffset, availableHeight)
      let endBlockOffset = selected?.blockOffset ?? firstLaterBoundaryOrEnd(fragment.plan, startBlockOffset)
      if (pageIndex === pageCount - 1 && endBlockOffset < box.height)
        endBlockOffset = box.height

      if (endBlockOffset - startBlockOffset > availableHeight) {
        diagnostics.push(createFragmentOverflowDiagnostic(
          fragment,
          startBlockOffset,
          endBlockOffset,
          availableHeight,
          pageIndex,
        ))
      }

      pageFragments[pageIndex]!.push(commitFragmentRange(
        fragment,
        fragmentAdapter,
        startBlockOffset,
        endBlockOffset,
        availableHeight,
        pageIndex,
        { x: box.x, y: pageStart + relativeTop },
        diagnostics,
      ))
      startBlockOffset = endBlockOffset
      firstPlacement = false
      if (startBlockOffset < box.height)
        pageIndex += 1
    }
  }

  const entries = pageFragments.map((fragments, index) => (
    createPage(index, pageWidth, pageHeight, index * pageHeight, fragments)
  ))

  let pages = applyBlankPolicy(entries, page.blankPolicy, options.retainBlankPage)
  pages = applyPageCopies(pages, Math.max(page.copies ?? 1, 1))
  resolveTotalPages(pages)

  for (const fragment of document.fragments) {
    const box = fragment.plan.borderBox
    const flow = readNodeFlowConstraints(fragment.node as MaterialNode)
    const pageIndex = Math.max(Math.min(Math.floor(box.y / pageHeight), pageCount - 1), 0)
    const pageStart = pageIndex * pageHeight
    const overflowsX = box.x < 0 || box.x + box.width > pageWidth
    const overflowsY = box.y < pageStart || box.y + box.height > pageStart + pageHeight
    if (overflowsX || overflowsY) {
      diagnostics.push({
        code: 'FIXED_SHEETS_FRAGMENT_OVERFLOW',
        severity: 'warning',
        message: `Fragment ${fragment.plan.nodeId} overflows its fixed output page and may be clipped.`,
        stage: 'pagination',
        sourceNodeId: fragment.plan.nodeId,
        detail: {
          pageIndex,
          pageRect: { x: 0, y: pageStart, width: pageWidth, height: pageHeight },
          fragmentBox: box,
        },
      })
    }

    if (flow.pageBreakBefore || flow.pageBreakAfter) {
      diagnostics.push({
        code: 'FIXED_SHEETS_BREAK_CONSTRAINT_IGNORED',
        severity: 'info',
        message: 'Explicit page-break constraints are diagnostic-only for fixed-sheets pagination.',
        stage: 'pagination',
        sourceNodeId: fragment.plan.nodeId,
      })
    }
  }

  return pages
}

function createAutoSheets(
  schema: DocumentSchema,
  document: LayoutDocument,
  diagnostics: LayoutDiagnostic[],
  options: PaginationOptions,
): OutputPagePlan[] {
  const pageModel = resolvePageModel(schema)
  const pageWidth = pageModel.width
  const pageHeight = pageModel.height
  const pages: OutputPagePlan[] = []
  let currentFragments: LayoutFragment[] = []
  let currentPageStart = 0

  const ordered = [...document.fragments].sort((left, right) => {
    if (left.plan.borderBox.y !== right.plan.borderBox.y)
      return left.plan.borderBox.y - right.plan.borderBox.y
    return left.plan.borderBox.x - right.plan.borderBox.x
  })

  function pushCurrent(): void {
    pages.push(createPage(pages.length, pageWidth, pageHeight, currentPageStart, currentFragments))
    currentFragments = []
    currentPageStart = pages.length * pageHeight
  }

  for (const fragment of ordered) {
    const fragmentFlow = readNodeFlowConstraints(fragment.node as MaterialNode)
    if (fragmentFlow.pageBreakBefore && currentFragments.length > 0)
      pushCurrent()

    const box = fragment.plan.borderBox
    if (box.height === 0) {
      currentFragments.push(fragment)
      if (fragmentFlow.pageBreakAfter)
        pushCurrent()
      continue
    }

    let startBlockOffset = 0
    let firstPlacement = true
    const fragmentAdapter = options.resolveFragmentAdapter?.(fragment)
    while (startBlockOffset < box.height) {
      let relativeTop = firstPlacement ? Math.max(box.y - currentPageStart, 0) : 0
      const remainingHeight = box.height - startBlockOffset
      if (firstPlacement && currentFragments.length > 0 && relativeTop + remainingHeight > pageHeight
        && (fragmentFlow.keepTogether || remainingHeight <= pageHeight)) {
        pushCurrent()
        relativeTop = 0
      }

      const availableHeight = Math.max(pageHeight - relativeTop, 0)
      const selected = chooseBreak(fragment.plan, startBlockOffset, availableHeight)
      const endBlockOffset = selected?.blockOffset ?? firstLaterBoundaryOrEnd(fragment.plan, startBlockOffset)
      const overflow = endBlockOffset - startBlockOffset > availableHeight
      if (overflow) {
        diagnostics.push(createFragmentOverflowDiagnostic(
          fragment,
          startBlockOffset,
          endBlockOffset,
          availableHeight,
          pages.length,
        ))
      }

      currentFragments.push(commitFragmentRange(
        fragment,
        fragmentAdapter,
        startBlockOffset,
        endBlockOffset,
        availableHeight,
        pages.length,
        { x: box.x, y: currentPageStart + relativeTop },
        diagnostics,
      ))
      startBlockOffset = endBlockOffset
      firstPlacement = false

      if (startBlockOffset < box.height)
        pushCurrent()
    }

    if (fragmentFlow.pageBreakAfter)
      pushCurrent()
  }

  if (currentFragments.length > 0 || pages.length === 0)
    pushCurrent()

  resolveTotalPages(pages)
  return pages
}

function createContinuousSheet(
  schema: DocumentSchema,
  document: LayoutDocument,
  diagnostics: LayoutDiagnostic[],
  options: PaginationOptions,
): OutputPagePlan[] {
  for (const fragment of document.fragments) {
    const flow = readNodeFlowConstraints(fragment.node as MaterialNode)
    if (flow.pageBreakBefore || flow.pageBreakAfter) {
      diagnostics.push({
        code: 'CONTINUOUS_BREAK_CONSTRAINT_IGNORED',
        severity: 'info',
        message: 'Explicit page-break constraints do not cut continuous-paper output.',
        stage: 'pagination',
        sourceNodeId: fragment.plan.nodeId,
      })
    }
  }

  const trailingGap = schema.page.reflow?.preserveTrailingGap === false
    ? 0
    : getTrailingGap(options.originalSchema)
  const pageModel = resolvePageModel(schema)
  const height = Math.max(pageModel.height, getContentBottom(document.fragments) + trailingGap)
  const fragments = document.fragments.map((fragment) => {
    const box = fragment.plan.borderBox
    if (box.height === 0)
      return fragment
    return commitFragmentRange(
      fragment,
      options.resolveFragmentAdapter?.(fragment),
      0,
      box.height,
      height,
      0,
      { x: box.x, y: box.y },
      diagnostics,
    )
  })
  const page = createPage(0, pageModel.width, height, 0, fragments)
  resolveTotalPages([page])
  return [page]
}

function getTrailingGap(originalSchema: DocumentSchema | undefined): number {
  const pageModelKind = originalSchema?.page.pageModel?.kind
  if (!originalSchema || (pageModelKind !== 'continuous-paper' && originalSchema.page.mode !== 'continuous'))
    return 0
  let bottom = 0
  for (const el of originalSchema.elements)
    bottom = Math.max(bottom, el.y + el.height)
  return Math.max(originalSchema.page.height - bottom, 0)
}

function createPage(
  index: number,
  width: number,
  height: number,
  yOffset: number,
  fragments: LayoutFragment[],
  copyIndex?: number,
): OutputPagePlan {
  return {
    index,
    sheetIndex: index,
    width,
    height,
    yOffset,
    fragments,
    pageContext: {
      pageNumber: index + 1,
      totalPages: 1,
      ...(copyIndex != null ? { copyIndex } : {}),
    },
  }
}

function applyBlankPolicy(
  pages: OutputPagePlan[],
  blankPolicy: DocumentSchema['page']['blankPolicy'],
  retainBlankPage?: (page: OutputPagePlan) => boolean,
): OutputPagePlan[] {
  if (blankPolicy !== 'remove')
    return pages
  const filtered = pages.filter(page => page.fragments.length > 0 || retainBlankPage?.(page))
  return filtered.length > 0 ? filtered : pages.slice(0, 1)
}

function applyPageCopies(pages: OutputPagePlan[], copies: number): OutputPagePlan[] {
  if (copies <= 1)
    return pages

  const result = [...pages]
  const base = [...pages]
  for (let copyIndex = 1; copyIndex < copies; copyIndex++) {
    for (const page of base) {
      result.push({
        ...page,
        index: result.length,
        sheetIndex: result.length,
        pageContext: {
          ...page.pageContext,
          pageNumber: result.length + 1,
          copyIndex,
        },
      })
    }
  }
  return result
}

function resolveTotalPages(pages: OutputPagePlan[]): void {
  for (const page of pages) {
    page.pageContext.totalPages = pages.length
    page.pageContext.pageNumber = page.index + 1
  }
}

function assertValidPaginationPlan(plan: MaterialLayoutPlan<unknown>): void {
  if (validateMaterialLayoutPlan(plan).some(diagnostic => diagnostic.severity === 'error'))
    throw new Error('MATERIAL_LAYOUT_PLAN_INVALID')
}

function validateFragmentRequest(request: MaterialFragmentRequest): void {
  assertValidPaginationPlan(request.plan)
  const height = request.plan.borderBox.height
  if (!Number.isSafeInteger(request.pageIndex) || request.pageIndex < 0
    || !Number.isFinite(request.startBlockOffset) || !Number.isFinite(request.endBlockOffset)
    || request.startBlockOffset < 0 || request.endBlockOffset < request.startBlockOffset
    || request.endBlockOffset > height
    || !Number.isFinite(request.availableHeight) || request.availableHeight < 0) {
    throw new Error('MATERIAL_FRAGMENT_REQUEST_INVALID')
  }
}

function readFragmentRequest(input: MaterialFragmentRequest): MaterialFragmentRequest {
  if (!isRecord(input))
    throw new Error('MATERIAL_FRAGMENT_REQUEST_INVALID')
  const plan = readOwnData(input, 'plan', 'MATERIAL_FRAGMENT_REQUEST_INVALID')
  const startBlockOffset = readOwnData(input, 'startBlockOffset', 'MATERIAL_FRAGMENT_REQUEST_INVALID')
  const endBlockOffset = readOwnData(input, 'endBlockOffset', 'MATERIAL_FRAGMENT_REQUEST_INVALID')
  const availableHeight = readOwnData(input, 'availableHeight', 'MATERIAL_FRAGMENT_REQUEST_INVALID')
  const pageIndex = readOwnData(input, 'pageIndex', 'MATERIAL_FRAGMENT_REQUEST_INVALID')
  if (!isRecord(plan) || typeof startBlockOffset !== 'number' || typeof endBlockOffset !== 'number'
    || typeof availableHeight !== 'number' || typeof pageIndex !== 'number') {
    throw new Error('MATERIAL_FRAGMENT_REQUEST_INVALID')
  }
  return { plan: plan as unknown as MaterialLayoutPlan<unknown>, startBlockOffset, endBlockOffset, availableHeight, pageIndex }
}

function readFragmentPlacement(input: Readonly<{ x: number, y: number }>): Readonly<{ x: number, y: number }> {
  if (!isRecord(input))
    throw new Error('MATERIAL_FRAGMENT_PLACEMENT_INVALID')
  const x = readOwnData(input, 'x', 'MATERIAL_FRAGMENT_PLACEMENT_INVALID')
  const y = readOwnData(input, 'y', 'MATERIAL_FRAGMENT_PLACEMENT_INVALID')
  if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y))
    throw new Error('MATERIAL_FRAGMENT_PLACEMENT_INVALID')
  return { x, y }
}

function readFragmentContribution(
  contribution: MaterialFragmentContribution,
): {
  inlineSize: number
  blockSize: number
  consumedRange: Readonly<{ startBlockOffset: number, endBlockOffset: number }>
  renderPayload?: JsonValue
  diagnostics: readonly LayoutPlanDiagnostic[]
} {
  if (!isRecord(contribution))
    throw new Error('MATERIAL_FRAGMENT_CONTRIBUTION_INVALID')
  const ownKeys = Reflect.ownKeys(contribution)
  const ownNames = ownKeys.filter((key): key is string => typeof key === 'string')
  if (ownNames.some(field => LEGACY_FRAGMENT_FIELDS.has(field)))
    throw new Error('MATERIAL_FRAGMENT_LEGACY_FIELD')
  if (ownKeys.some(key => typeof key === 'symbol') || ownNames.some(field => !FRAGMENT_CONTRIBUTION_FIELDS.has(field)))
    throw new Error('MATERIAL_FRAGMENT_CONTRIBUTION_INVALID')

  const prototype = Object.getPrototypeOf(contribution)
  if (prototype !== null && prototype !== Object.prototype) {
    if (prototypeHasLegacyFragmentField(prototype))
      throw new Error('MATERIAL_FRAGMENT_LEGACY_FIELD')
    throw new Error('MATERIAL_FRAGMENT_CONTRIBUTION_INVALID')
  }

  const inlineSize = readOwnData(contribution, 'inlineSize', 'MATERIAL_FRAGMENT_CONTRIBUTION_INVALID')
  const blockSize = readOwnData(contribution, 'blockSize', 'MATERIAL_FRAGMENT_CONTRIBUTION_INVALID')
  const consumedRange = readOwnData(contribution, 'consumedRange', 'MATERIAL_FRAGMENT_CONTRIBUTION_INVALID')
  const diagnostics = readOwnData(contribution, 'diagnostics', 'MATERIAL_FRAGMENT_CONTRIBUTION_INVALID')
  const renderPayload = readOwnData(contribution, 'renderPayload', 'MATERIAL_FRAGMENT_CONTRIBUTION_INVALID', true)
  if (typeof inlineSize !== 'number' || typeof blockSize !== 'number'
    || !isRecord(consumedRange) || !Array.isArray(diagnostics)) {
    throw new Error('MATERIAL_FRAGMENT_CONTRIBUTION_INVALID')
  }
  const startBlockOffset = readOwnData(consumedRange, 'startBlockOffset', 'MATERIAL_FRAGMENT_CONTRIBUTION_INVALID')
  const endBlockOffset = readOwnData(consumedRange, 'endBlockOffset', 'MATERIAL_FRAGMENT_CONTRIBUTION_INVALID')
  if (typeof startBlockOffset !== 'number' || typeof endBlockOffset !== 'number')
    throw new Error('MATERIAL_FRAGMENT_CONTRIBUTION_INVALID')

  return {
    inlineSize,
    blockSize,
    consumedRange: { startBlockOffset, endBlockOffset },
    ...(renderPayload === undefined ? {} : { renderPayload: renderPayload as JsonValue }),
    diagnostics: diagnostics as unknown as readonly LayoutPlanDiagnostic[],
  }
}

function validateFragmentDiagnostics(
  diagnostics: readonly LayoutPlanDiagnostic[],
  plan: MaterialLayoutPlan<unknown>,
): void {
  const allowedFields = new Set(['code', 'severity', 'message', 'instanceKey', 'nodeId', 'detail'])
  for (const candidate of diagnostics) {
    if (!isRecord(candidate) || Object.getOwnPropertyNames(candidate).some(field => !allowedFields.has(field)))
      throw new Error('MATERIAL_FRAGMENT_DIAGNOSTIC_INVALID')
    const code = readOwnData(candidate, 'code', 'MATERIAL_FRAGMENT_DIAGNOSTIC_INVALID')
    const severity = readOwnData(candidate, 'severity', 'MATERIAL_FRAGMENT_DIAGNOSTIC_INVALID')
    const message = readOwnData(candidate, 'message', 'MATERIAL_FRAGMENT_DIAGNOSTIC_INVALID')
    const instanceKey = readOwnData(candidate, 'instanceKey', 'MATERIAL_FRAGMENT_DIAGNOSTIC_INVALID')
    const nodeId = readOwnData(candidate, 'nodeId', 'MATERIAL_FRAGMENT_DIAGNOSTIC_INVALID')
    const detail = readOwnData(candidate, 'detail', 'MATERIAL_FRAGMENT_DIAGNOSTIC_INVALID', true)
    if (typeof code !== 'string' || code.length === 0
      || (severity !== 'info' && severity !== 'warning' && severity !== 'error')
      || typeof message !== 'string' || message.length === 0
      || instanceKey !== plan.instanceKey || nodeId !== plan.nodeId) {
      throw new Error('MATERIAL_FRAGMENT_DIAGNOSTIC_INVALID')
    }
    try {
      if (detail !== undefined)
        assertJsonValue(detail)
    }
    catch {
      throw new Error('MATERIAL_FRAGMENT_DIAGNOSTIC_INVALID')
    }
  }
}

function readOwnData(value: object, field: string, errorCode: string, optional = false): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(value, field)
  if (!descriptor)
    return optional ? undefined : invalidStructure(errorCode)
  if (!('value' in descriptor))
    return invalidStructure(errorCode)
  return descriptor.value
}

function invalidStructure(errorCode: string): never {
  throw new Error(errorCode)
}

function prototypeHasLegacyFragmentField(value: object): boolean {
  let current: object | null = value
  while (current !== null && current !== Object.prototype) {
    if (Reflect.ownKeys(current).some(key => typeof key === 'string' && LEGACY_FRAGMENT_FIELDS.has(key)))
      return true
    current = Object.getPrototypeOf(current)
  }
  return false
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function firstLaterBoundaryOrEnd(plan: MaterialLayoutPlan<unknown>, startBlockOffset: number): number {
  return plan.breakOpportunities.find(candidate => candidate.blockOffset > startBlockOffset)?.blockOffset
    ?? plan.borderBox.height
}

function createDefaultContribution(
  request: MaterialFragmentRequest,
  embedded?: MaterialFragmentPlan,
): MaterialFragmentContribution {
  if (embedded
    && embedded.sourceInstanceKey === request.plan.instanceKey
    && embedded.sourceNodeId === request.plan.nodeId
    && fragmentRangeMadeProgress(request, embedded.consumedRange)
    && Math.abs(embedded.box.width - request.plan.borderBox.width) <= FRAGMENT_SIZE_TOLERANCE
    && Math.abs(embedded.box.height - (request.endBlockOffset - request.startBlockOffset)) <= FRAGMENT_SIZE_TOLERANCE) {
    return {
      inlineSize: embedded.box.width,
      blockSize: embedded.box.height,
      consumedRange: embedded.consumedRange,
      ...(embedded.renderPayload === undefined ? {} : { renderPayload: embedded.renderPayload }),
      diagnostics: embedded.diagnostics,
    }
  }
  return {
    inlineSize: request.plan.borderBox.width,
    blockSize: request.endBlockOffset - request.startBlockOffset,
    consumedRange: {
      startBlockOffset: request.startBlockOffset,
      endBlockOffset: request.endBlockOffset,
    },
    diagnostics: [],
  }
}

function commitFragmentRange(
  fragment: LayoutFragment,
  adapter: MaterialFragmentAdapter | undefined,
  startBlockOffset: number,
  endBlockOffset: number,
  availableHeight: number,
  pageIndex: number,
  placement: Readonly<{ x: number, y: number }>,
  diagnostics: LayoutDiagnostic[],
): LayoutFragment {
  const privateRequest: MaterialFragmentRequest = {
    plan: fragment.plan,
    startBlockOffset,
    endBlockOffset,
    availableHeight,
    pageIndex,
  }
  validateFragmentRequest(privateRequest)
  const adapterRequest = Object.freeze({
    plan: freezeMaterialLayoutPlan(fragment.plan),
    startBlockOffset,
    endBlockOffset,
    availableHeight,
    pageIndex,
  })
  const contribution = adapter?.createFragment(adapterRequest)
    ?? createDefaultContribution(privateRequest, fragment.fragmentPlan)
  const fragmentPlan = commitMaterialFragment(privateRequest, contribution, placement)
  diagnostics.push(...fragmentPlan.diagnostics.map(toPaginationDiagnostic))
  return { ...fragment, fragmentPlan }
}

function createFragmentOverflowDiagnostic(
  fragment: LayoutFragment,
  startBlockOffset: number,
  endBlockOffset: number,
  availableHeight: number,
  pageIndex: number,
): LayoutDiagnostic {
  return {
    code: 'MATERIAL_FRAGMENT_OVERFLOW',
    severity: 'warning',
    message: `Fragment ${fragment.plan.nodeId} has no break boundary within the available page height.`,
    stage: 'pagination',
    sourceNodeId: fragment.plan.nodeId,
    detail: { startBlockOffset, endBlockOffset, availableHeight, pageIndex },
  }
}

function toPaginationDiagnostic(diagnostic: LayoutPlanDiagnostic): LayoutDiagnostic {
  return {
    code: diagnostic.code,
    severity: diagnostic.severity,
    message: diagnostic.message,
    stage: 'pagination',
    sourceNodeId: diagnostic.nodeId,
    ...(diagnostic.detail === undefined ? {} : { detail: diagnostic.detail }),
  }
}

function getContentBottom(fragments: LayoutFragment[]): number {
  let bottom = 0
  for (const fragment of fragments)
    bottom = Math.max(bottom, fragment.plan.borderBox.y + fragment.plan.borderBox.height)
  return bottom
}
