export function normalizeClonedCaptureDocument(clonedDocument: Document, captureId: string): HTMLElement | undefined {
  const page = clonedDocument.querySelector<HTMLElement>(`[data-easyink-pdf-capture-id="${captureId}"]`)
  if (!page)
    return undefined

  isolateClonedCapturePage(page)

  page.style.display = 'block'
  page.style.position = 'relative'
  page.style.margin = '0'
  page.style.boxShadow = 'none'
  page.style.transform = 'none'
  page.style.transformOrigin = 'top left'
  page.style.overflow = 'hidden'
  page.style.backgroundColor = page.style.backgroundColor || '#ffffff'

  normalizeInlineSvgReferences(page, captureId)
  normalizeCaptureRoot(page)

  return page
}

function isolateClonedCapturePage(page: HTMLElement): void {
  const document = page.ownerDocument
  const mount = page.closest<HTMLElement>('#easyink-viewer-root')

  if (mount) {
    mount.replaceChildren(page)
    document.body?.replaceChildren(mount)
    return
  }

  document.body?.replaceChildren(page)
}

function normalizeCaptureRoot(page: HTMLElement): void {
  const mount = page.closest<HTMLElement>('#easyink-viewer-root')
  if (mount) {
    mount.style.padding = '0'
    mount.style.margin = '0'
    mount.style.background = '#ffffff'
    mount.style.overflow = 'visible'
  }

  page.ownerDocument.documentElement.style.background = '#ffffff'
  page.ownerDocument.body.style.margin = '0'
  page.ownerDocument.body.style.background = '#ffffff'
}

function normalizeInlineSvgReferences(root: HTMLElement, captureId: string): void {
  const svgs = Array.from(root.querySelectorAll<SVGSVGElement>('svg'))
  for (let svgIndex = 0; svgIndex < svgs.length; svgIndex++) {
    const svg = svgs[svgIndex]!
    const elements = [svg, ...Array.from(svg.querySelectorAll<Element>('*'))]
    const idMap = new Map<string, string>()

    for (const element of elements) {
      const id = element.getAttribute('id')
      if (!id || idMap.has(id))
        continue

      const scopedId = `${captureId}-svg-${svgIndex}-${id}`
      idMap.set(id, scopedId)
      element.setAttribute('id', scopedId)
    }

    if (idMap.size === 0)
      continue

    for (const element of elements) {
      for (const attr of Array.from(element.attributes)) {
        const rewritten = rewriteSvgReferenceValue(attr.value, idMap)
        if (rewritten !== attr.value)
          element.setAttribute(attr.name, rewritten)
      }
    }
  }
}

function rewriteSvgReferenceValue(value: string, idMap: Map<string, string>): string {
  let next = value

  for (const [id, scopedId] of idMap) {
    const escaped = escapeRegExp(id)
    next = next.replace(new RegExp(`url\\(\\s*(['"]?)#${escaped}\\1\\s*\\)`, 'g'), `url(#${scopedId})`)
    if (next === `#${id}`)
      next = `#${scopedId}`
  }

  return next
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
