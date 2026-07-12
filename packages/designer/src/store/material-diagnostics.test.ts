import type { MaterialLoadDiagnostic, MaterialNodeLoadState } from '@easyink/core'
import { describe, expect, it } from 'vitest'
import { collectMaterialDiagnostics } from './material-diagnostics'

describe('collectMaterialDiagnostics', () => {
  it('combines top-level and node diagnostics with a stable code/path/nodeId key', () => {
    const first = diagnostic('MATERIAL_TYPE_UNKNOWN', '/elements/0', 'unknown')
    const duplicate = { ...first, message: 'duplicate copy' }
    const second = diagnostic('MATERIAL_NODE_READ_ONLY', '/elements/0', 'unknown')
    const states = new Map<string, MaterialNodeLoadState>([
      ['unknown', { status: 'quarantined', code: 'MATERIAL_TYPE_UNKNOWN', stage: 'resolve', diagnostics: [duplicate, second] }],
    ])

    expect(collectMaterialDiagnostics([first], states)).toEqual([first, second])
    expect(collectMaterialDiagnostics([first], states)).toEqual(collectMaterialDiagnostics([first], states))
  })
})

function diagnostic(code: MaterialLoadDiagnostic['code'], path: `/${string}`, nodeId: string): MaterialLoadDiagnostic {
  return { code, path, nodeId, severity: 'error', stage: 'resolve', message: code }
}
