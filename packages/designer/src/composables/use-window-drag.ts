import type { WorkspaceWindowState } from '../types'

export function useWindowDrag(
  getWindowState: () => WorkspaceWindowState,
  getAllWindows: () => WorkspaceWindowState[],
  getContainer: () => HTMLElement | null,
) {
  function onPointerDown(e: PointerEvent) {
    const win = getWindowState()
    const container = getContainer()
    if (!container)
      return

    const startX = e.clientX - win.x
    const startY = e.clientY - win.y

    // bring to front
    const maxZ = Math.max(...getAllWindows().map(w => w.zIndex))
    if (win.zIndex < maxZ) {
      win.zIndex = maxZ + 1
    }

    const el = e.currentTarget as HTMLElement
    el.setPointerCapture(e.pointerId)

    function onMove(ev: PointerEvent) {
      const rect = container!.getBoundingClientRect()
      const rulerSize = 20
      const maxX = rect.width - win.width
      const maxY = rect.height - 32 // keep at least titlebar visible
      win.x = Math.max(rulerSize, Math.min(maxX, ev.clientX - startX))
      win.y = Math.max(rulerSize, Math.min(maxY, ev.clientY - startY))
    }

    function onUp() {
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerup', onUp)
    }

    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerup', onUp)
  }

  return { onPointerDown }
}
