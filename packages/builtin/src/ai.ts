import type { AIMaterialDescriptor } from '@easyink/shared'
import { createBuiltinDesignerMaterialBundle } from './designer'

const builtinDesignerMaterials = createBuiltinDesignerMaterialBundle('all').materials

export const builtinAIMaterialDescriptors: AIMaterialDescriptor[] = builtinDesignerMaterials.map(material => material.aiDescriptor).filter((descriptor): descriptor is AIMaterialDescriptor => !!descriptor)
