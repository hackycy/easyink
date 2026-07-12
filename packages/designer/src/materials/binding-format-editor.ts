import type { BindingFormatEditorDefinition, MaterialBindingDefinition } from '@easyink/core'

export function resolveOrdinaryFormatEditor(
  binding: MaterialBindingDefinition | undefined,
): BindingFormatEditorDefinition | false {
  if (binding?.kind !== 'ports')
    return false
  const editor = binding.ports[0]?.formatEditor
  return editor ? { ...editor, presetTypes: editor.presetTypes ? [...editor.presetTypes] : undefined } : false
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
  const editor = field.formatEditor ?? binding.ports[0]?.formatEditor
  return editor ? { ...editor, presetTypes: editor.presetTypes ? [...editor.presetTypes] : undefined } : false
}
