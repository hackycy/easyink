import type { AIMaterialDescriptor } from '@easyink/shared'
import { builtinDesignerMaterialBundle } from './designer'

export const builtinAIMaterialDescriptors: AIMaterialDescriptor[] = builtinDesignerMaterialBundle.materials
  .map(material => material.aiDescriptor)
  .filter((descriptor): descriptor is AIMaterialDescriptor => !!descriptor)
