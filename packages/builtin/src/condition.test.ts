import { describe, expect, it } from 'vitest'
import { builtinAllMaterialPackage } from './index'

describe('builtin condition declarations', () => {
  it('keeps condition policy in the common manifest facet', () => {
    const text = builtinAllMaterialPackage.manifests.find(manifest => manifest.type === 'text')
    expect(text?.common.condition).toEqual({ scope: 'node', hiddenEffects: ['remove', 'reserve'] })
  })
})
