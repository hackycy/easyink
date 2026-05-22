import type { PageBackground } from '@easyink/schema'

export function resolvePageBackgroundStyle(
  bg: PageBackground | undefined,
  unit: string,
): Record<string, string> {
  if (!bg) {
    return { backgroundColor: '#fff' }
  }

  const style: Record<string, string> = {
    backgroundColor: bg.color || '#fff',
  }

  if (!bg.image)
    return style

  style.backgroundImage = `url(${JSON.stringify(bg.image)})`

  const repeat = bg.repeat || 'none'
  if (repeat === 'full') {
    style.backgroundSize = '100% 100%'
    style.backgroundRepeat = 'no-repeat'
  }
  else {
    style.backgroundRepeat = repeat === 'repeat' || repeat === 'repeat-x' || repeat === 'repeat-y'
      ? repeat
      : 'no-repeat'

    if (bg.width != null && bg.height != null) {
      style.backgroundSize = `${bg.width}${unit} ${bg.height}${unit}`
    }
    else if (bg.width != null) {
      style.backgroundSize = `${bg.width}${unit} auto`
    }
    else if (bg.height != null) {
      style.backgroundSize = `auto ${bg.height}${unit}`
    }
  }

  if (bg.offsetX != null || bg.offsetY != null) {
    const x = bg.offsetX ?? 0
    const y = bg.offsetY ?? 0
    style.backgroundPosition = `${x}${unit} ${y}${unit}`
  }

  return style
}
