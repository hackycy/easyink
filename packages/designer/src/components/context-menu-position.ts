export interface ContextMenuPoint {
  x: number
  y: number
}

export interface ContextMenuSize {
  width: number
  height: number
}

export interface ContextMenuViewport {
  width: number
  height: number
}

const DEFAULT_VIEWPORT_MARGIN = 8

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

export function resolveContextMenuPosition(
  anchor: ContextMenuPoint,
  menu: ContextMenuSize,
  viewport: ContextMenuViewport,
  margin = DEFAULT_VIEWPORT_MARGIN,
): ContextMenuPoint {
  let x = anchor.x
  let y = anchor.y

  if (x + menu.width + margin > viewport.width)
    x = anchor.x - menu.width

  if (y + menu.height + margin > viewport.height)
    y = anchor.y - menu.height

  const maxX = Math.max(margin, viewport.width - menu.width - margin)
  const maxY = Math.max(margin, viewport.height - menu.height - margin)

  return {
    x: clamp(x, margin, maxX),
    y: clamp(y, margin, maxY),
  }
}
