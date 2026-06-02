export function serializeViewerPage(page: HTMLElement): string {
  const sourceCanvases = Array.from(page.querySelectorAll('canvas'))
  if (sourceCanvases.length === 0)
    return page.outerHTML

  const clone = page.cloneNode(true) as HTMLElement
  inlineCanvasBitmaps(sourceCanvases, clone)
  return clone.outerHTML
}

function inlineCanvasBitmaps(sourceCanvases: HTMLCanvasElement[], cloneRoot: HTMLElement): void {
  const cloneCanvases = Array.from(cloneRoot.querySelectorAll('canvas'))

  for (let index = 0; index < cloneCanvases.length; index++) {
    const source = sourceCanvases[index]
    const clone = cloneCanvases[index]
    if (!source || !clone)
      continue

    const dataUrl = readCanvasDataUrl(source)
    if (!dataUrl)
      continue

    clone.replaceWith(createImageFromDataUrl(clone.ownerDocument, dataUrl, clone.getAttribute('style')))
  }
}

function readCanvasDataUrl(canvas: HTMLCanvasElement): string | undefined {
  try {
    return canvas.toDataURL('image/png')
  }
  catch {
    return undefined
  }
}

function createImageFromDataUrl(document: Document, dataUrl: string, style: string | null): HTMLImageElement {
  const image = document.createElement('img')
  image.src = dataUrl
  image.style.display = 'block'
  image.style.width = '100%'
  image.style.height = '100%'
  image.style.objectFit = 'contain'
  if (style)
    image.setAttribute('style', `${style};${image.getAttribute('style') ?? ''}`)
  return image
}
