import type { DataFieldNode, DataSourceDescriptor } from '@easyink/datasource'
import type { DocumentSchema, MaterialNode } from '@easyink/schema'
import type { AssistantPreview } from './types'

export function createAssistantPreview(
  schema: DocumentSchema,
  dataSource: DataSourceDescriptor | undefined,
  warnings: string[] = [],
): AssistantPreview {
  return {
    title: schema.meta?.name ?? 'Assistant Candidate',
    page: {
      mode: schema.page.mode,
      width: schema.page.width,
      height: schema.page.height,
      unit: schema.unit,
    },
    elementCount: countElements(schema.elements),
    dataFieldCount: dataSource ? countFields(dataSource.fields) : 0,
    warnings,
  }
}

function countElements(elements: MaterialNode[]): number {
  return elements.reduce((total, element) => {
    const children = Object.values(element.slots).reduce((count, slot) => count + countElements(slot), 0)
    return total + 1 + children
  }, 0)
}

function countFields(fields: DataFieldNode[]): number {
  return fields.reduce((total, field) => total + 1 + (field.fields ? countFields(field.fields) : 0), 0)
}
