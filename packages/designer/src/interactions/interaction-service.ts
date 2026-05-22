import type { DesignerConfirmRequest, DesignerInteractionProvider } from '../types'

/**
 * Central user-interaction bridge for designer-owned workflows.
 *
 * Feature code asks for a decision here; host apps decide how that decision is
 * rendered by supplying a provider. The fallback provider is reserved for the
 * built-in Designer UI shell.
 */
export class DesignerInteractionService {
  private _provider?: DesignerInteractionProvider
  private _fallbackProvider?: DesignerInteractionProvider

  setProvider(provider?: DesignerInteractionProvider): void {
    this._provider = provider
  }

  setFallbackProvider(provider?: DesignerInteractionProvider): void {
    this._fallbackProvider = provider
  }

  clearFallbackProvider(provider: DesignerInteractionProvider): void {
    if (this._fallbackProvider === provider)
      this._fallbackProvider = undefined
  }

  async confirm<TPayload = unknown>(request: DesignerConfirmRequest<TPayload>): Promise<boolean> {
    const provider = this._provider?.confirm ? this._provider : this._fallbackProvider
    if (!provider?.confirm)
      return false

    try {
      return (await provider.confirm(request)) === true
    }
    catch {
      return false
    }
  }
}
