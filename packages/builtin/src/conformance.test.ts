import type { MaterialConformanceReport } from '@easyink/core'
import process from 'node:process'
import { beforeAll, describe, expect, it } from 'vitest'
import { builtinAllMaterialPackage } from './index'
import { runIsolatedMaterialConformance } from './testing/isolated-material-conformance'

const materialTypes = builtinAllMaterialPackage.manifests.map(manifest => manifest.type)
let reports: readonly MaterialConformanceReport[] = []
let childPid = 0

describe('builtin material conformance', () => {
  beforeAll(async () => {
    reports = await runIsolatedMaterialConformance({
      moduleSpecifier: '@easyink/builtin',
      exportName: 'builtinAllMaterialPackage',
    }, { deadlineMs: 15_000, onSpawn: pid => childPid = pid })
  }, 20_000)

  for (const materialType of materialTypes) {
    it(materialType, () => {
      expect(reports).toHaveLength(25)
      expect(reports.map(report => report.materialType)).toHaveLength(new Set(reports.map(report => report.materialType)).size)
      expect(reports.find(report => report.materialType === materialType)).toEqual(expect.objectContaining({ valid: true }))
      expect(() => process.kill(childPid, 0)).toThrow()
    })
  }
})
