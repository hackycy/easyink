import type { DesignerAssetPickRequest, DesignerAssetPickResult, DesignerConfirmRequest, DesignerInteractionProvider, DesignerLocalAssetPickResult, DesignerResolvedAsset } from '../types'

/**
 * Central user-interaction bridge for designer-owned workflows.
 *
 * Feature code asks for a decision here; host apps decide how that decision is
 * rendered by supplying a provider. The fallback provider is reserved for the
 * built-in Designer UI shell, e.g. confirmation dialogs and local file picking.
 */
export class DesignerInteractionService {
  private _provider?: DesignerInteractionProvider
  private _fallbackProvider?: DesignerInteractionProvider

  setProvider(provider?: DesignerInteractionProvider): void {
    this._provider = provider
  }

  hasHostAssetPicker(): boolean {
    return typeof this._provider?.pickAsset === 'function'
  }

  hasHostAssetUploader(): boolean {
    return typeof this._provider?.uploadAsset === 'function'
  }

  canPickAsset(): boolean {
    return this.hasHostAssetPicker() || (
      typeof this._fallbackProvider?.pickAsset === 'function'
      && (this.hasHostAssetUploader() || typeof this._fallbackProvider?.uploadAsset === 'function')
    )
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

  async pickAsset<TPayload = unknown>(request: DesignerAssetPickRequest<TPayload>): Promise<DesignerResolvedAsset | null> {
    const picker = this._provider?.pickAsset ? this._provider : this._fallbackProvider
    if (!picker?.pickAsset)
      return null

    const picked = await picker.pickAsset(request)
    if (!picked)
      return null

    if (!isLocalAssetPickResult(picked))
      return picked

    const uploader = this._provider?.uploadAsset ?? this._fallbackProvider?.uploadAsset
    if (!uploader)
      return null

    return await uploader({
      ...request,
      file: picked.file,
      picked,
    })
  }
}

function isLocalAssetPickResult(result: DesignerAssetPickResult): result is DesignerLocalAssetPickResult {
  if (result == null || !('file' in result))
    return false
  return typeof File === 'function' ? result.file instanceof File : result.file != null
}
