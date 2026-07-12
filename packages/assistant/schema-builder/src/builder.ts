import type { ConstraintContext, MaterialKnowledgeRegistry } from '@easyink/assistant-material-knowledge'
import type { DocumentSchema, MaterialBinding, MaterialNode } from '@easyink/schema'
import type {
  EmitBindingInput,
  EmitDataContractBindingInput,
  EmitElementInput,
  EmitTableDataInput,
  EmitTableStaticInput,
  SchemaBuilderContext,
  TableColumnInput,
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
    const topology = this.tableDataTopology(cols, input.headerRow !== false)
    const s = input.style ?? {}
    const node = this.mk(input.id, 'table-data', input.region, {
      typography: { fontSize: s.fontSize ?? 3.18 },
      borderWidth: s.borderWidth ?? 0.3,
      cellPadding: s.cellPadding ?? 1,
      headerBackground: s.headerBg ?? '#f5f5f5',
      stripedRows: s.stripedRows ?? false,
      stripedColor: s.stripedColor,
      table: { kind: 'data', topology, layout: this.tableLayout(s) },
    })
    return this.pushValidated(node)
  }

  emitTableStatic(input: EmitTableStaticInput) {
    const maxCols = Math.max(...input.rows.map(r => r.cells.reduce((sum, c) => sum + (c.colSpan ?? 1), 0)))
    const columns = Array.from({ length: maxCols }, () => ({ width: 1 / maxCols }))
    const s = input.style ?? {}
    const rows = input.rows.map((row) => {
      const cells = row.cells.map((cell) => {
        const c: Record<string, unknown> = {}
        if (cell.colSpan)
          c.colSpan = cell.colSpan
        if (cell.rowSpan)
          c.rowSpan = cell.rowSpan
        if (cell.bg)
          c.background = cell.bg
        if (cell.align || cell.bold) {
          c.typography = {
            ...(cell.align ? { textAlign: cell.align } : {}),
            ...(cell.bold ? { fontWeight: 'bold' } : {}),
          }
        }
        if (cell.text)
          c.content = { text: cell.text }
        if (cell.binding) {
          c.staticBinding = {
            sourceId: this.context.dataSourceName,
            sourceName: this.context.dataSourceName,
            fieldPath: cell.binding.fieldPath,
            fieldLabel: cell.binding.fieldLabel,
          }
        }
        return c
      })
      return { height: row.height ?? 8, role: 'normal', cells }
    })
    const node = this.mk(input.id, 'table-static', input.region, {
      typography: { fontSize: s.fontSize ?? 3.18 },
      borderWidth: s.borderWidth ?? 0.3,
      cellPadding: s.cellPadding ?? 1,
      table: { kind: 'static', topology: { columns, rows }, layout: this.tableLayout(s) },
    })
    return this.pushValidated(node)
  }

  emitText(input: {
    id: string
    region: { x: number, y: number, width: number, height: number }
    content: string
    binding?: EmitBindingInput
    style?: { fontSize?: number, fontWeight?: string, textAlign?: string, color?: string }
  }) {
    const st = input.style ?? {}
    const props: Record<string, unknown> = {
      content: input.content,
      fontSize: st.fontSize ?? 3.5,
      fontWeight: st.fontWeight ?? 'normal',
      textAlign: st.textAlign ?? 'left',
      verticalAlign: 'middle',
      color: st.color ?? '#000000',
    }
    const binding = input.binding ? this.bindingRef(input.binding) : undefined
    const node = { ...this.mk(input.id, 'text', input.region, props), ...(binding ? { binding } : {}) } as MaterialNode
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

  private mk(id: string, type: string, region: { x: number, y: number, width: number, height: number }, props: Record<string, unknown>): MaterialNode {
    return { id, type, x: region.x, y: region.y, width: region.width, height: region.height, modelVersion: 1, model: props, slots: {}, bindings: {}, output: { visibility: 'include' } }
  }

  private buildNode(input: EmitElementInput): MaterialNode {
    const binding = input.binding ? this.materialBinding(input.binding) : undefined
    return {
      id: input.id,
      type: input.type,
      x: input.region.x,
      y: input.region.y,
      width: input.region.width,
      height: input.region.height,
      modelVersion: 1,
      model: input.props ?? {},
      slots: input.children ? { default: input.children.map(c => this.buildNode(c)) } : {},
      bindings: binding ? { value: binding } : {},
      output: { visibility: 'include' },
    }
  }

  private bindingRef(b: EmitBindingInput) {
    return { sourceId: this.context.dataSourceName, sourceName: this.context.dataSourceName, fieldPath: b.fieldPath, fieldLabel: b.fieldLabel }
  }

  private materialBinding(binding: EmitElementInput['binding']): MaterialBinding | undefined {
    if (!binding)
      return undefined
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
              label: mapping.select.label,
            },
            format: mapping.format,
          },
        ])),
        relation: binding.relation ?? { kind: 'auto' },
      }
    }
    return this.bindingRef(binding)
  }

  private tableLayout(s: { borderWidth?: number, borderColor?: string }) {
    return { borderAppearance: 'all', borderWidth: s.borderWidth ?? 0.3, borderType: 'solid', borderColor: s.borderColor ?? '#000000' }
  }

  private tableDataTopology(cols: TableColumnInput[], hasHeader: boolean) {
    const topCols = cols.map(c => ({ width: c.ratio }))
    const rows: Record<string, unknown>[] = []
    if (hasHeader) {
      rows.push({ height: 8, role: 'header', cells: cols.map(c => ({ content: { text: c.label }, typography: { textAlign: c.align ?? 'left', fontWeight: 'bold' } })) })
    }
    rows.push({ height: 7, role: 'repeat-template', cells: cols.map(c => ({ binding: this.bindingRef({ fieldPath: c.field, fieldLabel: c.label }), typography: { textAlign: c.align ?? 'left' } })) })
    return { columns: topCols, rows }
  }

  private ctx(): ConstraintContext {
    return { pageWidth: this.context.pageWidth, pageHeight: this.context.pageHeight, pageMode: this.context.pageMode, unit: this.context.unit, siblingTypes: this.elements.map(e => e.type) }
  }
}

function isDataContractBindingInput(
  binding: EmitBindingInput | EmitDataContractBindingInput,
): binding is EmitDataContractBindingInput {
  return 'kind' in binding && binding.kind === 'data-contract'
}
