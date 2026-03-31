import { computed, ref } from 'vue'

export interface CanvasOptions {
  initialZoom?: number
  minZoom?: number
  maxZoom?: number
  zoomStep?: number
}

export function useCanvas(options?: CanvasOptions) {
  const zoom = ref(options?.initialZoom ?? 1)
  const panX = ref(0)
  const panY = ref(0)
  const isPanning = ref(false)
  const renderVersion = ref(0)
  const minZoom = options?.minZoom ?? 0.25
  const maxZoom = options?.maxZoom ?? 4
  const zoomStep = options?.zoomStep ?? 0.1

  function setZoom(value: number): void {
    zoom.value = Math.max(minZoom, Math.min(maxZoom, value))
  }

  function zoomIn(): void {
    setZoom(zoom.value + zoomStep)
  }

  function zoomOut(): void {
    setZoom(zoom.value - zoomStep)
  }

  function resetZoom(): void {
    zoom.value = 1
    panX.value = 0
    panY.value = 0
  }

  function setPan(x: number, y: number): void {
    panX.value = x
    panY.value = y
  }

  function markRendered(): void {
    renderVersion.value += 1
  }

  const zoomPercent = computed(() => Math.round(zoom.value * 100))

  return { isPanning, markRendered, panX, panY, renderVersion, resetZoom, setPan, setZoom, zoom, zoomIn, zoomOut, zoomPercent }
}
