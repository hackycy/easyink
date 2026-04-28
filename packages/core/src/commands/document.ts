import type { DocumentSchema, GuideSchema, MaterialNode, PageSchema } from '@easyink/schema'
import type { Command } from '../command'
import type { MaterialResizeSideEffect } from '../material-extension'
import { deepClone, generateId } from '@easyink/shared'
import { asRecord, findNode, getByPath, setByPath } from './helpers'

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
    /**
     * Optional material-private side-effect produced by `MaterialResizeAdapter.commitResize`.
     * Bundled here so the framework can apply / revert it together with the geometry mutation.
     */
    private sideEffect: MaterialResizeSideEffect | null = null,
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

    this.sideEffect?.apply(node)
  }

  undo(): void {
    const node = findNode(this.elements, this.nodeId)
    if (!node)
      return
    node.x = this.oldX
    node.y = this.oldY
    node.width = this.oldWidth
    node.height = this.oldHeight

    this.sideEffect?.undo(node)
  }

  merge(next: Command): Command | null {
    if (next.type !== this.type)
      return null
    const other = next as ResizeMaterialCommand
    if (other.nodeId !== this.nodeId)
      return null
    // Last-writer-wins on side effect: continuous resize replaces the side
    // effect each frame, so the latest commit reflects the final material state.
    const merged = new ResizeMaterialCommand(this.elements, this.nodeId, other.to, other.sideEffect)
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
    precomputedOldValues?: Record<string, unknown>,
  ) {
    if (precomputedOldValues) {
      this.oldValues = deepClone(precomputedOldValues)
    }
  }

  execute(): void {
    const node = findNode(this.elements, this.nodeId)
    if (!node)
      return
    for (const key of Object.keys(this.updates)) {
      if (!(key in this.oldValues)) {
        if (key.includes('.'))
          this.oldValues[key] = deepClone(getByPath(node.props, key))
        else
          this.oldValues[key] = deepClone(node.props[key])
      }
      if (key.includes('.'))
        setByPath(node.props, key, deepClone(this.updates[key]))
      else
        node.props[key] = deepClone(this.updates[key])
    }
  }

  undo(): void {
    const node = findNode(this.elements, this.nodeId)
    if (!node)
      return
    for (const key of Object.keys(this.oldValues)) {
      if (key.includes('.'))
        setByPath(node.props, key, this.oldValues[key])
      else
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
    precomputedOldValues?: Partial<PageSchema>,
  ) {
    if (precomputedOldValues) {
      this.oldValues = deepClone(precomputedOldValues) as Partial<PageSchema>
    }
  }

  execute(): void {
    for (const key of Object.keys(this.updates) as Array<keyof PageSchema>) {
      if (!(key in this.oldValues))
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

export class UpdateDocumentCommand implements Command {
  readonly id = generateId('cmd')
  readonly type = 'update-document'
  readonly description = 'Update document'
  private oldValues: Partial<DocumentSchema> = {}

  constructor(
    private schema: DocumentSchema,
    private updates: Partial<Pick<DocumentSchema, 'unit' | 'meta' | 'extensions' | 'compat'>>,
    precomputedOldValues?: Partial<Pick<DocumentSchema, 'unit' | 'meta' | 'extensions' | 'compat'>>,
  ) {
    if (precomputedOldValues) {
      this.oldValues = deepClone(precomputedOldValues) as Partial<DocumentSchema>
    }
  }

  execute(): void {
    for (const key of Object.keys(this.updates) as Array<keyof typeof this.updates>) {
      if (!(key in this.oldValues))
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

type GeometryKey = 'x' | 'y' | 'width' | 'height' | 'rotation' | 'alpha'

export class UpdateGeometryCommand implements Command {
  readonly id = generateId('cmd')
  readonly type = 'update-geometry'
  readonly description = 'Update geometry'
  private oldValues: Partial<Record<GeometryKey, number>> = {}

  constructor(
    private elements: MaterialNode[],
    private nodeId: string,
    private updates: Partial<Record<GeometryKey, number>>,
    precomputedOldValues?: Partial<Record<GeometryKey, number>>,
  ) {
    if (precomputedOldValues) {
      this.oldValues = { ...precomputedOldValues }
    }
  }

  execute(): void {
    const node = findNode(this.elements, this.nodeId)
    if (!node)
      return
    for (const key of Object.keys(this.updates) as GeometryKey[]) {
      if (!(key in this.oldValues))
        this.oldValues[key] = (node as unknown as Record<string, number>)[key]
      ;(node as unknown as Record<string, number>)[key] = this.updates[key]!
    }
  }

  undo(): void {
    const node = findNode(this.elements, this.nodeId)
    if (!node)
      return
    for (const key of Object.keys(this.oldValues) as GeometryKey[]) {
      (node as unknown as Record<string, number>)[key] = this.oldValues[key]!
    }
  }

  merge(next: Command): Command | null {
    if (next.type !== this.type)
      return null
    const other = next as UpdateGeometryCommand
    if (other.nodeId !== this.nodeId)
      return null
    const mergedUpdates = { ...this.updates, ...other.updates }
    const mergedOlds = { ...this.oldValues }
    for (const key of Object.keys(other.oldValues) as GeometryKey[]) {
      if (!(key in mergedOlds))
        mergedOlds[key] = other.oldValues[key]
    }
    const merged = new UpdateGeometryCommand(this.elements, this.nodeId, mergedUpdates, mergedOlds)
    return merged
  }
}
