import type { ViewerOptions, ViewerRenderCompleted, ViewerRenderResult } from '@easyink/viewer'
import { materials } from '@easyink/builtin/all/viewer'
import { createViewer, normalizeDocumentSchema } from '@easyink/viewer'

type ViewerMaterial = NonNullable<ViewerOptions['materials']>[number]

function assert(value: unknown, message: string): asserts value {
  if (!value)
    throw new Error(message)
}

function completed(result: ViewerRenderResult): ViewerRenderCompleted {
  assert(result.status === 'completed', `Expected completion: ${JSON.stringify(result)}`)
  return result
}

const text = materials.find(material => material.model.type === 'text')!
const image = materials.find(material => material.model.type === 'image')!
function synchronousTextRenderer() {
  const renderer = text.renderer
  assert(renderer && 'render' in renderer, 'Text must have a synchronous renderer')
  return renderer
}
const textRenderer = synchronousTextRenderer()
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
const resource = (name: string, options = '') => `${location.origin}/readiness-fixture/${name}${options}`

function textSchema(font = 'Brand') {
  return normalizeDocumentSchema({
    unit: 'px',
    page: { mode: 'fixed', width: 240, height: 120, font },
    elements: [text.model.createDefaultNode({ id: 'text', width: 180, height: 30, props: { content: 'Resource check', fontFamily: font } })],
  })
}

function provider(source: string) {
  return {
    listFonts: async () => [{ family: 'Brand', displayName: 'Brand', weights: ['400'], styles: ['normal'] }],
    loadFont: async () => source,
  }
}

function mountIn(target: Document) {
  const mount = target.createElement('div')
  target.body.append(mount)
  return mount
}

export async function runResourceReadinessChecks() {
  const passed: string[] = []
  const failures: { name: string, message: string }[] = []
  async function check(name: string, run: () => Promise<void>) {
    try {
      await run()
      passed.push(name)
    }
    catch (cause) {
      failures.push({ name, message: cause instanceof Error ? cause.stack ?? cause.message : String(cause) })
    }
  }

  await check('font success in target iframe, readiness before measure and shared-family isolation', async () => {
    const frame = document.createElement('iframe')
    document.body.append(frame)
    const target = frame.contentDocument!
    const mount = mountIn(target)
    const seen: boolean[] = []
    const measured: ViewerMaterial = { model: text.model, renderer: { ...textRenderer, measure: (node) => {
      const font = String(node.props.fontFamily)
      const faces = [...target.fonts].filter(face => face.family.replaceAll('"', '') === font)
      seen.push(faces.length > 0 && faces.every(face => face.status === 'loaded'))
      return { width: node.width, height: node.height }
    } } }
    const viewer = await createViewer({ container: mount, materials: [measured, image], fontProvider: provider(resource('font-ok.ttf')) })
    const otherMount = mountIn(target)
    const other = await createViewer({ container: otherMount, materials: [text], fontProvider: provider(resource('font-failed.ttf', '?fail')) })
    try {
      const input = textSchema()
      input.elements.push(image.model.createDefaultNode({ id: 'iframe-image', y: 40, props: { src: resource('image-iframe.png') } }))
      const result = completed(await viewer.open({ schema: input }))
      assert(!result.diagnostics.some(event => event.scope === 'font'), 'Successful font produced diagnostics')
      assert(seen.length === 1 && seen[0], 'Font was not actually loaded before measurement')
      assert(mount.querySelector('.ei-viewer-page')?.ownerDocument === target, 'Output used the wrong document')
      const readyImage = mount.querySelector('img')!
      assert(readyImage.ownerDocument === target && readyImage.complete && readyImage.naturalWidth > 0, 'Image readiness used the wrong document')
      assert(!document.head.querySelector('[data-easyink-font]'), 'Font leaked into the ambient document')
      const fontName = (mount.querySelector('.ei-viewer-page') as HTMLElement).style.fontFamily
      const width = mount.querySelector('span')!.getBoundingClientRect().width
      const failed = completed(await other.open({ schema: textSchema() }))
      assert(failed.diagnostics.some(event => event.code === 'FONT_LOAD_FAILED'), 'Missing font failure diagnostic')
      assert((otherMount.querySelector('.ei-viewer-page') as HTMLElement).style.fontFamily === 'sans-serif', 'Failed font did not select fallback')
      await other.destroy()
      assert((mount.querySelector('.ei-viewer-page') as HTMLElement).style.fontFamily === fontName, 'Other cleanup changed font selection')
      assert(mount.querySelector('span')!.getBoundingClientRect().width === width, 'Other cleanup changed rendered geometry')
      assert([...target.fonts].some(face => face.family.replaceAll('"', '') === fontName && face.status === 'loaded'), 'Other cleanup removed owned font')
    }
    finally {
      await other.destroy()
      await viewer.destroy()
      frame.remove()
    }
  })

  await check('actual font timeout, late completion freezes fallback, rerender retries', async () => {
    const mount = mountIn(document)
    let source = resource('font-late.ttf', '?delay=3500')
    const viewer = await createViewer({ container: mount, materials: [text], fontProvider: { ...provider(source), loadFont: async () => source } })
    try {
      const started = performance.now()
      const result = completed(await viewer.open({ schema: textSchema() }))
      assert(performance.now() - started < 3400, 'Font budget did not finish before the response')
      assert(result.diagnostics.some(event => event.code === 'FONT_LOAD_TIMEOUT'), 'Missing font timeout diagnostic')
      const page = mount.querySelector('.ei-viewer-page') as HTMLElement
      const width = mount.querySelector('span')!.getBoundingClientRect().width
      await pause(750)
      assert(page.style.fontFamily === 'sans-serif', 'Late font changed fallback selection')
      assert(mount.querySelector('span')!.getBoundingClientRect().width === width, 'Late font changed committed geometry')
      source = resource('font-retry.ttf')
      const retry = completed(await viewer.render())
      assert(!retry.diagnostics.some(event => event.scope === 'font'), 'Rerender failed to retry font')
      assert((mount.querySelector('.ei-viewer-page') as HTMLElement).style.fontFamily.startsWith('ei-viewer-font-'), 'Retry did not use its ready face')
    }
    finally {
      await viewer.destroy()
      mount.remove()
    }
  })

  await check('destroy during actual font readiness revokes style and late publication', async () => {
    const mount = mountIn(document)
    const viewer = await createViewer({ container: mount, materials: [text], fontProvider: provider(resource('font-destroy.ttf', '?delay=600')) })
    const events: unknown[] = []
    const pending = viewer.open({ schema: textSchema(), onDiagnostic: event => events.push(event) })
    // Wait until the browser owns a loading face, then cancel its request.
    const deadline = performance.now() + 1000
    while (![...document.fonts].some(face => face.status === 'loading')) {
      assert(performance.now() < deadline, 'Browser never entered actual font readiness')
      await pause(10)
    }
    const started = performance.now()
    await viewer.destroy()
    const result = await pending
    assert(result.status === 'cancelled' && result.reason === 'destroyed', 'Destroy did not cancel font readiness')
    assert(performance.now() - started < 300, 'Destroy waited for external font readiness')
    await pause(650)
    assert(!document.head.querySelector('[data-easyink-font]'), 'Late font retained an owned style')
    assert(!mount.childElementCount && !viewer.renderedPages.length && !events.length, 'Late font published destroyed output')
    mount.remove()
  })

  await check('actual image success, failure, timeout, background failure and late completion', async () => {
    const mount = mountIn(document)
    const schema = normalizeDocumentSchema({ unit: 'px', page: { mode: 'fixed', width: 240, height: 120, background: { image: resource('background-failed.png', '?fail') } }, elements: [
      image.model.createDefaultNode({ id: 'ok', width: 40, height: 40, props: { src: resource('image-ok.png') } }),
      image.model.createDefaultNode({ id: 'failed', x: 50, width: 40, height: 40, props: { src: resource('image-failed.png', '?fail') } }),
      image.model.createDefaultNode({ id: 'late', x: 100, width: 40, height: 40, props: { src: resource('image-late.png', '?delay=3500') } }),
      text.model.createDefaultNode({ id: 'sibling', y: 50, props: { content: 'Still visible' } }),
    ] })
    const before = JSON.stringify(schema)
    const viewer = await createViewer({ container: mount, materials: [text, image] })
    try {
      const result = completed(await viewer.open({ schema }))
      const ok = mount.querySelector('[data-element-id="ok"] img') as HTMLImageElement
      assert(ok.complete && ok.naturalWidth > 0, 'Successful image was committed before decode')
      assert(result.diagnostics.some(event => event.code === 'IMAGE_LOAD_FAILED' && event.nodeId === 'failed'), 'Missing image failure diagnostic')
      assert(result.diagnostics.some(event => event.code === 'IMAGE_LOAD_TIMEOUT' && event.nodeId === 'late'), 'Missing image timeout diagnostic')
      assert(result.diagnostics.filter(event => event.code === 'IMAGE_LOAD_FAILED').length >= 2, 'Missing background failure diagnostic')
      assert(mount.textContent?.includes('Still visible'), 'Resource failure hid sibling content')
      assert((mount.querySelector('.ei-viewer-page') as HTMLElement).style.backgroundImage === 'none', 'Failed background remained live')
      assert(mount.querySelector('[data-resource-background-placeholder="image"]'), 'Failed background did not provide a visible placeholder')
      const html = mount.innerHTML
      await pause(750)
      assert(mount.innerHTML === html, 'Late image changed committed placeholder')
      assert(JSON.stringify(schema) === before, 'Resource fallback mutated caller Schema')
    }
    finally {
      await viewer.destroy()
      mount.remove()
    }
  })

  await check('destroy during actual image await returns cancellation and prevents late publication', async () => {
    const mount = mountIn(document)
    let rendered!: () => void
    const entered = new Promise<void>(resolve => rendered = resolve)
    const custom: ViewerMaterial = { model: image.model, renderer: { render: (_node, ctx) => {
      const element = ctx.document.createElement('img')
      element.src = resource('destroy.png', '?delay=600')
      rendered()
      return { element }
    } } }
    const viewer = await createViewer({ container: mount, materials: [custom] })
    const events: unknown[] = []
    const pending = viewer.open({ schema: normalizeDocumentSchema({ elements: [image.model.createDefaultNode()] }), onDiagnostic: event => events.push(event) })
    await entered
    await pause(50)
    const started = performance.now()
    await viewer.destroy()
    const result = await pending
    assert(result.status === 'cancelled' && result.reason === 'destroyed', 'Destroy did not cancel image wait')
    assert(performance.now() - started < 300, 'Destroy waited for external image request')
    await pause(650)
    assert(!mount.childElementCount && !viewer.renderedPages.length && !events.length, 'Late image published destroyed output')
    mount.remove()
  })

  await check('newer framework failure revokes image-await candidate and preserves old completed output', async () => {
    const mount = mountIn(document)
    let entered!: () => void
    const rendering = new Promise<void>(resolve => entered = resolve)
    const custom: ViewerMaterial = { model: image.model, renderer: { render: (_node, ctx) => {
      if (ctx.data.pending) {
        const element = ctx.document.createElement('img')
        element.src = resource('superseded.png', '?delay=600')
        entered()
        return { element }
      }
      const element = ctx.document.createElement('span')
      element.textContent = 'committed'
      return { element }
    } } }
    const viewer = await createViewer({ container: mount, materials: [custom] })
    try {
      await viewer.open({ schema: normalizeDocumentSchema({ elements: [image.model.createDefaultNode()] }) })
      const oldDOM = mount.firstChild
      const oldMetrics = JSON.stringify(viewer.renderedPages)
      const a = viewer.updateData({ pending: true })
      await rendering
      await pause(50)
      const failure = new Error('newer layout failure')
      const untap = viewer.hooks.beforePagePlan.tap(() => {
        throw failure
      })
      let cause: unknown
      try {
        await viewer.updateData({ pending: false })
      }
      catch (error) {
        cause = error
      }
      untap()
      assert(cause === failure, 'Framework failure did not reject')
      const result = await a
      assert(result.status === 'cancelled' && result.reason === 'superseded', 'Old request was not cancelled')
      await pause(650)
      assert(mount.firstChild === oldDOM && mount.textContent === 'committed', 'Old candidate overwrote the completed DOM')
      assert(JSON.stringify(viewer.renderedPages) === oldMetrics && viewer.renderState.status === 'failed', 'Old candidate published metrics/status')
    }
    finally {
      await viewer.destroy()
      mount.remove()
    }
  })

  await check('started output keeps actual canvas, listeners and fonts across preview replacement', async () => {
    const mount = mountIn(document)
    const released: string[] = []
    const signals = new Map<string, AbortSignal>()
    const fixture: ViewerMaterial = { model: image.model, renderer: { render: (_node, ctx) => {
      const value = String(ctx.data.value)
      const element = ctx.document.createElement('canvas')
      element.width = 20
      element.height = 10
      const canvas = element.getContext('2d')!
      canvas.fillStyle = value === 'A' ? '#ff0000' : '#0000ff'
      canvas.fillRect(0, 0, 20, 10)
      let events = 0
      const listener = () => {
        element.dataset.clicks = String(++events)
      }
      element.addEventListener('click', listener)
      signals.set(value, ctx.signal)
      ctx.onDispose(() => {
        element.removeEventListener('click', listener)
        element.remove()
        released.push(value)
      })
      return { element }
    } } }
    const schema = normalizeDocumentSchema({ unit: 'px', page: { mode: 'fixed', width: 240, height: 120, font: 'ReadinessFont' }, elements: [image.model.createDefaultNode()] })
    const viewer = await createViewer({ container: mount, materials: [fixture], fontProvider: provider(resource('font-output.ttf')) })
    const entered = Promise.withResolvers<void>()
    const finish = Promise.withResolvers<void>()
    let held!: HTMLElement
    viewer.registerExporter({ id: 'held', format: 'held', export: async (ctx) => {
      held = ctx.container!
      entered.resolve()
      await finish.promise
      assert(ctx.data?.value === 'A', 'Started output switched data version')
      assert(ctx.renderedPages?.[0].width === 240, 'Started output switched metrics')
      assert(held.isConnected, 'Held output lost its connected environment')
      const canvas = held.querySelector('canvas')!
      assert(canvas.getContext('2d')!.getImageData(0, 0, 1, 1).data[0] === 255, 'Actual canvas content was lost or replaced')
      canvas.click()
      assert(canvas.dataset.clicks === '1', 'Original output listener was removed')
      const family = (held.querySelector('.ei-viewer-page') as HTMLElement).style.fontFamily
      assert([...document.fonts].some(face => family.includes(face.family.replaceAll('"', '')) && face.status === 'loaded'), 'Held font was released early')
      return new Blob([canvas.toDataURL()], { type: 'text/plain' })
    } })
    try {
      completed(await viewer.open({ schema, data: { value: 'A' } }))
      const task = viewer.exportDocument('held')
      await entered.promise
      await viewer.updateData({ value: 'B' })
      assert(!signals.get('A')!.aborted && !released.includes('A'), 'Refresh cleaned an active output')
      finish.resolve()
      const result = await task
      assert(result.status === 'completed' && !!result.file, 'Export did not return a completed file')
      await pause(0)
      assert(signals.get('A')!.aborted && released.filter(value => value === 'A').length === 1, 'Last output user did not clean exactly once')
      assert(!held.isConnected, 'Finished old output container leaked')
    }
    finally {
      finish.resolve()
      await viewer.destroy()
      mount.remove()
    }
  })

  await check('output regeneration checks real fonts and images in its own target document', async () => {
    const mount = mountIn(document)
    const frame = document.createElement('iframe')
    document.body.appendChild(frame)
    await pause(0)
    const schema = normalizeDocumentSchema({ unit: 'px', page: { mode: 'fixed', width: 240, height: 120, font: 'ReadinessFont' }, elements: [
      text.model.createDefaultNode({ id: 'target-text', props: { content: 'output target' } }),
      image.model.createDefaultNode({ id: 'target-image', y: 40, width: 30, height: 30, props: { src: resource('image-output.png') } }),
    ] })
    const fonts = provider(resource('font-output-target.ttf'))
    const viewer = await createViewer({ container: mount, materials: [text, image], fontProvider: fonts })
    viewer.registerExporter({ id: 'target', format: 'target', export: async (ctx) => {
      const target = await createViewer({ iframe: frame, materials: [text, image], fontProvider: fonts })
      try {
        const result = completed(await target.open({ schema: ctx.schema, data: ctx.data }))
        assert(!result.diagnostics.some(event => event.scope === 'font' || event.code.startsWith('IMAGE_')), 'Output target was not ready')
        const targetDocument = frame.contentDocument!
        const img = targetDocument.querySelector('img') as HTMLImageElement
        assert(img.ownerDocument === targetDocument && img.complete && img.naturalWidth > 0, 'Image did not decode in the output document')
        const family = (targetDocument.querySelector('.ei-viewer-page') as HTMLElement).style.fontFamily
        assert([...targetDocument.fonts].some(face => family.includes(face.family.replaceAll('"', '')) && face.status === 'loaded'), 'Target document font was not loaded')
        assert(family !== (mount.querySelector('.ei-viewer-page') as HTMLElement).style.fontFamily, 'Cross-document output reused the preview font environment')
        for (const event of result.diagnostics)
          ctx.onDiagnostic?.(event)
        return new Blob(['ready'], { type: 'text/plain' })
      }
      finally {
        await target.destroy()
      }
    } })
    try {
      completed(await viewer.open({ schema }))
      const result = await viewer.exportDocument('target')
      assert(result.status === 'completed' && !!result.file, 'Target output did not complete')
      assert(!frame.contentDocument!.head.querySelector('[data-easyink-font]'), 'Target font cleanup leaked')
    }
    finally {
      await viewer.destroy()
      mount.remove()
      frame.remove()
    }
  })

  return { passed: passed.length, failed: failures.length, checks: passed, failures }
}
