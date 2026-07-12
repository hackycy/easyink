import type { DocumentSchema, ElementGroupSchema, GuideSchema, MaterialEditorState, MaterialNode, MaterialOutput, PageSchema, RenderCondition } from '@easyink/schema'
import type { Command } from '../command'
import type { EditorSurfacePlan } from '../editor-surface-plan'
import type { MaterialResizeSideEffect } from '../material-extension'
import { deepClone, generateId } from '@easyink/shared'
import { asRecord, findNode, findNodeLocation, getByPath, setByPath } from './helpers'

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
  private groupsSnapshot: ElementGroupSchema[] | undefined
  private collection: MaterialNode[]
  private parentPath: number[] = []
  private index = -1

  constructor(
    private elements: MaterialNode[],
    private nodeId: string,
    private schema?: DocumentSchema,
  ) {
    this.collection = elements
  }

  execute(): void {
    const location = findNodeLocation(this.elements, this.nodeId)
    if (!location)
      return
    this.index = location.index
    this.collection = location.collection
    this.parentPath = location.path.slice(0, -1)
    this.snapshot = deepClone(location.node)
    location.collection.splice(location.index, 1)
    if (this.schema?.groups) {
      this.groupsSnapshot = deepClone(this.schema.groups)
      pruneElementFromGroups(this.schema, this.nodeId)
    }
  }

  undo(): void {
    const collection = resolveCollectionByPath(this.elements, this.parentPath) ?? this.collection
    if (this.snapshot)
      collection.splice(this.index, 0, this.snapshot)
    if (this.schema && this.groupsSnapshot)
      this.schema.groups = deepClone(this.groupsSnapshot)
  }
}

export class AddElementGroupCommand implements Command {
  readonly id = generateId('cmd')
  readonly type = 'add-element-group'
  readonly description = 'Add element group'
  private oldGroups: ElementGroupSchema[] | undefined

  constructor(
    private schema: DocumentSchema,
    private group: ElementGroupSchema,
  ) {}

  execute(): void {
    this.oldGroups = deepClone(this.schema.groups ?? [])
    const groups = this.schema.groups ?? (this.schema.groups = [])
    const existingIndex = groups.findIndex(group => group.id === this.group.id)
    const nextGroup = deepClone(this.group)
    if (existingIndex >= 0)
      groups.splice(existingIndex, 1, nextGroup)
    else
      groups.push(nextGroup)
  }

  undo(): void {
    this.schema.groups = deepClone(this.oldGroups ?? [])
  }
}

export class RemoveElementGroupCommand implements Command {
  readonly id = generateId('cmd')
  readonly type = 'remove-element-group'
  readonly description = 'Remove element group'
  private oldGroups: ElementGroupSchema[] | undefined

  constructor(
    private schema: DocumentSchema,
    private groupId: string,
  ) {}

  execute(): void {
    this.oldGroups = deepClone(this.schema.groups ?? [])
    if (!this.schema.groups)
      return
    const index = this.schema.groups.findIndex(group => group.id === this.groupId)
    if (index >= 0)
      this.schema.groups.splice(index, 1)
  }

  undo(): void {
    this.schema.groups = deepClone(this.oldGroups ?? [])
  }
}

function pruneElementFromGroups(schema: DocumentSchema, elementId: string): void {
  if (!schema.groups)
    return
  const nextGroups: ElementGroupSchema[] = []
  for (const group of schema.groups) {
    const memberIds = group.memberIds.filter(id => id !== elementId)
    if (memberIds.length >= 2)
      nextGroups.push({ ...group, memberIds })
  }
  schema.groups = nextGroups
}

function resolveCollectionByPath(elements: MaterialNode[], parentPath: number[]): MaterialNode[] | undefined {
  let collection = elements
  for (const index of parentPath) {
    const node = collection[index]
    if (!node)
      return undefined
    collection = node.slots.default ?? (node.slots.default = [])
  }
  return collection
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

export class UpdateMaterialModelCommand implements Command {
  readonly id = generateId('cmd')
  readonly type = 'update-material-model'
  readonly description = 'Update material model'
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
          this.oldValues[key] = deepClone(getByPath(node.model as Record<string, unknown>, key))
        else
          this.oldValues[key] = deepClone((node.model as Record<string, unknown>)[key])
      }
      if (key.includes('.'))
        setByPath(node.model as Record<string, unknown>, key, deepClone(this.updates[key]))
      else
        (node.model as Record<string, unknown>)[key] = deepClone(this.updates[key])
    }
  }

  undo(): void {
    const node = findNode(this.elements, this.nodeId)
    if (!node)
      return
    for (const key of Object.keys(this.oldValues)) {
      if (key.includes('.'))
        setByPath(node.model as Record<string, unknown>, key, this.oldValues[key])
      else
        (node.model as Record<string, unknown>)[key] = this.oldValues[key]
    }
  }
}

export type MaterialEditorStateKey = keyof MaterialEditorState

export class UpdateMaterialEditorStateCommand implements Command {
  readonly id = generateId('cmd')
  readonly type = 'update-material-editor-state'
  readonly description = 'Update material editor state'
  private oldValues: Partial<MaterialEditorState> = {}

  constructor(
    private elements: MaterialNode[],
    private nodeId: string,
    private updates: Partial<MaterialEditorState>,
    precomputedOldValues?: Partial<MaterialEditorState>,
  ) {
    if (precomputedOldValues)
      this.oldValues = { ...precomputedOldValues }
  }

  execute(): void {
    const node = findNode(this.elements, this.nodeId)
    if (!node)
      return
    const editorState = node.editorState ?? (node.editorState = {})
    for (const key of Object.keys(this.updates) as MaterialEditorStateKey[]) {
      if (!(key in this.oldValues))
        this.oldValues[key] = editorState[key] as never
      const value = this.updates[key]
      if (value === undefined)
        delete editorState[key]
      else
        editorState[key] = value as never
    }
  }

  undo(): void {
    const node = findNode(this.elements, this.nodeId)
    if (!node)
      return
    const editorState = node.editorState ?? (node.editorState = {})
    for (const key of Object.keys(this.oldValues) as MaterialEditorStateKey[]) {
      const value = this.oldValues[key]
      if (value === undefined)
        delete editorState[key]
      else
        editorState[key] = value as never
    }
  }
}

export class UpdateRenderConditionCommand implements Command {
  readonly id = generateId('cmd')
  readonly type = 'update-render-condition'
  readonly description = 'Update render condition'
  private oldCondition: RenderCondition | undefined
  private captured = false

  constructor(
    private elements: MaterialNode[],
    private nodeId: string,
    private condition: RenderCondition | undefined,
    private mergeKey?: string,
    oldCondition?: RenderCondition,
  ) {
    if (oldCondition) {
      this.oldCondition = deepClone(oldCondition)
      this.captured = true
    }
  }

  execute(): void {
    const node = findNode(this.elements, this.nodeId)
    if (!node)
      return
    if (!this.captured) {
      this.oldCondition = deepClone(node.output.renderCondition)
      this.captured = true
    }
    if (this.condition)
      node.output.renderCondition = deepClone(this.condition)
    else
      delete node.output.renderCondition
  }

  undo(): void {
    const node = findNode(this.elements, this.nodeId)
    if (!node)
      return
    if (this.oldCondition)
      node.output.renderCondition = deepClone(this.oldCondition)
    else
      delete node.output.renderCondition
  }

  merge(next: Command): Command | null {
    if (next.type !== this.type || !this.mergeKey)
      return null
    const other = next as UpdateRenderConditionCommand
    if (other.nodeId !== this.nodeId || other.mergeKey !== this.mergeKey)
      return null
    return new UpdateRenderConditionCommand(this.elements, this.nodeId, other.condition, this.mergeKey, this.oldCondition)
  }
}

export type MaterialOutputKey = keyof MaterialOutput

export class UpdateMaterialOutputCommand implements Command {
  readonly id = generateId('cmd')
  readonly type = 'update-material-output'
  readonly description = 'Update material output'
  private oldValues: Partial<MaterialOutput> = {}

  constructor(
    private node: MaterialNode,
    private updates: Partial<MaterialOutput>,
    precomputedOldValues?: Partial<MaterialOutput>,
  ) {
    if (precomputedOldValues)
      this.oldValues = deepClone(precomputedOldValues)
  }

  execute(): void {
    for (const key of Object.keys(this.updates) as MaterialOutputKey[]) {
      if (!(key in this.oldValues))
        this.oldValues[key] = deepClone(this.node.output[key]) as never
      const value = deepClone(this.updates[key])
      if (value == null)
        delete this.node.output[key]
      else
        this.node.output[key] = value as never
    }
  }

  undo(): void {
    for (const key of Object.keys(this.oldValues) as MaterialOutputKey[]) {
      const value = deepClone(this.oldValues[key])
      if (value == null)
        delete this.node.output[key]
      else
        this.node.output[key] = value as never
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

export class AddPageSheetCommand implements Command {
  readonly id = generateId('cmd')
  readonly type = 'add-page-sheet'
  readonly description = 'Add page sheet'
  private pageSnapshot: PageSchema | undefined
  private elementsSnapshot: MaterialNode[] | undefined

  constructor(
    private schema: DocumentSchema,
    private plan: EditorSurfacePlan,
    private targetPageIndex: number,
  ) {}

  execute(): void {
    const target = this.plan.pages[this.targetPageIndex]
    if (!target || target.kind !== 'page')
      return

    this.pageSnapshot = deepClone(this.schema.page)
    this.elementsSnapshot = deepClone(this.schema.elements)

    const currentCount = resolveFixedPageCount(this.schema)
    const insertIndex = Math.min(Math.max(this.targetPageIndex + 1, 1), currentCount)
    const insertY = insertIndex * target.height
    for (const node of this.schema.elements) {
      if (node.y >= insertY)
        node.y += target.height
    }
    writeFixedPageCount(this.schema.page, currentCount + 1)
  }

  undo(): void {
    if (this.pageSnapshot)
      replacePageSchema(this.schema.page, this.pageSnapshot)
    if (this.elementsSnapshot)
      replaceElements(this.schema.elements, this.elementsSnapshot)
  }
}

export class RemovePageSheetCommand implements Command {
  readonly id = generateId('cmd')
  readonly type = 'remove-page-sheet'
  readonly description = 'Remove page sheet'
  private pageSnapshot: PageSchema | undefined
  private elementsSnapshot: MaterialNode[] | undefined

  constructor(
    private schema: DocumentSchema,
    private plan: EditorSurfacePlan,
    private targetPageIndex: number,
  ) {}

  execute(): void {
    const target = this.plan.pages[this.targetPageIndex]
    if (!target || target.kind !== 'page')
      return

    const currentCount = resolveFixedPageCount(this.schema)
    if (currentCount <= 1)
      return

    this.pageSnapshot = deepClone(this.schema.page)
    this.elementsSnapshot = deepClone(this.schema.elements)

    const deleteStart = target.yOffset
    const deleteEnd = target.yOffset + target.height
    const nextElements: MaterialNode[] = []

    for (const node of this.schema.elements) {
      const nodeBottom = node.y + node.height
      const intersectsTarget = node.y < deleteEnd && nodeBottom > deleteStart
      if (intersectsTarget)
        continue

      if (node.y >= deleteEnd)
        nextElements.push({ ...node, y: node.y - target.height })
      else
        nextElements.push(node)
    }

    replaceElements(this.schema.elements, nextElements)
    writeFixedPageCount(this.schema.page, currentCount - 1)
  }

  undo(): void {
    if (this.pageSnapshot)
      replacePageSchema(this.schema.page, this.pageSnapshot)
    if (this.elementsSnapshot)
      replaceElements(this.schema.elements, this.elementsSnapshot)
  }
}

function resolveFixedPageCount(schema: DocumentSchema): number {
  return Math.max(schema.page.pagination?.pageCount ?? schema.page.pages ?? 1, 1)
}

function writeFixedPageCount(page: PageSchema, pageCount: number): void {
  const nextCount = Math.max(Math.floor(pageCount), 1)
  page.pages = nextCount
  page.pagination = {
    ...(page.pagination ?? { strategy: 'fixed-sheets' as const }),
    strategy: 'fixed-sheets',
    pageCount: nextCount,
  }
}

function replacePageSchema(target: PageSchema, snapshot: PageSchema): void {
  for (const key of Object.keys(target) as Array<keyof PageSchema>)
    delete asRecord(target)[key]
  Object.assign(target, deepClone(snapshot))
}

function replaceElements(target: MaterialNode[], snapshot: MaterialNode[]): void {
  target.splice(0, target.length, ...deepClone(snapshot))
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

function readGeometryValue(node: MaterialNode, key: GeometryKey): number | undefined {
  switch (key) {
    case 'x': return node.x
    case 'y': return node.y
    case 'width': return node.width
    case 'height': return node.height
    case 'rotation': return node.rotation
    case 'alpha': return node.alpha
  }
}

function writeGeometryValue(node: MaterialNode, key: GeometryKey, value: number): void {
  switch (key) {
    case 'x':
      node.x = value
      return
    case 'y':
      node.y = value
      return
    case 'width':
      node.width = value
      return
    case 'height':
      node.height = value
      return
    case 'rotation':
      node.rotation = value
      return
    case 'alpha':
      node.alpha = value
  }
}

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
        this.oldValues[key] = readGeometryValue(node, key)
      writeGeometryValue(node, key, this.updates[key]!)
    }
  }

  undo(): void {
    const node = findNode(this.elements, this.nodeId)
    if (!node)
      return
    for (const key of Object.keys(this.oldValues) as GeometryKey[]) {
      writeGeometryValue(node, key, this.oldValues[key]!)
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
