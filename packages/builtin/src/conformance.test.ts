import type { BrowserDomCapabilities } from '@easyink/browser-dom'
import { runInNewContext } from 'node:vm'
import { createBrowserDomCapabilities, renderViewerTree } from '@easyink/browser-dom'
import { assertMaterialConformance } from '@easyink/core'
import { describe, it } from 'vitest'
import { builtinAllMaterialPackage } from './index'

describe('builtin material conformance', () => {
  for (const manifest of builtinAllMaterialPackage.manifests) {
    it(manifest.type, async () => {
      let capabilities: BrowserDomCapabilities | undefined
      await assertMaterialConformance(manifest, {
        hardTimeoutExecutor: {
          execute: (hook, args, timeoutMs) => runInNewContext('hook(...args)', { args, hook }, { timeout: timeoutMs }),
        },
        createRenderCapabilities: (facet) => {
          capabilities = createBrowserDomCapabilities({
            document,
            imperativeDom: facet.capabilities.imperativeDom ?? [],
          })
          return capabilities
        },
        mountViewerTree: (tree) => {
          if (!capabilities)
            throw new Error('CONFORMANCE_RENDER_CAPABILITIES_MISSING')
          const host = document.createElement('div')
          return renderViewerTree(host, tree, { capabilities, maxNodes: 50_000 })
        },
      })
    })
  }
})
