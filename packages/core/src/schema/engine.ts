import type { BackgroundLayer } from '@easyink/shared'
import type { SchemaOperations } from '../command'
import type { ElementRegistry } from '../elements'
import type { MigrationRegistry } from '../migration'
import type { PluginHooks, SchemaChangeEvent } from '../plugin'
import type {
  DataBinding,
  ElementLayout,
  ElementNode,
  ElementStyle,
  PageSettings,
  TemplateSchema,
} from './types'
import { cloneDeep } from '@easyink/shared'
import { createDefaultSchema, SCHEMA_VERSION } from './defaults'

// ─── 类型定义 ───

/**
 * SchemaEngine 配置项
 */
export interface SchemaEngineOptions {
  /** 初始 Schema，不传则使用 createDefaultSchema() */
  schema?: TemplateSchema
  /** 插件钩子，不传则不触发钩子（纯 headless 使用） */
  hooks?: PluginHooks
  /** 元素类型注册中心，不传则 validate 跳过类型检查 */
  elementRegistry?: ElementRegistry
  /** 迁移注册表，传入后 loadSchema 可自动迁移旧版 Schema */
  migrationRegistry?: MigrationRegistry
}

/**
 * Schema 校验问题
 */
export interface SchemaValidationIssue {
  /** 问题级别 */
  level: 'error' | 'warning'
  /** 问题描述 */
  message: string
  /** 相关元素 ID */
  elementId?: string
  /** 问题字段路径 */
  path?: string
}

/**
 * Schema 校验结果
 */
export interface SchemaValidationResult {
  /** 是否有效（无 error 级别问题即为 true，warning 不影响） */
  valid: boolean
  /** 所有问题列表 */
  issues: SchemaValidationIssue[]
}

// ─── SchemaEngine ───

/**
 * SchemaEngine — 持有 Schema 状态，提供 CRUD、遍历、校验、序列化 API
 *
 * 实现 SchemaOperations 接口供 Command 系统回调，确保所有修改可撤销。
 * 写操作完成后触发 schemaChanged 异步事件通知插件。
 * beforeSchemaChange bail hook 的调用留给上层 EasyInkEngine，
 * SchemaOperations 层不做拦截（Command.execute() 应该总是成功）。
 */
export class SchemaEngine {
  private _schema: TemplateSchema
  private _hooks?: PluginHooks
  private _elementRegistry?: ElementRegistry
  private _migrationRegistry?: MigrationRegistry

  constructor(options?: SchemaEngineOptions) {
    this._schema = options?.schema ?? createDefaultSchema()
    this._hooks = options?.hooks
    this._elementRegistry = options?.elementRegistry
    this._migrationRegistry = options?.migrationRegistry
  }

  // ── Schema 访问 ──

  /** 获取当前 Schema（直接引用，外部不应直接修改） */
  get schema(): TemplateSchema {
    return this._schema
  }

  // ── SchemaOperations 对象 ──

  /** 获取 SchemaOperations 对象（传给 command 工厂函数） */
  get operations(): SchemaOperations {
    return {
      addBackgroundLayer: (layer, index) => this.addBackgroundLayer(layer, index),
      addElement: (element, index) => this.addElement(element, index),
      getElement: id => this.getElement(id),
      getPageSettings: () => this.getPageSettings(),
      removeBackgroundLayer: index => this.removeBackgroundLayer(index),
      removeElement: id => this.removeElement(id),
      reorderBackgroundLayer: (from, to) => this.reorderBackgroundLayer(from, to),
      reorderElement: (id, newIndex) => this.reorderElement(id, newIndex),
      updateBackgroundLayer: (index, layer) => this.updateBackgroundLayer(index, layer),
      updateElementBinding: (id, binding) => this.updateElementBinding(id, binding),
      updateElementLayout: (id, layout) => this.updateElementLayout(id, layout),
      updateElementLock: (id, locked) => this.updateElementLock(id, locked),
      updateElementProps: (id, props) => this.updateElementProps(id, props),
      updateElementStyle: (id, style) => this.updateElementStyle(id, style),
      updateElementVisibility: (id, hidden) => this.updateElementVisibility(id, hidden),
      updateExtensions: (key, value) => this.updateExtensions(key, value),
      updatePageSettings: settings => this.updatePageSettings(settings),
    }
  }

  // ── 元素 CRUD（实现 SchemaOperations） ──

  /**
   * 获取一级元素（不递归 children）
   */
  getElement(id: string): ElementNode | undefined {
    return this._schema.elements.find(el => el.id === id)
  }

  /**
   * 深层查找元素（含 children 递归）
   */
  getElementById(id: string): ElementNode | undefined {
    let found: ElementNode | undefined
    this.traverse((node) => {
      if (node.id === id) {
        found = node
        return false
      }
    })
    return found
  }

  /**
   * 添加元素到 schema.elements
   * @param element - 元素节点
   * @param index - 插入位置，-1 表示末尾
   */
  addElement(element: ElementNode, index: number): void {
    // 触发 beforeElementCreate waterfall hook
    const finalElement = this._hooks
      ? this._hooks.beforeElementCreate.call(element)
      : element

    if (index === -1 || index >= this._schema.elements.length) {
      this._schema.elements.push(finalElement)
    }
    else {
      this._schema.elements.splice(index, 0, finalElement)
    }

    this._notifyChanged({
      type: 'add',
      elementId: finalElement.id,
      newValue: finalElement,
    })
  }

  /**
   * 删除元素
   * @returns 被删除的元素，不存在时返回 undefined
   */
  removeElement(id: string): ElementNode | undefined {
    const index = this._findElementIndex(id)
    if (index === -1)
      return undefined

    const [removed] = this._schema.elements.splice(index, 1)

    this._notifyChanged({
      type: 'remove',
      elementId: id,
      oldValue: removed,
    })

    return removed
  }

  /**
   * 调整元素在 elements 数组中的位置
   */
  reorderElement(id: string, newIndex: number): void {
    const oldIndex = this._findElementIndex(id)
    if (oldIndex === -1)
      return

    const [element] = this._schema.elements.splice(oldIndex, 1)
    this._schema.elements.splice(newIndex, 0, element)

    this._notifyChanged({
      type: 'reorder',
      elementId: id,
    })
  }

  /**
   * 更新元素布局（合并 Partial）
   */
  updateElementLayout(id: string, layout: Partial<ElementLayout>): void {
    const element = this.getElementById(id)
    if (!element)
      return

    Object.assign(element.layout, layout)

    this._notifyChanged({
      type: 'update',
      elementId: id,
      newValue: element.layout,
    })
  }

  /**
   * 更新元素属性（合并）
   */
  updateElementProps(id: string, props: Record<string, unknown>): void {
    const element = this.getElementById(id)
    if (!element)
      return

    Object.assign(element.props, props)

    this._notifyChanged({
      type: 'update',
      elementId: id,
      newValue: element.props,
    })
  }

  /**
   * 更新元素样式（合并 Partial）
   */
  updateElementStyle(id: string, style: Partial<ElementStyle>): void {
    const element = this.getElementById(id)
    if (!element)
      return

    Object.assign(element.style, style)

    this._notifyChanged({
      type: 'update',
      elementId: id,
      newValue: element.style,
    })
  }

  /**
   * 更新元素数据绑定
   */
  updateElementBinding(id: string, binding?: DataBinding): void {
    const element = this.getElementById(id)
    if (!element)
      return

    element.binding = binding

    this._notifyChanged({
      type: 'update',
      elementId: id,
      newValue: binding,
    })
  }

  /**
   * 获取页面设置
   */
  getPageSettings(): PageSettings {
    return this._schema.page
  }

  /**
   * 更新页面设置（整体替换）
   */
  updatePageSettings(settings: PageSettings): void {
    const oldSettings = this._schema.page
    this._schema.page = settings

    this._notifyChanged({
      type: 'update',
      oldValue: oldSettings,
      newValue: settings,
    })
  }

  /**
   * 添加背景层
   * @param layer - 背景层
   * @param index - 插入位置，-1 表示末尾
   */
  addBackgroundLayer(layer: BackgroundLayer, index: number): void {
    if (!this._schema.page.background) {
      this._schema.page.background = { layers: [] }
    }
    const layers = this._schema.page.background.layers
    if (index === -1 || index >= layers.length) {
      layers.push(layer)
    }
    else {
      layers.splice(index, 0, layer)
    }

    this._notifyChanged({ type: 'add', newValue: layer })
  }

  /**
   * 删除背景层
   * @returns 被删除的层，不存在时返回 undefined
   */
  removeBackgroundLayer(index: number): BackgroundLayer | undefined {
    const layers = this._schema.page.background?.layers
    if (!layers || index < 0 || index >= layers.length)
      return undefined

    const [removed] = layers.splice(index, 1)

    this._notifyChanged({ type: 'remove', oldValue: removed })

    return removed
  }

  /**
   * 更新背景层（整体替换指定索引的层）
   */
  updateBackgroundLayer(index: number, layer: BackgroundLayer): void {
    const layers = this._schema.page.background?.layers
    if (!layers || index < 0 || index >= layers.length)
      return

    const oldLayer = layers[index]
    layers[index] = layer

    this._notifyChanged({ type: 'update', oldValue: oldLayer, newValue: layer })
  }

  /**
   * 调整背景层顺序
   */
  reorderBackgroundLayer(fromIndex: number, toIndex: number): void {
    const layers = this._schema.page.background?.layers
    if (!layers || fromIndex < 0 || fromIndex >= layers.length)
      return

    const [layer] = layers.splice(fromIndex, 1)
    layers.splice(toIndex, 0, layer)

    this._notifyChanged({ type: 'reorder' })
  }

  /**
   * 更新元素显示/隐藏
   */
  updateElementVisibility(id: string, hidden: boolean): void {
    const element = this.getElementById(id)
    if (!element)
      return

    element.hidden = hidden

    this._notifyChanged({
      type: 'update',
      elementId: id,
      newValue: hidden,
    })
  }

  /**
   * 更新元素锁定状态
   */
  updateElementLock(id: string, locked: boolean): void {
    const element = this.getElementById(id)
    if (!element)
      return

    element.locked = locked

    this._notifyChanged({
      type: 'update',
      elementId: id,
      newValue: locked,
    })
  }

  /**
   * 更新 Schema 扩展字段
   */
  updateExtensions(key: string, value: unknown): void {
    if (!this._schema.extensions) {
      this._schema.extensions = {}
    }
    this._schema.extensions[key] = value

    this._notifyChanged({
      type: 'update',
      newValue: value,
    })
  }

  // ── 遍历 ──

  /**
   * 遍历所有元素（含 children 递归）
   * @param callback - 回调，返回 false 停止遍历
   */
  traverse(
    callback: (node: ElementNode, parent?: ElementNode) => boolean | void,
  ): void {
    this._traverseNodes(this._schema.elements, undefined, callback)
  }

  /**
   * 查找第一个满足条件的元素（含 children 递归）
   */
  find(
    predicate: (node: ElementNode) => boolean,
  ): ElementNode | undefined {
    let found: ElementNode | undefined
    this.traverse((node) => {
      if (predicate(node)) {
        found = node
        return false
      }
    })
    return found
  }

  /**
   * 查找所有指定类型的元素（含 children 递归）
   */
  findByType(type: string): ElementNode[] {
    const result: ElementNode[] = []
    this.traverse((node) => {
      if (node.type === type)
        result.push(node)
    })
    return result
  }

  // ── 校验 ──

  /**
   * 校验当前 Schema 结构
   */
  validate(): SchemaValidationResult {
    const issues: SchemaValidationIssue[] = []

    // 版本检查
    if (!this._schema.version) {
      issues.push({
        level: 'error',
        message: 'Schema version is missing',
        path: 'version',
      })
    }

    // 元素校验
    const seenIds = new Set<string>()
    this.traverse((node) => {
      // 缺少 id
      if (!node.id) {
        issues.push({
          level: 'error',
          message: 'Element is missing id',
          path: 'elements',
        })
        return
      }

      // 重复 ID
      if (seenIds.has(node.id)) {
        issues.push({
          level: 'error',
          message: `Duplicate element id: ${node.id}`,
          elementId: node.id,
          path: 'elements',
        })
      }
      else {
        seenIds.add(node.id)
      }

      // 缺少 type
      if (!node.type) {
        issues.push({
          level: 'error',
          message: `Element "${node.id}" is missing type`,
          elementId: node.id,
          path: `elements.${node.id}.type`,
        })
      }

      // 缺少 layout
      if (!node.layout) {
        issues.push({
          level: 'error',
          message: `Element "${node.id}" is missing layout`,
          elementId: node.id,
          path: `elements.${node.id}.layout`,
        })
      }

      // 未注册类型（warning）
      if (this._elementRegistry && node.type && !this._elementRegistry.has(node.type)) {
        issues.push({
          level: 'warning',
          message: `Element type "${node.type}" is not registered`,
          elementId: node.id,
          path: `elements.${node.id}.type`,
        })
      }
    })

    return {
      valid: issues.every(i => i.level !== 'error'),
      issues,
    }
  }

  // ── 序列化/反序列化 ──

  /**
   * 导出 Schema 深拷贝（修改输出不影响内部状态）
   */
  toJSON(): TemplateSchema {
    return cloneDeep(this._schema)
  }

  /**
   * 加载 Schema（替换当前状态）
   *
   * 版本处理策略：
   * 1. 版本高于当前 → throw
   * 2. 同 major 版本 → 直接使用（minor/patch 向后兼容）
   * 3. 低 major 版本 → 有 migrationRegistry 则自动迁移，否则 throw
   *
   * @throws {Error} 如果 schema 版本高于当前，或低 major 且无迁移路径
   */
  loadSchema(schema: TemplateSchema): void {
    if (schema.version && this._compareVersion(schema.version, SCHEMA_VERSION) > 0) {
      throw new Error(
        `Schema version ${schema.version} is newer than the supported version ${SCHEMA_VERSION}. Please upgrade the library.`,
      )
    }

    // 检查是否需要 major 版本迁移
    if (schema.version) {
      const schemaMajor = this._parseMajor(schema.version)
      const currentMajor = this._parseMajor(SCHEMA_VERSION)

      if (schemaMajor < currentMajor) {
        if (!this._migrationRegistry) {
          throw new Error(
            `Schema version ${schema.version} requires migration to ${SCHEMA_VERSION}, but no MigrationRegistry is configured.`,
          )
        }
        const migrated = this._migrationRegistry.migrate(schema as unknown as Record<string, unknown>)
        this._schema = migrated
        this._notifyChanged({ type: 'update' })
        return
      }
    }

    this._schema = schema
    this._notifyChanged({ type: 'update' })
  }

  // ── 内部方法 ──

  private _findElementIndex(id: string): number {
    return this._schema.elements.findIndex(el => el.id === id)
  }

  private _traverseNodes(
    nodes: ElementNode[],
    parent: ElementNode | undefined,
    callback: (node: ElementNode, parent?: ElementNode) => boolean | void,
  ): boolean {
    for (const node of nodes) {
      const result = callback(node, parent)
      if (result === false)
        return false

      if (node.children && node.children.length > 0) {
        const shouldContinue = this._traverseNodes(node.children, node, callback)
        if (!shouldContinue)
          return false
      }
    }
    return true
  }

  private _notifyChanged(_event: SchemaChangeEvent): void {
    this._hooks?.schemaChanged.emit(this._schema)
  }

  /**
   * 比较两个 SemVer 版本字符串
   * @returns >0 a大于b, <0 a小于b, 0 相等
   */
  private _compareVersion(a: string, b: string): number {
    const pa = a.split('.').map(Number)
    const pb = b.split('.').map(Number)
    for (let i = 0; i < 3; i++) {
      const diff = (pa[i] || 0) - (pb[i] || 0)
      if (diff !== 0)
        return diff
    }
    return 0
  }

  /** 解析版本字符串的 major 部分 */
  private _parseMajor(version: string): number {
    return Number.parseInt(version.split('.')[0], 10)
  }
}
