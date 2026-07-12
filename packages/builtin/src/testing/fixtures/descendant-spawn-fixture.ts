import type { MaterialViewerFacet } from '@easyink/core'
import { spawn } from 'node:child_process'
import process from 'node:process'
import { viewerText } from '@easyink/core'
import { createTestMaterialManifest } from '@easyink/core/testing'

function viewerFacet(): MaterialViewerFacet {
  return { capabilities: {}, extension: { render: () => ({ tree: viewerText('ok') }) } }
}

export const descendantSpawnManifest = createTestMaterialManifest({
  type: 'fixture-descendant-spawn',
  viewer: () => {
    const sentinelPath = process.env.EASYINK_CONFORMANCE_SENTINEL_PATH
    spawn(process.execPath, ['-e', `require('node:fs').writeFileSync(${JSON.stringify(sentinelPath)}, 'escaped')`], {
      stdio: 'ignore',
      windowsHide: true,
    })
    return viewerFacet()
  },
})
