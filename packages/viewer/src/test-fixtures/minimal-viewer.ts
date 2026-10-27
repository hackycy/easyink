import type { ViewerMaterial } from '@easyink/plugin-api/viewer'
import type { DisposeResult } from '@easyink/plugin-runtime'
import type { ViewerOptions } from '@easyink/viewer'
import { materials } from '@easyink/builtin/all/viewer'
import { materials as basic } from '@easyink/builtin/basic/viewer'
import { materials as none } from '@easyink/builtin/none'
import { image } from '@easyink/material-image/viewer'
import { text } from '@easyink/material-text/viewer'
import { createViewer, ViewerRuntime } from '@easyink/viewer'

export function createAllViewer(options: ViewerOptions = {}) {
  return createViewer({ materials, ...options })
}

export const collections: readonly (readonly ViewerMaterial[])[] = [materials, basic, none, [text, image]]

export async function consume() {
  const pending: Promise<ViewerRuntime> = createViewer({ materials: [text, image] })
  // @ts-expect-error Creation delivers a ready Viewer asynchronously.
  const synchronous: ViewerRuntime = createViewer({ materials: none })
  const viewer = await pending
  // @ts-expect-error The old synchronous constructor is private.
  const legacy = new ViewerRuntime()
  // @ts-expect-error Viewer cannot register materials after creation.
  viewer.registerMaterial(text)
  // @ts-expect-error Viewer does not expose a writable material registry.
  const registry = viewer.materialRegistry
  // @ts-expect-error Viewer cannot install Designer extensions.
  createViewer({ materials: none, extensions: [{ id: 'ui' }] })
  // @ts-expect-error A selected material must provide a Viewer renderer.
  createViewer({ materials: [{ model: text.model }] })
  const disposal: Promise<DisposeResult> = viewer.destroy()
  return { synchronous, legacy, registry, disposal }
}
