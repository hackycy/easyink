import type { DocumentOperationDescriptor, DocumentTransactionEngine, PreviewTransaction } from '@easyink/core'
import type { PointerGestureHandle } from '@easyink/shared'
import { createPointerGesture } from '@easyink/shared'

export interface BeginGestureOptions {
  target: HTMLElement
  event: PointerEvent
  label: string
  mergeKey?: string
  operation: DocumentOperationDescriptor
  update: (event: PointerEvent, preview: PreviewTransaction) => void
  onFinish?: (reason: 'commit' | 'cancel') => void
}

export interface GestureHandle {
  abort: () => void
  isActive: () => boolean
}

interface ActiveGesture {
  abort: () => void
}

export class GestureCoordinator {
  private active: ActiveGesture | null = null

  constructor(private readonly transactions: DocumentTransactionEngine) {}

  begin(options: BeginGestureOptions): GestureHandle {
    this.cancelActive()
    const preview = this.transactions.beginPreview({
      label: options.label,
      mergeKey: options.mergeKey,
      operation: options.operation,
    })
    let active = true
    let pointer: PointerGestureHandle | null = null
    let finish!: (reason: 'commit' | 'cancel') => void
    const ownership: ActiveGesture = {
      abort: () => {
        if (!active)
          return
        if (pointer)
          pointer.abort()
        else
          finish('cancel')
      },
    }

    finish = (reason: 'commit' | 'cancel'): void => {
      if (!active)
        return
      active = false
      if (this.active === ownership)
        this.active = null

      let primaryError: unknown
      let failed = false
      try {
        if (reason === 'commit')
          preview.commit()
        else
          preview.cancel()
      }
      catch (error) {
        primaryError = error
        failed = true
        try {
          preview.cancel()
        }
        catch {
          // Preserve the original finalization error.
        }
      }
      try {
        options.onFinish?.(reason)
      }
      catch (error) {
        if (!failed) {
          primaryError = error
          failed = true
        }
      }
      if (failed)
        throw primaryError
    }

    this.active = ownership
    try {
      pointer = createPointerGesture({
        target: options.target,
        event: options.event,
        onMove: (event) => {
          try {
            options.update(event, preview)
          }
          catch (error) {
            try {
              ownership.abort()
            }
            catch {
              // Preserve the update error while teardown remains best-effort.
            }
            throw error
          }
        },
        onEnd: (_event, reason) => finish(reason),
      })
      if (!active)
        pointer.abort()
    }
    catch (error) {
      if (active) {
        try {
          finish('cancel')
        }
        catch {
          // Preserve the pointer setup error.
        }
      }
      throw error
    }

    return {
      abort: ownership.abort,
      isActive: () => active,
    }
  }

  cancelActive(): void {
    const active = this.active
    if (!active)
      return
    this.active = null
    active.abort()
  }
}
