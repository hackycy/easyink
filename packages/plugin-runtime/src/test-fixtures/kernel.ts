import { createHost } from '@easyink/plugin-runtime'
import { viewerMaterial } from './material'

export * from '@easyink/plugin-runtime'
export const viewer = () => createHost({ kind: 'viewer', materials: [viewerMaterial('fixture')] })
