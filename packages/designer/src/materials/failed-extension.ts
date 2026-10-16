import type { DesignerRenderInstance } from '@easyink/plugin-api/designer'
import { watchEffect } from 'vue'

/** Failure state belongs to one Host and type; each canvas mount owns its listeners. */
export function createFailedExtension(t: (key: string) => string, retry: () => void, signal: AbortSignal): DesignerRenderInstance {
  return {
    renderContent: (_node, container) => {
      const document = container.ownerDocument
      const placeholder = document.createElement('div')
      placeholder.style.cssText = 'width:100%;height:100%;display:flex;align-items:center;justify-content:center;gap:4px;background:#fff3f3;border:1px dashed #ff4d4f;color:#ff4d4f;font-size:12px;box-sizing:border-box;'
      const message = document.createElement('span')
      const button = document.createElement('button')
      button.type = 'button'
      button.style.pointerEvents = 'auto'
      const stop = (event: Event) => event.stopPropagation()
      const onRetry = (event: Event) => {
        event.stopPropagation()
        retry()
      }
      button.addEventListener('pointerdown', stop)
      button.addEventListener('dblclick', stop)
      button.addEventListener('click', onRetry)
      placeholder.append(message, button)
      container.dataset.materialDiagnostic = 'MATERIAL_LOAD_ERROR'
      container.replaceChildren(placeholder)
      const stopLocale = watchEffect(() => {
        message.textContent = t('designer.diagnostic.materialLoadFailed')
        button.textContent = t('designer.action.retry')
      })
      const cleanup = () => {
        stopLocale()
        button.removeEventListener('pointerdown', stop)
        button.removeEventListener('dblclick', stop)
        button.removeEventListener('click', onRetry)
        signal.removeEventListener('abort', cleanup)
        container.replaceChildren()
        delete container.dataset.materialDiagnostic
      }
      signal.addEventListener('abort', cleanup, { once: true })
      return cleanup
    },
  }
}
