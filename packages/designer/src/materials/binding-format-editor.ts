import type { BindingFormatEditorDefinition, MaterialBindingDefinition } from '@easyink/core'

export function resolveOrdinaryFormatEditor(
  binding: MaterialBindingDefinition | undefined,
): BindingFormatEditorDefinition | false {
  if (binding?.kind !== 'ordinary')
    return false
  return binding.formatEditor
}

export function resolveDataContractFieldFormatEditor(
  binding: MaterialBindingDefinition | undefined,
  fieldId: string,
): BindingFormatEditorDefinition | false {
  if (binding?.kind !== 'data-contract')
    return false
  const field = binding.contract.model.fields[fieldId]
  if (!field)
    return false
  return field.formatEditor ?? binding.formatEditor
}
