import type { DocumentSchema, MaterialNode } from '@easyink/schema'
import type { Patch } from 'mutative'
import type { DocumentIndexSnapshot } from './document-index'
import type { PreviewValidationReport } from './document-preview-validation'
import type { DocumentRecipe, DocumentTransactionOptions } from './document-transaction-engine'
import type { TransactionAPI, TransactionOperationContext, TxOptions } from './editing-session'
import { create, markSimpleObject } from 'mutative'

export interface PreviewPublishPayload {
  document: DocumentSchema
  forward: readonly Patch[]
  inverse: readonly Patch[]
}

export interface PreviewCommitPayload extends PreviewPublishPayload {
  options: DocumentTransactionOptions
}

/** Internal error raised when a node-scoped preview recipe escapes its declared paths. */
class PreviewMutationScopeError extends Error {
  constructor(path: readonly (string | number)[]) {
    super(`Preview mutation is outside declared property paths at ${encodePointer(path) || '/'}`)
    this.name = 'PreviewMutationScopeError'
  }
}

export class PreviewTransaction implements TransactionAPI {
  private current: DocumentSchema
  private forward: readonly Patch[] = []
  private inverse: readonly Patch[] = []
  private closed = false
  private report: PreviewValidationReport | null = null
  private queuedRecipes: DocumentRecipe[] | null = null

  constructor(
    private readonly base: DocumentSchema,
    private readonly baseIndex: DocumentIndexSnapshot,
    private readonly options: DocumentTransactionOptions,
    private readonly publish: (payload: PreviewPublishPayload) => PreviewValidationReport,
    private readonly finalize: (payload: PreviewCommitPayload | null) => void,
  ) {
    this.current = base
  }

  get isOpen(): boolean { return !this.closed }
  get validationReport(): PreviewValidationReport | null { return this.report }

  getOperationContext(): TransactionOperationContext {
    return {
      sessionPath: this.options.operation.sessionPath,
      selectionLineage: this.options.operation.selectionLineage,
    }
  }

  replace(recipe: DocumentRecipe): void {
    this.assertOpen()
    const [next, forward, inverse] = create(this.base, recipe, {
      enablePatches: true,
      enableAutoFreeze: true,
      mark: markSimpleObject,
    })
    const candidate = next as unknown as DocumentSchema
    const report = this.publish({ document: candidate, forward, inverse })
    this.assertOpen()
    this.current = candidate
    this.forward = forward
    this.inverse = inverse
    this.report = report
  }

  /** Replace the current preview with a mutation constrained to one node and its declared paths. */
  replaceNode(
    nodeId: string,
    paths: readonly `/${string}`[] | readonly string[],
    writer: (node: MaterialNode) => void,
  ): void {
    this.assertOpen()
    const nodePath = this.baseIndex.getNodePath(nodeId)
    if (!nodePath)
      throw new Error(`Document node "${nodeId}" not found`)
    const declared = paths.map(decodePointer)
    const [next, forward, inverse] = create(this.base, (draft) => {
      writer(this.baseIndex.resolveNode(draft as DocumentSchema, nodeId))
    }, {
      enablePatches: true,
      enableAutoFreeze: true,
      mark: markSimpleObject,
    })
    validateScopedPatches(forward, nodePath, declared)
    validateScopedPatches(inverse, nodePath, declared)
    const candidate = next as unknown as DocumentSchema
    const report = this.publish({ document: candidate, forward, inverse })
    this.assertOpen()
    this.current = candidate
    this.forward = forward
    this.inverse = inverse
    this.report = report
  }

  run<TNode extends MaterialNode = MaterialNode, TResult = void>(
    nodeId: string,
    mutator: (draft: TNode) => TResult,
    _options?: TxOptions,
  ): TResult | void {
    let result: TResult | undefined
    const recipe: DocumentRecipe = (draft) => {
      result = mutator(this.baseIndex.resolveNode(draft, nodeId) as TNode)
    }
    if (this.queuedRecipes)
      this.queuedRecipes.push(recipe)
    else
      this.replace(recipe)
    return result
  }

  batch<T>(fn: () => T): T {
    this.assertOpen()
    if (this.queuedRecipes)
      return fn()
    this.queuedRecipes = []
    try {
      const result = fn()
      const recipes = this.queuedRecipes
      this.queuedRecipes = null
      if (recipes.length > 0) {
        this.replace((draft) => {
          for (const recipe of recipes)
            recipe(draft)
        })
      }
      return result
    }
    catch (error) {
      this.queuedRecipes = null
      throw error
    }
  }

  commit(): void {
    this.assertOpen()
    this.finalize(this.forward.length === 0
      ? null
      : {
          document: this.current,
          forward: this.forward,
          inverse: this.inverse,
          options: this.options,
        })
    this.closed = true
  }

  cancel(): void {
    if (this.closed)
      return
    this.finalize(null)
    this.closed = true
  }

  private assertOpen(): void {
    if (this.closed)
      throw new Error('PreviewTransaction is closed')
  }
}

function validateScopedPatches(
  patches: readonly Patch[],
  nodePath: readonly (string | number)[],
  declared: readonly (readonly string[])[],
): void {
  for (const patch of patches) {
    const path = Array.isArray(patch.path) ? patch.path : decodePointer(String(patch.path))
    if (!startsWithSegments(path, nodePath))
      throw new PreviewMutationScopeError(path)
    const relative = path.slice(nodePath.length)
    if (!declared.some(scope => startsWithSegments(relative, scope)))
      throw new PreviewMutationScopeError(path)
  }
}

function startsWithSegments(path: readonly (string | number)[], prefix: readonly (string | number)[]): boolean {
  return prefix.length <= path.length && prefix.every((segment, index) => String(segment) === String(path[index]))
}

function decodePointer(path: string): string[] {
  if (path === '')
    return []
  if (!path.startsWith('/'))
    throw new PreviewMutationScopeError([])
  return path.slice(1).split('/').map(token => token.replaceAll('~1', '/').replaceAll('~0', '~'))
}

function encodePointer(path: readonly (string | number)[]): string {
  return path.length === 0 ? '' : `/${path.map(segment => String(segment).replaceAll('~', '~0').replaceAll('/', '~1')).join('/')}`
}
