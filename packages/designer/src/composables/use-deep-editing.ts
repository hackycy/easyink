import type { DesignerStore } from '../store/designer-store'
import type { DeepEditingDefinition, DeepEditingPhase, MaterialDesignerExtension } from '../types'

export interface DeepEditingContext {
  store: DesignerStore
  getPageEl: () => HTMLElement | null
  getScrollEl: () => HTMLElement | null
}

interface ActiveSession {
  nodeId: string
  definition: DeepEditingDefinition
  extension: MaterialDesignerExtension
  currentPhase: DeepEditingPhase
  overlayContainer: HTMLElement
  toolbarContainer: HTMLElement
}

/**
 * Generic deep editing FSM orchestrator.
 * Manages phase lifecycle, transition routing, and keyboard delegation
 * for any material that declares a DeepEditingDefinition.
 */
export function useDeepEditing(ctx: DeepEditingContext) {
  let session: ActiveSession | null = null

  function findPhase(definition: DeepEditingDefinition, phaseId: string): DeepEditingPhase | undefined {
    return definition.phases.find(p => p.id === phaseId)
  }

  function makeContainers(overlayEl: HTMLElement, toolbarEl: HTMLElement) {
    return {
      overlay: overlayEl,
      toolbar: toolbarEl,
      requestTransition: (phaseId: string) => transitionTo(phaseId),
    }
  }

  /**
   * Enter deep editing for a node. Creates overlay/toolbar containers
   * and transitions to the initial phase.
   */
  function enter(nodeId: string, overlayEl: HTMLElement, toolbarEl: HTMLElement): boolean {
    const { store } = ctx
    const node = store.getElementById(nodeId)
    if (!node)
      return false

    const ext = store.getDesignerExtension(node.type)
    if (!ext?.deepEditing)
      return false

    const definition = ext.deepEditing
    const initialPhase = findPhase(definition, definition.initialPhase)
    if (!initialPhase)
      return false

    // Enter store-level deep editing state
    store.enterDeepEditing(nodeId)

    session = {
      nodeId,
      definition,
      extension: ext,
      currentPhase: initialPhase,
      overlayContainer: overlayEl,
      toolbarContainer: toolbarEl,
    }

    // Enter initial phase
    initialPhase.onEnter(makeContainers(overlayEl, toolbarEl), node)

    return true
  }

  /** Exit deep editing entirely, cleaning up the current phase. */
  function exit(): void {
    if (!session)
      return

    session.currentPhase.onExit()
    ctx.store.exitDeepEditing()
    session = null
  }

  /** Transition to a named phase. */
  function transitionTo(phaseId: string): boolean {
    if (!session)
      return false

    const { store } = ctx
    const nextPhase = findPhase(session.definition, phaseId)
    if (!nextPhase)
      return false

    const node = store.getElementById(session.nodeId)
    if (!node)
      return false

    // Exit current phase
    session.currentPhase.onExit()

    // Update state
    session.currentPhase = nextPhase
    store.transitionPhase(phaseId)

    // Enter new phase
    nextPhase.onEnter(
      makeContainers(session.overlayContainer, session.toolbarContainer),
      node,
    )

    return true
  }

  /**
   * Process keyboard events. Delegates to phase keyboard handler first,
   * then checks for 'escape' transitions.
   */
  function handleKeyDown(e: KeyboardEvent): boolean {
    if (!session)
      return false

    const { store } = ctx
    const node = store.getElementById(session.nodeId)
    if (!node)
      return false

    // Phase keyboard handler gets first shot
    if (session.currentPhase.keyboardHandler) {
      const handled = session.currentPhase.keyboardHandler.handleKey(e, node)
      if (handled)
        return true
    }

    // Check for escape transition
    if (e.key === 'Escape') {
      const escapeTransition = session.currentPhase.transitions.find(
        t => t.trigger === 'escape',
      )
      if (escapeTransition) {
        e.preventDefault()
        e.stopPropagation()
        transitionTo(escapeTransition.to)
        return true
      }
      // No escape transition = exit deep editing entirely
      e.preventDefault()
      e.stopPropagation()
      exit()
      return true
    }

    return false
  }

  /** Whether a session is active. */
  function isActive(): boolean {
    return session !== null
  }

  /** Get the current active session's node ID. */
  function getNodeId(): string | undefined {
    return session?.nodeId
  }

  /** Get the current phase ID. */
  function getCurrentPhaseId(): string | undefined {
    return session?.currentPhase.id
  }

  return {
    enter,
    exit,
    transitionTo,
    handleKeyDown,
    isActive,
    getNodeId,
    getCurrentPhaseId,
  }
}
