const MIN_ZOOM_PERCENT = 25
const MAX_ZOOM_PERCENT = 400
const ZOOM_STEP_PERCENT = 5

export function getNextTopbarZoom(currentZoom: number, direction: -1 | 1): number {
  const currentPercent = Math.round(currentZoom * 100)
  const nextPercent = direction > 0
    ? Math.floor(currentPercent / ZOOM_STEP_PERCENT) * ZOOM_STEP_PERCENT + ZOOM_STEP_PERCENT
    : Math.ceil(currentPercent / ZOOM_STEP_PERCENT) * ZOOM_STEP_PERCENT - ZOOM_STEP_PERCENT

  return Math.min(MAX_ZOOM_PERCENT, Math.max(MIN_ZOOM_PERCENT, nextPercent)) / 100
}
