import type { DesignerMaterial } from '@easyink/plugin-api/ui'
import type { HostConfig } from '@easyink/plugin-runtime'
import { createHost } from '@easyink/plugin-runtime'
import { defineComponent } from 'vue'
import { designerMaterial, viewerMaterial } from './material'

export async function consume() {
  const viewer = await createHost({ kind: 'viewer', materials: [viewerMaterial('viewer')] })
  const material = viewer.registry.getMaterial('viewer')!
  // @ts-expect-error Registry consumers cannot change model identity.
  material.value.model.type = 'replacement'
  // @ts-expect-error Registry consumers cannot change nested model binding.
  material.value.model.binding.kind = 'custom'
  // @ts-expect-error Array snapshots cannot install new contributions.
  viewer.registry.materials.push(material)
  // @ts-expect-error The Host exposes no registration API.
  viewer.registerMaterial(viewerMaterial('new'))
  // @ts-expect-error Viewer creation cannot use a Designer renderer.
  const wrongRenderer: HostConfig<ReturnType<typeof designerMaterial>> = { kind: 'viewer', materials: [designerMaterial('wrong')] }
  // @ts-expect-error Viewer creation cannot use Designer extensions.
  const wrongExtension: HostConfig<ReturnType<typeof viewerMaterial>> = { kind: 'viewer', materials: [], extensions: [{ id: 'wrong' }] }
  await viewer.destroy()
  return { wrongRenderer, wrongExtension }
}

const material: DesignerMaterial = {
  ...designerMaterial('ui'),
  ui: { properties: { component: defineComponent({ props: ['context'] }) } },
}
// The runtime accepts /ui declarations structurally without importing Vue itself.
export const designer = () => createHost({ kind: 'designer', materials: [material] })
