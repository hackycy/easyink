import type { BindingRef, DocumentSchema, GuideSchema, MaterialNode, PageSchema, TableCellSchema, TableNode, TableRowSchema, TableSectionSchema } from '@easyink/schema'
import type { UsageRule } from '@easyink/shared'
import type { Command } from './command'
import { deepClone, generateId } from '@easyink/shared'

function findNode(elements: MaterialNode[], id: string): MaterialNode | undefined {
  return elements.find(el => el.id === id)
}

function asRecord(obj: unknown): Record<string, unknown> {
  return obj as Record<string, unknown>
}

// ─── Document Commands ──────────────────────────────────────────────

export class AddMaterialCommand implements Command {
  readonly id = generateId('cmd')
  readonly type = 'add-material'
  readonly description = 'Add material'

  constructor(
    private elements: MaterialNode[],
    private node: MaterialNode,
  ) {}

  execute(): void {
    this.elements.push(this.node)
  }

  undo(): void {
    const idx = this.elements.findIndex(el => el.id === this.node.id)
    if (idx >= 0)
      this.elements.splice(idx, 1)
  }
}

export class RemoveMaterialCommand implements Command {
  readonly id = generateId('cmd')
  readonly type = 'remove-material'
  readonly description = 'Remove material'
  private snapshot: MaterialNode | undefined
  private index = -1

  constructor(
    private elements: MaterialNode[],
    private nodeId: string,
  ) {}

  execute(): void {
    const idx = this.elements.findIndex(el => el.id === this.nodeId)
    if (idx < 0)
      return
    this.index = idx
    this.snapshot = deepClone(this.elements[idx]!)
    this.elements.splice(idx, 1)
  }

  undo(): void {
    if (this.snapshot)
      this.elements.splice(this.index, 0, this.snapshot)
  }
}

export class MoveMaterialCommand implements Command {
  readonly id = generateId('cmd')
  readonly type = 'move-material'
  readonly description = 'Move material'
  private oldX = 0
  private oldY = 0

  constructor(
    private elements: MaterialNode[],
    private nodeId: string,
    private to: { x: number, y: number },
  ) {}

  execute(): void {
    const node = findNode(this.elements, this.nodeId)
    if (!node)
      return
    this.oldX = node.x
    this.oldY = node.y
    node.x = this.to.x
    node.y = this.to.y
  }

  undo(): void {
    const node = findNode(this.elements, this.nodeId)
    if (!node)
      return
    node.x = this.oldX
    node.y = this.oldY
  }

  merge(next: Command): Command | null {
    if (next.type !== this.type)
      return null
    const other = next as MoveMaterialCommand
    if (other.nodeId !== this.nodeId)
      return null
    const merged = new MoveMaterialCommand(this.elements, this.nodeId, other.to)
    merged.oldX = this.oldX
    merged.oldY = this.oldY
    return merged
  }
}

export class ResizeMaterialCommand implements Command {
  readonly id = generateId('cmd')
  readonly type = 'resize-material'
  readonly description = 'Resize material'
  private oldX = 0
  private oldY = 0
  private oldWidth = 0
  private oldHeight = 0

  constructor(
    private elements: MaterialNode[],
    private nodeId: string,
    private to: { x: number, y: number, width: number, height: number },
  ) {}

  execute(): void {
    const node = findNode(this.elements, this.nodeId)
    if (!node)
      return
    this.oldX = node.x
    this.oldY = node.y
    this.oldWidth = node.width
    this.oldHeight = node.height
    node.x = this.to.x
    node.y = this.to.y
    node.width = this.to.width
    node.height = this.to.height
  }

  undo(): void {
    const node = findNode(this.elements, this.nodeId)
    if (!node)
      return
    node.x = this.oldX
    node.y = this.oldY
    node.width = this.oldWidth
    node.height = this.oldHeight
  }

  merge(next: Command): Command | null {
    if (next.type !== this.type)
      return null
    const other = next as ResizeMaterialCommand
    if (other.nodeId !== this.nodeId)
      return null
    const merged = new ResizeMaterialCommand(this.elements, this.nodeId, other.to)
    merged.oldX = this.oldX
    merged.oldY = this.oldY
    merged.oldWidth = this.oldWidth
    merged.oldHeight = this.oldHeight
    return merged
  }
}

export class RotateMaterialCommand implements Command {
  readonly id = generateId('cmd')
  readonly type = 'rotate-material'
  readonly description = 'Rotate material'
  private oldRotation = 0

  constructor(
    private elements: MaterialNode[],
    private nodeId: string,
    private to: number,
  ) {}

  execute(): void {
    const node = findNode(this.elements, this.nodeId)
    if (!node)
      return
    this.oldRotation = node.rotation ?? 0
    node.rotation = this.to
  }

  undo(): void {
    const node = findNode(this.elements, this.nodeId)
    if (!node)
      return
    node.rotation = this.oldRotation
  }

  merge(next: Command): Command | null {
    if (next.type !== this.type)
      return null
    const other = next as RotateMaterialCommand
    if (other.nodeId !== this.nodeId)
      return null
    const merged = new RotateMaterialCommand(this.elements, this.nodeId, other.to)
    merged.oldRotation = this.oldRotation
    return merged
  }
}

export class UpdateMaterialPropsCommand implements Command {
  readonly id = generateId('cmd')
  readonly type = 'update-material-props'
  readonly description = 'Update material props'
  private oldValues: Record<string, unknown> = {}

  constructor(
    private elements: MaterialNode[],
    private nodeId: string,
    private updates: Record<string, unknown>,
  ) {}

  execute(): void {
    const node = findNode(this.elements, this.nodeId)
    if (!node)
      return
    for (const key of Object.keys(this.updates)) {
      this.oldValues[key] = deepClone(node.props[key])
      node.props[key] = deepClone(this.updates[key])
    }
  }

  undo(): void {
    const node = findNode(this.elements, this.nodeId)
    if (!node)
      return
    for (const key of Object.keys(this.oldValues)) {
      node.props[key] = this.oldValues[key]
    }
  }
}

export class UpdatePageCommand implements Command {
  readonly id = generateId('cmd')
  readonly type = 'update-page'
  readonly description = 'Update page'
  private oldValues: Partial<PageSchema> = {}

  constructor(
    private page: PageSchema,
    private updates: Partial<PageSchema>,
  ) {}

  execute(): void {
    for (const key of Object.keys(this.updates) as Array<keyof PageSchema>) {
      asRecord(this.oldValues)[key] = deepClone(asRecord(this.page)[key])
      asRecord(this.page)[key] = deepClone(asRecord(this.updates)[key])
    }
  }

  undo(): void {
    for (const key of Object.keys(this.oldValues) as Array<keyof PageSchema>) {
      asRecord(this.page)[key] = asRecord(this.oldValues)[key]
    }
  }
}

export class UpdateGuidesCommand implements Command {
  readonly id = generateId('cmd')
  readonly type = 'update-guides'
  readonly description = 'Update guides'
  private oldGuides: GuideSchema | undefined

  constructor(
    private schema: DocumentSchema,
    private newGuides: GuideSchema,
  ) {}

  execute(): void {
    this.oldGuides = deepClone(this.schema.guides)
    this.schema.guides = deepClone(this.newGuides)
  }

  undo(): void {
    if (this.oldGuides)
      this.schema.guides = this.oldGuides
  }
}

// ─── Data Commands ──────────────────────────────────────────────────

export class BindFieldCommand implements Command {
  readonly id = generateId('cmd')
  readonly type = 'bind-field'
  readonly description = 'Bind field'
  private oldBinding: BindingRef | BindingRef[] | undefined

  constructor(
    private elements: MaterialNode[],
    private nodeId: string,
    private binding: BindingRef,
  ) {}

  execute(): void {
    const node = findNode(this.elements, this.nodeId)
    if (!node)
      return
    this.oldBinding = deepClone(node.binding)
    node.binding = deepClone(this.binding)
  }

  undo(): void {
    const node = findNode(this.elements, this.nodeId)
    if (!node)
      return
    node.binding = this.oldBinding
  }
}

export class ClearBindingCommand implements Command {
  readonly id = generateId('cmd')
  readonly type = 'clear-binding'
  readonly description = 'Clear binding'
  private oldBinding: BindingRef | BindingRef[] | undefined

  constructor(
    private elements: MaterialNode[],
    private nodeId: string,
  ) {}

  execute(): void {
    const node = findNode(this.elements, this.nodeId)
    if (!node)
      return
    this.oldBinding = deepClone(node.binding)
    node.binding = undefined
  }

  undo(): void {
    const node = findNode(this.elements, this.nodeId)
    if (!node)
      return
    node.binding = this.oldBinding
  }
}

export class UpdateUsageCommand implements Command {
  readonly id = generateId('cmd')
  readonly type = 'update-usage'
  readonly description = 'Update usage'
  private oldUsage: UsageRule | undefined

  constructor(
    private elements: MaterialNode[],
    private nodeId: string,
    private bindIndex: number,
    private usage: UsageRule,
  ) {}

  execute(): void {
    const node = findNode(this.elements, this.nodeId)
    if (!node)
      return
    const ref = this.getRef(node)
    if (!ref)
      return
    this.oldUsage = deepClone(ref.usage)
    ref.usage = deepClone(this.usage)
  }

  undo(): void {
    const node = findNode(this.elements, this.nodeId)
    if (!node)
      return
    const ref = this.getRef(node)
    if (!ref)
      return
    ref.usage = this.oldUsage
  }

  private getRef(node: MaterialNode): BindingRef | undefined {
    if (Array.isArray(node.binding))
      return node.binding[this.bindIndex]
    if (this.bindIndex === 0)
      return node.binding
    return undefined
  }
}

export class UnionDropCommand implements Command {
  readonly id = generateId('cmd')
  readonly type = 'union-drop'
  readonly description = 'Union drop'
  private nodeIds: string[]

  constructor(
    private elements: MaterialNode[],
    private nodes: MaterialNode[],
  ) {
    this.nodeIds = nodes.map(n => n.id)
  }

  execute(): void {
    for (const node of this.nodes)
      this.elements.push(node)
  }

  undo(): void {
    const ids = new Set(this.nodeIds)
    for (let i = this.elements.length - 1; i >= 0; i--) {
      if (ids.has(this.elements[i]!.id))
        this.elements.splice(i, 1)
    }
  }
}

// ─── Table Commands ─────────────────────────────────────────────────

export class InsertTableRowCommand implements Command {
  readonly id = generateId('cmd')
  readonly type = 'insert-table-row'
  readonly description = 'Insert table row'

  constructor(
    private node: TableNode,
    private sectionIndex: number,
    private rowIndex: number,
    private row: TableRowSchema,
  ) {}

  execute(): void {
    this.node.table.sections[this.sectionIndex]!.rows.splice(this.rowIndex, 0, this.row)
  }

  undo(): void {
    this.node.table.sections[this.sectionIndex]!.rows.splice(this.rowIndex, 1)
  }
}

export class RemoveTableRowCommand implements Command {
  readonly id = generateId('cmd')
  readonly type = 'remove-table-row'
  readonly description = 'Remove table row'
  private snapshot: TableRowSchema | undefined

  constructor(
    private node: TableNode,
    private sectionIndex: number,
    private rowIndex: number,
  ) {}

  execute(): void {
    const rows = this.node.table.sections[this.sectionIndex]!.rows
    this.snapshot = deepClone(rows[this.rowIndex]!)
    rows.splice(this.rowIndex, 1)
  }

  undo(): void {
    if (this.snapshot)
      this.node.table.sections[this.sectionIndex]!.rows.splice(this.rowIndex, 0, this.snapshot)
  }
}

export class ResizeTableColumnCommand implements Command {
  readonly id = generateId('cmd')
  readonly type = 'resize-table-column'
  readonly description = 'Resize table column'
  private oldWidth = 0

  constructor(
    private node: TableNode,
    private sectionIndex: number,
    private rowIdx: number,
    private cellIdx: number,
    private newWidth: number,
  ) {}

  execute(): void {
    const cell = this.node.table.sections[this.sectionIndex]!.rows[this.rowIdx]!.cells[this.cellIdx]!
    this.oldWidth = cell.width
    cell.width = this.newWidth
  }

  undo(): void {
    const cell = this.node.table.sections[this.sectionIndex]!.rows[this.rowIdx]!.cells[this.cellIdx]!
    cell.width = this.oldWidth
  }
}

export class UpdateTableCellCommand implements Command {
  readonly id = generateId('cmd')
  readonly type = 'update-table-cell'
  readonly description = 'Update table cell'
  private oldValues: Partial<TableCellSchema> = {}

  constructor(
    private node: TableNode,
    private sectionIndex: number,
    private rowIdx: number,
    private cellIdx: number,
    private updates: Partial<TableCellSchema>,
  ) {}

  execute(): void {
    const cell = this.node.table.sections[this.sectionIndex]!.rows[this.rowIdx]!.cells[this.cellIdx]!
    for (const key of Object.keys(this.updates) as Array<keyof TableCellSchema>) {
      asRecord(this.oldValues)[key] = deepClone(asRecord(cell)[key])
      asRecord(cell)[key] = deepClone(asRecord(this.updates)[key])
    }
  }

  undo(): void {
    const cell = this.node.table.sections[this.sectionIndex]!.rows[this.rowIdx]!.cells[this.cellIdx]!
    for (const key of Object.keys(this.oldValues) as Array<keyof TableCellSchema>) {
      asRecord(cell)[key] = asRecord(this.oldValues)[key]
    }
  }
}

export class UpdateTableSectionCommand implements Command {
  readonly id = generateId('cmd')
  readonly type = 'update-table-section'
  readonly description = 'Update table section'
  private oldValues: Partial<TableSectionSchema> = {}

  constructor(
    private node: TableNode,
    private sectionIndex: number,
    private updates: Partial<TableSectionSchema>,
  ) {}

  execute(): void {
    const section = this.node.table.sections[this.sectionIndex]!
    for (const key of Object.keys(this.updates) as Array<keyof TableSectionSchema>) {
      asRecord(this.oldValues)[key] = deepClone(asRecord(section)[key])
      asRecord(section)[key] = deepClone(asRecord(this.updates)[key])
    }
  }

  undo(): void {
    const section = this.node.table.sections[this.sectionIndex]!
    for (const key of Object.keys(this.oldValues) as Array<keyof TableSectionSchema>) {
      asRecord(section)[key] = asRecord(this.oldValues)[key]
    }
  }
}

export class UpdateDocumentCommand implements Command {
  readonly id = generateId('cmd')
  readonly type = 'update-document'
  readonly description = 'Update document'
  private oldValues: Partial<DocumentSchema> = {}

  constructor(
    private schema: DocumentSchema,
    private updates: Partial<Pick<DocumentSchema, 'unit' | 'meta' | 'extensions' | 'compat'>>,
  ) {}

  execute(): void {
    for (const key of Object.keys(this.updates) as Array<keyof typeof this.updates>) {
      asRecord(this.oldValues)[key] = deepClone(asRecord(this.schema)[key])
      asRecord(this.schema)[key] = deepClone(asRecord(this.updates)[key])
    }
  }

  undo(): void {
    for (const key of Object.keys(this.oldValues) as Array<keyof typeof this.oldValues>) {
      asRecord(this.schema)[key] = asRecord(this.oldValues)[key]
    }
  }
}

export class ImportTemplateCommand implements Command {
  readonly id = generateId('cmd')
  readonly type = 'import-template'
  readonly description = 'Import template'
  private oldElements: MaterialNode[] = []
  private oldPage: PageSchema | undefined
  private oldGuides: GuideSchema | undefined

  constructor(
    private schema: DocumentSchema,
    private imported: DocumentSchema,
  ) {}

  execute(): void {
    this.oldElements = deepClone(this.schema.elements)
    this.oldPage = deepClone(this.schema.page)
    this.oldGuides = deepClone(this.schema.guides)
    this.schema.elements.length = 0
    for (const el of this.imported.elements)
      this.schema.elements.push(deepClone(el))
    Object.assign(this.schema.page, deepClone(this.imported.page))
    this.schema.guides = deepClone(this.imported.guides)
  }

  undo(): void {
    this.schema.elements.length = 0
    for (const el of this.oldElements)
      this.schema.elements.push(el)
    if (this.oldPage)
      Object.assign(this.schema.page, this.oldPage)
    if (this.oldGuides)
      this.schema.guides = this.oldGuides
  }
}
