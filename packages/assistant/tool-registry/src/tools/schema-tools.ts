import type { SchemaBuilder } from '@easyink/assistant-schema-builder'
import type { ToolDefinition } from '../types'
import { z } from 'zod'

const dataContractBindingSchema = z.object({
  kind: z.literal('data-contract'),
  mappings: z.record(z.object({
    sourceId: z.string().optional(),
    sourceName: z.string().optional(),
    select: z.object({
      path: z.string(),
      label: z.string().optional(),
    }),
    format: z.record(z.unknown()).optional(),
  })),
  relation: z.object({
    kind: z.enum(['auto', 'record', 'index']),
  }).optional(),
})

export function createSchemaTools(builder: SchemaBuilder): ToolDefinition[] {
  return [
    {
      name: 'emit_text',
      description: 'Add a text element to the schema. For labels, titles, and scalar data fields.',
      category: 'schema',
      parameters: z.object({
        id: z.string(),
        x: z.number(),
        y: z.number(),
        width: z.number(),
        height: z.number(),
        content: z.string(),
        fieldPath: z.string().optional(),
        fieldLabel: z.string().optional(),
        fontSize: z.number().optional(),
        fontWeight: z.enum(['normal', 'bold']).optional(),
        textAlign: z.enum(['left', 'center', 'right']).optional(),
        color: z.string().optional(),
      }),
      execute: (input) => {
        return builder.emitText({
          id: input.id,
          region: { x: input.x, y: input.y, width: input.width, height: input.height },
          content: input.content,
          binding: input.fieldPath ? { fieldPath: input.fieldPath, fieldLabel: input.fieldLabel } : undefined,
          style: { fontSize: input.fontSize, fontWeight: input.fontWeight, textAlign: input.textAlign, color: input.color },
        })
      },
    },
    {
      name: 'emit_table_data',
      description: 'Add a dynamic data table for array data (invoice lines, order items, etc).',
      category: 'schema',
      parameters: z.object({
        id: z.string(),
        x: z.number(),
        y: z.number(),
        width: z.number(),
        height: z.number(),
        columns: z.array(z.object({
          label: z.string(),
          field: z.string(),
          ratio: z.number(),
          align: z.enum(['left', 'center', 'right']).optional(),
        })),
        fontSize: z.number().optional(),
        headerBg: z.string().optional(),
        borderWidth: z.number().optional(),
      }),
      execute: (input) => {
        return builder.emitTableData({
          id: input.id,
          region: { x: input.x, y: input.y, width: input.width, height: input.height },
          columns: input.columns,
          style: { fontSize: input.fontSize, headerBg: input.headerBg, borderWidth: input.borderWidth },
        })
      },
    },
    {
      name: 'emit_table_static',
      description: 'Add a fixed table for forms, key-value grids, and non-repeating layouts.',
      category: 'schema',
      parameters: z.object({
        id: z.string(),
        x: z.number(),
        y: z.number(),
        width: z.number(),
        height: z.number(),
        rows: z.array(z.object({
          cells: z.array(z.object({
            text: z.string().optional(),
            fieldPath: z.string().optional(),
            fieldLabel: z.string().optional(),
            colSpan: z.number().optional(),
            align: z.enum(['left', 'center', 'right']).optional(),
            bold: z.boolean().optional(),
            bg: z.string().optional(),
          })),
          height: z.number().optional(),
        })),
      }),
      execute: (input) => {
        return builder.emitTableStatic({
          id: input.id,
          region: { x: input.x, y: input.y, width: input.width, height: input.height },
          rows: input.rows.map((r: any) => ({
            ...r,
            cells: r.cells.map((c: any) => ({
              ...c,
              binding: c.fieldPath ? { fieldPath: c.fieldPath, fieldLabel: c.fieldLabel } : undefined,
            })),
          })),
        })
      },
    },
    {
      name: 'emit_element',
      description: 'Add a generic element (image, barcode, qrcode, line, rect, chart-bar, etc). Use binding.kind="data-contract" for structured data materials such as chart-bar.',
      category: 'schema',
      parameters: z.object({
        id: z.string(),
        type: z.string(),
        x: z.number(),
        y: z.number(),
        width: z.number(),
        height: z.number(),
        props: z.record(z.unknown()).optional(),
        fieldPath: z.string().optional(),
        fieldLabel: z.string().optional(),
        binding: dataContractBindingSchema.optional(),
      }),
      execute: (input) => {
        return builder.emitElement({
          id: input.id,
          type: input.type,
          region: { x: input.x, y: input.y, width: input.width, height: input.height },
          props: input.props,
          binding: input.binding ?? (input.fieldPath ? { fieldPath: input.fieldPath, fieldLabel: input.fieldLabel } : undefined),
        })
      },
    },
    {
      name: 'build_schema',
      description: 'Finalize and return the complete DocumentSchema.',
      category: 'schema',
      parameters: z.object({}),
      execute: () => {
        const validation = builder.validate()
        return { schema: builder.buildSchema(), validation }
      },
    },
    {
      name: 'validate_schema',
      description: 'Validate the current schema state without finalizing.',
      category: 'validation',
      parameters: z.object({}),
      execute: () => builder.validate(),
    },
  ]
}
