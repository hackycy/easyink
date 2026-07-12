import { describe, expect, it } from 'vitest'
import { builtinAllMaterialPackage, builtinCatalogGroupLabels, builtinMaterialIcons } from './index'

describe('builtin Designer host metadata', () => {
  it('resolves every manifest icon independently from facet semantics', () => {
    for (const manifest of builtinAllMaterialPackage.manifests)
      expect(builtinMaterialIcons[manifest.common.iconKey], manifest.type).toBeDefined()
  })

  it('resolves every catalog group label independently', () => {
    for (const manifest of builtinAllMaterialPackage.manifests)
      expect(builtinCatalogGroupLabels[manifest.facets.designer ? manifest.common.category as keyof typeof builtinCatalogGroupLabels : 'basic']).toBeDefined()
  })
})
