import type { MaterialPackageRegistration, MaterialViewerFacet } from '@easyink/core'
import { writeFileSync } from 'node:fs'
import process from 'node:process'
import { defineMaterialFacetFactory, viewerText } from '@easyink/core'
import { createTestMaterialManifest } from '@easyink/core/testing'

function viewerFacet(): MaterialViewerFacet {
  return { capabilities: {}, extension: { render: () => ({ tree: viewerText('ok') }) } }
}

const syncInfinite = createTestMaterialManifest({
  type: 'fixture-sync-infinite',
  schemaAdapter: {
    ...createTestMaterialManifest({ type: 'fixture-sync-adapter' }).schemaAdapter,
    normalize: () => {
      while (true)
        continue
    },
  },
  viewer: () => viewerFacet(),
})

const asyncInfinite = createTestMaterialManifest({
  type: 'fixture-async-infinite',
  viewer: defineMaterialFacetFactory('async-isolated', async () => {
    await new Promise(resolve => setTimeout(resolve, 10))
    while (true)
      continue
  }),
})

const scheduledAfterReport = createTestMaterialManifest({
  type: 'fixture-scheduled-after-report',
  viewer: () => {
    setTimeout(() => {
      void Promise.resolve().then(() => {
        const sentinelPath = process.argv.find(argument => argument.startsWith('--sentinel='))?.slice('--sentinel='.length)
        if (sentinelPath)
          writeFileSync(sentinelPath, 'escaped')
        while (true)
          continue
      })
    }, 100)
    return viewerFacet()
  },
})

const childCrash = createTestMaterialManifest({
  type: 'fixture-child-crash',
  viewer: () => {
    process.exit(17)
  },
})

export const isolatedMaterialFixturePackage: MaterialPackageRegistration = Object.freeze({
  packageId: '@easyink/isolated-material-fixtures',
  kind: 'external',
  required: false,
  manifests: Object.freeze([syncInfinite, asyncInfinite, scheduledAfterReport, childCrash]),
})
