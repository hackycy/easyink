import type { BindingRef, MaterialBinding } from '@easyink/schema'
import { isDataContractBinding } from '@easyink/schema'
import { deepClone } from '@easyink/shared'

export function visitMaterialBindingRefs(
  binding: MaterialBinding | undefined,
  visitor: (binding: BindingRef, index: number | undefined) => void,
): void {
  if (!binding || isDataContractBinding(binding))
    return
  if (Array.isArray(binding)) {
    binding.forEach((item, index) => visitor(item, index))
    return
  }
  visitor(binding, undefined)
}

export function mapMaterialBindingRefs(
  binding: MaterialBinding,
  visitor: (binding: BindingRef) => BindingRef,
): MaterialBinding {
  if (isDataContractBinding(binding))
    return binding
  return Array.isArray(binding) ? binding.map(visitor) : visitor(binding)
}

export function cloneAndFreezeBindingRef(binding: BindingRef): BindingRef {
  const cloned = deepClone(binding)
  deepFreezeObject(cloned)
  return cloned
}

function deepFreezeObject(value: unknown): void {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value))
    return
  for (const child of Object.values(value))
    deepFreezeObject(child)
  Object.freeze(value)
}
