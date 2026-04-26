import type { ResponseFormatJSONSchema } from 'openai/resources/shared'

export const JSON_SCHEMA_FIELD = {
  type: 'object',
  additionalProperties: false,
  properties: {
    name: { type: 'string' },
    path: { type: ['string', 'null'] },
    title: { type: ['string', 'null'] },
    fieldLabel: { type: ['string', 'null'] },
    type: { type: 'string', enum: ['string', 'number', 'boolean', 'array', 'object'] },
    required: { type: 'boolean' },
    children: {
      type: 'array',
      items: { $ref: '#/$defs/field' },
    },
  },
  required: ['name', 'path', 'title', 'fieldLabel', 'type', 'required', 'children'],
} as const

export const JSON_SCHEMA_COLUMN = {
  type: 'object',
  additionalProperties: false,
  properties: {
    path: { type: 'string' },
    title: { type: ['string', 'null'] },
    widthRatio: { type: ['number', 'null'] },
    align: { type: ['string', 'null'], enum: ['left', 'center', 'right', null] },
  },
  required: ['path', 'title', 'widthRatio', 'align'],
} as const

export const PLAN_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    domain: { type: 'string' },
    page: {
      type: 'object',
      additionalProperties: false,
      properties: {
        mode: { type: 'string', enum: ['fixed', 'stack', 'label', 'continuous'] },
        width: { type: 'number' },
        height: { type: 'number' },
        reason: { type: 'string' },
      },
      required: ['mode', 'width', 'height', 'reason'],
    },
    tableStrategy: { type: 'string', enum: ['table-data-for-arrays', 'table-static-for-fixed', 'avoid-table'] },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
  },
  required: ['domain', 'page', 'tableStrategy', 'confidence'],
} as const

export const TEMPLATE_INTENT_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    name: { type: ['string', 'null'] },
    domain: { type: ['string', 'null'] },
    dataSourceName: { type: ['string', 'null'] },
    page: {
      type: ['object', 'null'],
      additionalProperties: false,
      properties: {
        mode: { type: ['string', 'null'], enum: ['fixed', 'stack', 'label', 'continuous', null] },
        width: { type: ['number', 'null'] },
        height: { type: ['number', 'null'] },
      },
      required: ['mode', 'width', 'height'],
    },
    fields: {
      type: 'array',
      items: { $ref: '#/$defs/field' },
    },
    sections: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          id: { type: ['string', 'null'] },
          kind: { type: 'string', enum: ['title', 'text', 'field-list', 'array-table', 'summary', 'footer', 'code'] },
          title: { type: ['string', 'null'] },
          text: { type: ['string', 'null'] },
          sourcePath: { type: ['string', 'null'] },
          fields: {
            type: 'array',
            items: { $ref: '#/$defs/field' },
          },
          columns: {
            type: 'array',
            items: { $ref: '#/$defs/column' },
          },
        },
        required: ['id', 'kind', 'title', 'text', 'sourcePath', 'fields', 'columns'],
      },
    },
    sampleData: { type: ['object', 'null'], additionalProperties: false },
    warnings: { type: 'array', items: { type: 'string' } },
  },
  required: ['name', 'domain', 'dataSourceName', 'page', 'fields', 'sections', 'sampleData', 'warnings'],
  $defs: {
    field: JSON_SCHEMA_FIELD,
    column: JSON_SCHEMA_COLUMN,
  },
} as const

export function openAIJsonSchemaResponseFormat(name: string, schema: Record<string, unknown>): ResponseFormatJSONSchema {
  return {
    type: 'json_schema',
    json_schema: {
      name,
      strict: true,
      schema,
    },
  }
}
