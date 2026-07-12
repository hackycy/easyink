import type { MaterialBindingDefinition } from '@easyink/core'

export function resolveDefaultDatasourceBindingPort(binding: MaterialBindingDefinition | undefined): string | undefined {
  if (binding?.kind !== 'ports' || binding.dataContract)
    return undefined
  const port = binding.ports.find(port =>
    port.key.kind === 'exact'
    && port.role === 'display'
    && port.valueShape === 'scalar')
  return port?.key.kind === 'exact' ? port.key.value : undefined
}
