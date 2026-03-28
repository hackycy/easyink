import type { SchemaOperations } from '../command'
import type { ElementRegistry } from '../elements'
import type { PluginHooks, SchemaChangeEvent } from '../plugin'
import type {
  DataBinding,
  ElementLayout,
  ElementNode,
  ElementStyle,
  PageSettings,
  TemplateSchema,
} from './types'
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

  constructor(options?: SchemaEngineOptions) {
    this._schema = options?.schema ?? createDefaultSchema()
    this._hooks = options?.hooks
    this._elementRegistry = options?.elementRegistry
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
      addElement: (element, index) => this.addElement(element, index),
      getElement: id => this.getElement(id),
      getPageSettings: () => this.getPageSettings(),
      removeElement: id => this.removeElement(id),
      reorderElement: (id, newIndex) => this.reorderElement(id, newIndex),
      updateElementBinding: (id, binding) => this.updateElementBinding(id, binding),
      updateElementLayout: (id, layout) => this.updateElementLayout(id, layout),
      updateElementProps: (id, props) => this.updateElementProps(id, props),
      updateElementStyle: (id, style) => this.updateElementStyle(id, style),
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
    return structuredClone(this._schema)
  }

  /**
   * 加载 Schema（替换当前状态）
   * @throws {Error} 如果 schema 版本高于当前库版本
   */
  loadSchema(schema: TemplateSchema): void {
    if (schema.version && this._compareVersion(schema.version, SCHEMA_VERSION) > 0) {
      throw new Error(
        `Schema version ${schema.version} is newer than the supported version ${SCHEMA_VERSION}. Please upgrade the library.`,
      )
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
}
