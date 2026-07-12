import type { BindingFormatEditorDefinition, MaterialBindingDefinition } from '@easyink/core'

export function resolveOrdinaryFormatEditor(
  binding: MaterialBindingDefinition | undefined,
): BindingFormatEditorDefinition | false {
  if (binding?.kind !== 'ports')
    return false
  return binding.ports[0]?.formatEditor ?? false
}

export function resolveDataContractFieldFormatEditor(
  binding: MaterialBindingDefinition | undefined,
  fieldId: string,
): BindingFormatEditorDefinition | false {
  if (binding?.kind !== 'ports' || !binding.dataContract)
    return false
  const field = binding.dataContract.model.fields[fieldId]
  if (!field)
    return false
  return field.formatEditor ?? binding.ports[0]?.formatEditor ?? false
}
