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
