import { resolveMaterialConditionCapability } from '@easyink/core'
import { describe, expect, it } from 'vitest'
import { materials as designer } from './all/designer'
import { materials as viewer } from './all/viewer'
import { materials as basicDesigner } from './basic/designer'
import { materials as basicViewer } from './basic/viewer'

describe('builtin conditional rendering capabilities', () => {
  it('preserves framework default conditions when text/image declare them in the shared model', () => {
    const expected = { scope: 'node', hiddenEffects: ['remove', 'reserve'] }
    for (const collection of [designer, viewer, basicDesigner, basicViewer]) {
      expect(collection.filter(material => material.model.condition !== undefined).map(material => material.model.type)).toEqual(['text', 'image'])
      for (const material of collection)
        expect(resolveMaterialConditionCapability(material.model.condition)).toEqual(expected)
    }
    for (const material of designer)
      expect(material.model).toBe(viewer.find(candidate => candidate.model.type === material.model.type)!.model)
  })
})
