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
    const forbiddenEnvironment = ['EASYINK_TEST_SECRET', 'NODE_OPTIONS', 'NODE_PATH', 'NODE_REPL_EXTERNAL_MODULE', 'NODE_V8_COVERAGE', 'LD_PRELOAD']
    const leaked = [...forbiddenEnvironment.filter(key => process.env[key]), ...Object.keys(process.env).filter(key => key.startsWith('TSX_') || key.startsWith('DYLD_'))]
    if (leaked.length > 0)
      throw new Error(`CONFORMANCE_ISOLATED_ENVIRONMENT_LEAKED:${leaked.join(',')}`)
    const sentinelPath = process.argv.find(argument => argument.startsWith('--sentinel='))?.slice('--sentinel='.length)
    spawn(process.execPath, ['-e', `require('node:fs').writeFileSync(${JSON.stringify(sentinelPath)}, 'escaped')`], {
      stdio: 'ignore',
      windowsHide: true,
    })
    return viewerFacet()
  },
})
