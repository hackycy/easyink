import type { ConstraintContext, MaterialKnowledgeRegistry } from '@easyink/assistant-material-knowledge'
import type { DocumentSchema, MaterialBinding, MaterialNode } from '@easyink/schema'
import type {
  EmitBindingInput,
  EmitDataContractBindingInput,
  EmitElementInput,
  EmitTableDataInput,
  EmitTableStaticInput,
  SchemaBuilderContext,
} from './types'
import { ConstraintEngine } from '@easyink/assistant-constraint-engine'

export class SchemaBuilder {
  private readonly context: SchemaBuilderContext
  private readonly registry: MaterialKnowledgeRegistry
  private readonly engine: ConstraintEngine
  private elements: MaterialNode[] = []

  constructor(context: SchemaBuilderContext, registry: MaterialKnowledgeRegistry) {
    this.context = context
    this.registry = registry
    this.engine = new ConstraintEngine(registry)
  }

  emitElement(input: EmitElementInput) {
    return this.pushValidated(this.buildNode(input))
  }

  emitTableData(input: EmitTableDataInput) {
    const total = input.columns.reduce((s, c) => s + c.ratio, 0)
    const cols = input.columns.map(c => ({
      ...c,
      ratio: total > 0 ? c.ratio / total : 1 / input.columns.length,
    }))
    const s = input.style ?? {}
    const columns = cols.map((column, index) => ({
      id: `${input.id}:column:${index}`,
      track: { kind: 'fr', weight: column.ratio },
    }))
    const bindings: MaterialNode['bindings'] = {
      records: this.bindingRef({
        fieldPath: input.collectionField ?? inferCollectionField(cols.map(column => column.field)),
        fieldLabel: input.collectionField,
      }),
    }
    const headerRows = input.headerRow === false
      ? []
      : [{
          id: `${input.id}:header:row:0`,
          minHeight: 8,
          cells: columns.map((column, index) => ({
            id: `${input.id}:header:cell:${index}`,
            columnId: column.id,
            content: { kind: 'text', text: cols[index]!.label },
            style: {
              background: s.headerBg ?? '#f5f5f5',
              typography: { textAlign: tableTextAlign(cols[index]!.align), fontWeight: 'bold' },
            },
          })),
        }]
    const detailCells = columns.map((column, index) => {
      const port = `cell:${column.id}`
      bindings[port] = this.bindingRef({ fieldPath: cols[index]!.field, fieldLabel: cols[index]!.label })
      return {
        id: `${input.id}:detail:cell:${index}`,
        columnId: column.id,
        content: { kind: 'text', text: '', bindingPort: port },
        style: { typography: { textAlign: tableTextAlign(cols[index]!.align) } },
      }
    })
    const bands = [
      ...(headerRows.length > 0 ? [{ id: `${input.id}:band:header`, role: 'header', rows: headerRows }] : []),
      { id: `${input.id}:band:detail`, role: 'detail', rows: [{ id: `${input.id}:detail:row:0`, minHeight: 7, cells: detailCells }] },
    ]
    const node = this.mk(input.id, 'table-data', input.region, {
      kind: 'data',
      columns,
      bands,
      merges: [],
      style: this.tableStyle(s),
      data: { collectionPort: 'records' },
    }, bindings)
    return this.pushValidated(node)
  }

  emitTableStatic(input: EmitTableStaticInput) {
    const maxCols = Math.max(...input.rows.map(r => r.cells.reduce((sum, c) => sum + (c.colSpan ?? 1), 0)))
    const columnCount = Math.max(1, maxCols)
    const columns = Array.from({ length: columnCount }, (_, index) => ({ id: `${input.id}:column:${index}`, track: { kind: 'fr', weight: 1 } }))
    const s = input.style ?? {}
    const bindings: MaterialNode['bindings'] = {}
    const rows = input.rows.map((row, rowIndex) => ({
      id: `${input.id}:row:${rowIndex}`,
      minHeight: row.height ?? 8,
      cells: columns.map((column, columnIndex) => ({
        id: `${input.id}:cell:${rowIndex}:${columnIndex}`,
        columnId: column.id,
        content: { kind: 'text', text: '' } as { kind: 'text', text: string, bindingPort?: string },
        style: {} as Record<string, unknown>,
      })),
    }))
    const occupied = rows.map(() => columns.map(() => false))
    const merges: Array<{ id: string, rowIds: string[], columnIds: string[], anchorCellId: string, inactiveCellIds: string[] }> = []
    input.rows.forEach((row, rowIndex) => {
      let columnIndex = 0
      row.cells.forEach((cell, cellIndex) => {
        while (columnIndex < columnCount && occupied[rowIndex]![columnIndex])
          columnIndex++
        if (columnIndex >= columnCount)
          return
        const colSpan = Math.min(Math.max(1, cell.colSpan ?? 1), columnCount - columnIndex)
        const rowSpan = Math.min(Math.max(1, cell.rowSpan ?? 1), rows.length - rowIndex)
        const anchor = rows[rowIndex]!.cells[columnIndex]!
        anchor.content.text = cell.text ?? ''
        anchor.style = {
          ...(cell.bg ? { background: cell.bg } : {}),
          ...(cell.align || cell.bold
            ? { typography: { ...(cell.align ? { textAlign: tableTextAlign(cell.align) } : {}), ...(cell.bold ? { fontWeight: 'bold' } : {}) } }
            : {}),
        }
        if (cell.valueBinding) {
          const port = `cell:${anchor.id}`
          anchor.content.bindingPort = port
          bindings[port] = this.bindingRef(cell.valueBinding)
        }
        const covered = []
        for (let rowOffset = 0; rowOffset < rowSpan; rowOffset++) {
          for (let columnOffset = 0; columnOffset < colSpan; columnOffset++) {
            occupied[rowIndex + rowOffset]![columnIndex + columnOffset] = true
            if (rowOffset !== 0 || columnOffset !== 0)
              covered.push(rows[rowIndex + rowOffset]!.cells[columnIndex + columnOffset]!.id)
          }
        }
        if (covered.length > 0) {
          merges.push({
            id: `${input.id}:merge:${rowIndex}:${cellIndex}`,
            rowIds: rows.slice(rowIndex, rowIndex + rowSpan).map(candidate => candidate.id),
            columnIds: columns.slice(columnIndex, columnIndex + colSpan).map(candidate => candidate.id),
            anchorCellId: anchor.id,
            inactiveCellIds: covered,
          })
        }
        columnIndex += colSpan
      })
    })
    const node = this.mk(input.id, 'table-static', input.region, {
      kind: 'static',
      columns,
      bands: [{ id: `${input.id}:band:body`, role: 'body', rows }],
      merges,
      style: this.tableStyle(s),
    }, bindings)
    return this.pushValidated(node)
  }

  emitText(input: {
    id: string
    region: { x: number, y: number, width: number, height: number }
    content: string
    valueBinding?: EmitBindingInput
    style?: { fontSize?: number, fontWeight?: string, textAlign?: string, color?: string }
  }) {
    const st = input.style ?? {}
    const model: Record<string, unknown> = {
      content: input.content,
      fontSize: st.fontSize ?? 3.5,
      fontWeight: st.fontWeight ?? 'normal',
      textAlign: st.textAlign ?? 'left',
      verticalAlign: 'middle',
      color: st.color ?? '#000000',
    }
    const bindings = input.valueBinding ? { value: this.bindingRef(input.valueBinding) } : undefined
    const node = this.mk(input.id, 'text', input.region, model, bindings)
    this.elements.push(node)
    return { element: node, valid: true, errors: [] as string[] }
  }

  getElements(): MaterialNode[] { return [...this.elements] }

  buildSchema(): DocumentSchema {
    return {
      version: '1.0.0',
      unit: this.context.unit,
      page: {
        mode: this.context.pageMode,
        width: this.context.pageWidth,
        height: this.context.pageHeight,
        pageModel: {
          kind: this.context.pageMode === 'continuous' ? 'continuous-paper' : 'paged-paper',
          paper: { width: this.context.pageWidth, height: this.context.pageHeight },
        },
      },
      guides: { x: [], y: [] },
      elements: this.elements,
    } as DocumentSchema
  }

  validate() {
    const result = this.engine.validateSchema(this.elements, this.ctx())
    return { passed: result.passed, errors: result.errors.map(e => `[${e.elementId}] ${e.message}`) }
  }

  patchElement(id: string, patch: Partial<MaterialNode>): boolean {
    const i = this.elements.findIndex(e => e.id === id)
    if (i < 0)
      return false
    this.elements[i] = { ...this.elements[i], ...patch } as MaterialNode
    return true
  }

  removeElement(id: string): boolean {
    const i = this.elements.findIndex(e => e.id === id)
    if (i < 0)
      return false
    this.elements.splice(i, 1)
    return true
  }

  private pushValidated(node: MaterialNode) {
    const result = this.engine.validateElement(node, this.ctx(), { autoFix: true })
    const final = result.autoFixed.length > 0 ? result.autoFixed[result.autoFixed.length - 1].fixed : node
    this.elements.push(final)
    return { element: final, valid: result.passed, errors: result.errors.map(e => e.message) }
  }

  private mk(id: string, type: string, region: { x: number, y: number, width: number, height: number }, model: Record<string, unknown>, bindings: MaterialNode['bindings'] = {}): MaterialNode {
    return { id, type, x: region.x, y: region.y, width: region.width, height: region.height, modelVersion: 1, model, slots: {}, bindings, output: { visibility: 'include' } }
  }

  private buildNode(input: EmitElementInput): MaterialNode {
    return {
      id: input.id,
      type: input.type,
      x: input.region.x,
      y: input.region.y,
      width: input.region.width,
      height: input.region.height,
      modelVersion: 1,
      model: input.model ?? {},
      slots: Object.fromEntries(Object.entries(input.slots ?? {}).map(([slot, children]) => [slot, children.map(child => this.buildNode(child))])),
      bindings: Object.fromEntries(Object.entries(input.bindings ?? {}).map(([port, binding]) => [port, this.materialBinding(binding)])),
      output: { visibility: 'include' },
    }
  }

  private bindingRef(b: EmitBindingInput) {
    return {
      sourceId: this.context.dataSourceName,
      sourceName: this.context.dataSourceName,
      fieldPath: b.fieldPath,
      ...(b.fieldLabel === undefined ? {} : { fieldLabel: b.fieldLabel }),
      ...(b.format === undefined ? {} : { format: b.format }),
    }
  }

  private materialBinding(binding: EmitBindingInput | EmitDataContractBindingInput): MaterialBinding {
    if (isDataContractBindingInput(binding)) {
      return {
        kind: 'data-contract',
        mappings: Object.fromEntries(Object.entries(binding.mappings).map(([fieldId, mapping]) => [
          fieldId,
          {
            sourceId: mapping.sourceId ?? this.context.dataSourceName,
            sourceName: mapping.sourceName ?? this.context.dataSourceName,
            select: {
              path: mapping.select.path,
              ...(mapping.select.label === undefined ? {} : { label: mapping.select.label }),
            },
            ...(mapping.format === undefined ? {} : { format: mapping.format }),
          },
        ])),
        relation: binding.relation ?? { kind: 'auto' },
      }
    }
    return this.bindingRef(binding)
  }

  private tableStyle(s: { fontSize?: number, borderWidth?: number, borderColor?: string, cellPadding?: number }) {
    const border = { width: s.borderWidth ?? 0.3, style: 'solid', color: s.borderColor ?? '#000000' }
    const padding = s.cellPadding ?? 1
    return {
      typography: { fontSize: s.fontSize ?? 3.18 },
      padding: { top: padding, right: padding, bottom: padding, left: padding },
      border: { blockStart: border, inlineEnd: border, blockEnd: border, inlineStart: border },
    }
  }

  private ctx(): ConstraintContext {
    return { pageWidth: this.context.pageWidth, pageHeight: this.context.pageHeight, pageMode: this.context.pageMode, unit: this.context.unit, siblingTypes: this.elements.map(e => e.type) }
  }
}

function inferCollectionField(fields: readonly string[]): string {
  const segments = fields.map(field => field.split('/').filter(Boolean))
  if (segments.length === 0)
    return 'records'
  const prefix: string[] = []
  for (let index = 0; index < Math.min(...segments.map(value => value.length)); index++) {
    const candidate = segments[0]![index]
    if (!candidate || !segments.every(value => value[index] === candidate))
      break
    prefix.push(candidate)
  }
  const collection = prefix.length === segments[0]!.length ? prefix.slice(0, -1) : prefix
  return collection.length > 0 ? collection.join('/') : 'records'
}

function tableTextAlign(align: 'left' | 'center' | 'right' | undefined): 'start' | 'center' | 'end' {
  return align === 'right' ? 'end' : align === 'center' ? 'center' : 'start'
}

function isDataContractBindingInput(
  binding: EmitBindingInput | EmitDataContractBindingInput,
): binding is EmitDataContractBindingInput {
  return 'kind' in binding && binding.kind === 'data-contract'
}
