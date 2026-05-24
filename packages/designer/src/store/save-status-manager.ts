import type { StatusBarState } from '../types'

export class SaveStatusManager {
  markDraftModified(status: StatusBarState): void {
    status.draft = 'modified'
  }

  queueSave(status: StatusBarState): void {
    status.draft = 'modified'
    status.savePhase = 'queued'
    status.saveMessage = undefined
  }

  startSave(status: StatusBarState): void {
    status.savePhase = 'saving'
    status.saveMessage = undefined
  }

  completeSave(status: StatusBarState): void {
    status.draft = 'clean'
    status.savePhase = 'success'
    status.saveMessage = undefined
    status.saveUpdatedAt = Date.now()
  }

  failSave(status: StatusBarState, message?: string): void {
    status.draft = 'modified'
    status.savePhase = 'failed'
    status.saveMessage = message
    status.saveUpdatedAt = Date.now()
  }

  resetSaveIndicator(status: StatusBarState): void {
    status.savePhase = 'idle'
    status.saveMessage = undefined
  }

  resetTemplateSaveState(status: StatusBarState): void {
    status.draft = 'clean'
    status.savePhase = 'idle'
    status.saveMessage = undefined
    status.saveUpdatedAt = undefined
  }
}
