import type { DataFieldCustomFormatTemplate, DataFieldNode, DataSourceDescriptor } from './types'

export interface DataFieldLookup {
  fieldPath?: string
  fieldKey?: string
  fieldId?: string
}

/**
 * Find a field node within a data source by the stable data kept on BindingRef.
 */
export function findDataFieldNode(
  source: DataSourceDescriptor | undefined,
  lookup: DataFieldLookup,
): DataFieldNode | undefined {
  if (!source)
    return undefined
  return findField(source.fields, lookup)
}

/**
 * Return valid custom formatter templates declared by a data field.
 */
export function getDataFieldCustomFormatTemplates(
  field: DataFieldNode | undefined,
): DataFieldCustomFormatTemplate[] {
  const templates = field?.displayFormat?.customTemplates
  if (!templates?.length)
    return []
  return templates.filter(template =>
    !!template.id
    && !!template.label
    && !!template.source?.trim(),
  )
}

/**
 * Resolve the field-specific custom formatter template that should seed a
 * newly-created custom display format.
 */
export function getDefaultDataFieldCustomFormatTemplate(
  field: DataFieldNode | undefined,
): DataFieldCustomFormatTemplate | undefined {
  const templates = getDataFieldCustomFormatTemplates(field)
  if (!templates.length)
    return undefined
  const defaultId = field?.displayFormat?.defaultCustomTemplateId
  if (defaultId) {
    const matched = templates.find(template => template.id === defaultId)
    if (matched)
      return matched
  }
  return templates[0]
}

function findField(fields: DataFieldNode[] | undefined, lookup: DataFieldLookup): DataFieldNode | undefined {
  if (!fields?.length)
    return undefined

  for (const field of fields) {
    if (matchesField(field, lookup))
      return field
    const child = findField(field.fields, lookup)
    if (child)
      return child
  }
  return undefined
}

function matchesField(field: DataFieldNode, lookup: DataFieldLookup): boolean {
  return !!(
    (lookup.fieldPath && field.path === lookup.fieldPath)
    || (lookup.fieldKey && field.key === lookup.fieldKey)
    || (lookup.fieldId && field.id === lookup.fieldId)
  )
}
