import type { AIMaterialDescriptor } from '@easyink/shared'
import { builtinAllMaterialPackage } from './index'

export const builtinAIMaterialDescriptors = builtinAllMaterialPackage.manifests
  .map(manifest => manifest.facets.ai?.descriptor)
  .filter(descriptor => descriptor !== undefined) as unknown as AIMaterialDescriptor[]
