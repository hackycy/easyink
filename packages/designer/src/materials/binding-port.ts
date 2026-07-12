import type { MaterialBindingDefinition } from '@easyink/core'

export function resolveDefaultDatasourceBindingPort(binding: MaterialBindingDefinition | undefined): string | undefined {
  if (binding?.kind !== 'ports' || binding.dataContract)
    return undefined
  return resolveUniqueExactPort(binding, 'display')
}

export function resolveDataContractBindingPort(binding: MaterialBindingDefinition | undefined): string | undefined {
  if (binding?.kind !== 'ports' || !binding.dataContract)
    return undefined
  return resolveUniqueExactPort(binding, 'semantic')
}

export function resolveBindingPanelPort(binding: MaterialBindingDefinition | undefined): string | undefined {
  if (binding?.kind !== 'ports' || binding.dataContract)
    return undefined
  return resolveUniqueExactPort(binding, 'display')
}

function resolveUniqueExactPort(binding: Extract<MaterialBindingDefinition, { kind: 'ports' }>, role: 'display' | 'semantic'): string | undefined {
  const ports = binding.ports.filter(port =>
    port.key.kind === 'exact'
    && port.role === role)
  return ports.length === 1 && ports[0]?.key.kind === 'exact' ? ports[0].key.value : undefined
}
