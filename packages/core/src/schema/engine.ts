import type { BackgroundLayer } from '@easyink/shared'
import type { SchemaOperations } from '../command'
import type { MaterialRegistry } from '../materials'
import type { MigrationRegistry } from '../migration'
import type { PluginHooks, SchemaChangeEvent } from '../plugin'
import type {
  DataBinding,
  MaterialLayout,
  MaterialNode,
  MaterialStyle,
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
  /** 物料类型注册中心，不传则 validate 跳过类型检查 */
  materialRegistry?: MaterialRegistry
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
  /** 相关物料 ID */
  materialId?: string
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
  private _materialRegistry?: MaterialRegistry
  private _migrationRegistry?: MigrationRegistry

  constructor(options?: SchemaEngineOptions) {
    this._schema = options?.schema ?? createDefaultSchema()
    this._hooks = options?.hooks
    this._materialRegistry = options?.materialRegistry
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
      addMaterial: (material, index) => this.addMaterial(material, index),
      getMaterial: id => this.getMaterial(id),
      getPageSettings: () => this.getPageSettings(),
      removeBackgroundLayer: index => this.removeBackgroundLayer(index),
      removeMaterial: id => this.removeMaterial(id),
      reorderBackgroundLayer: (from, to) => this.reorderBackgroundLayer(from, to),
      reorderMaterial: (id, newIndex) => this.reorderMaterial(id, newIndex),
      updateBackgroundLayer: (index, layer) => this.updateBackgroundLayer(index, layer),
      updateMaterialBinding: (id, binding) => this.updateMaterialBinding(id, binding),
      updateMaterialLayout: (id, layout) => this.updateMaterialLayout(id, layout),
      updateMaterialLock: (id, locked) => this.updateMaterialLock(id, locked),
      updateMaterialProps: (id, props) => this.updateMaterialProps(id, props),
      updateMaterialStyle: (id, style) => this.updateMaterialStyle(id, style),
      updateMaterialVisibility: (id, hidden) => this.updateMaterialVisibility(id, hidden),
      updateExtensions: (key, value) => this.updateExtensions(key, value),
      updatePageSettings: settings => this.updatePageSettings(settings),
    }
  }

  // ── 物料 CRUD（实现 SchemaOperations） ──

  /**
   * 获取一级物料（不递归 children）
   */
  getMaterial(id: string): MaterialNode | undefined {
    return this._schema.materials.find(el => el.id === id)
  }

  /**
   * 深层查找物料（含 children 递归）
   */
  getMaterialById(id: string): MaterialNode | undefined {
    let found: MaterialNode | undefined
    this.traverse((node) => {
      if (node.id === id) {
        found = node
        return false
      }
    })
    return found
  }

  /**
   * 添加物料到 schema.materials
   * @param material - 物料节点
   * @param index - 插入位置，-1 表示末尾
   */
  addMaterial(material: MaterialNode, index: number): void {
    // 触发 beforeMaterialCreate waterfall hook
    const finalMaterial = this._hooks
      ? this._hooks.beforeMaterialCreate.call(material)
      : material

    if (index === -1 || index >= this._schema.materials.length) {
      this._schema.materials.push(finalMaterial)
    }
    else {
      this._schema.materials.splice(index, 0, finalMaterial)
    }

    this._notifyChanged({
      type: 'add',
      materialId: finalMaterial.id,
      newValue: finalMaterial,
    })
  }

  /**
   * 删除物料
   * @returns 被删除的物料，不存在时返回 undefined
   */
  removeMaterial(id: string): MaterialNode | undefined {
    const index = this._findMaterialIndex(id)
    if (index === -1)
      return undefined

    const [removed] = this._schema.materials.splice(index, 1)

    this._notifyChanged({
      type: 'remove',
      materialId: id,
      oldValue: removed,
    })

    return removed
  }

  /**
   * 调整物料在 materials 数组中的位置
   */
  reorderMaterial(id: string, newIndex: number): void {
    const oldIndex = this._findMaterialIndex(id)
    if (oldIndex === -1)
      return

    const [material] = this._schema.materials.splice(oldIndex, 1)
    this._schema.materials.splice(newIndex, 0, material)

    this._notifyChanged({
      type: 'reorder',
      materialId: id,
    })
  }

  /**
   * 更新物料布局（合并 Partial）
   */
  updateMaterialLayout(id: string, layout: Partial<MaterialLayout>): void {
    const material = this.getMaterialById(id)
    if (!material)
      return

    Object.assign(material.layout, layout)

    this._notifyChanged({
      type: 'update',
      materialId: id,
      newValue: material.layout,
    })
  }

  /**
   * 更新物料属性（合并）
   */
  updateMaterialProps(id: string, props: Record<string, unknown>): void {
    const material = this.getMaterialById(id)
    if (!material)
      return

    Object.assign(material.props, props)

    this._notifyChanged({
      type: 'update',
      materialId: id,
      newValue: material.props,
    })
  }

  /**
   * 更新物料样式（合并 Partial）
   */
  updateMaterialStyle(id: string, style: Partial<MaterialStyle>): void {
    const material = this.getMaterialById(id)
    if (!material)
      return

    Object.assign(material.style, style)

    this._notifyChanged({
      type: 'update',
      materialId: id,
      newValue: material.style,
    })
  }

  /**
   * 更新物料数据绑定
   */
  updateMaterialBinding(id: string, binding?: DataBinding): void {
    const material = this.getMaterialById(id)
    if (!material)
      return

    material.binding = binding

    this._notifyChanged({
      type: 'update',
      materialId: id,
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
   * 更新物料显示/隐藏
   */
  updateMaterialVisibility(id: string, hidden: boolean): void {
    const material = this.getMaterialById(id)
    if (!material)
      return

    material.hidden = hidden

    this._notifyChanged({
      type: 'update',
      materialId: id,
      newValue: hidden,
    })
  }

  /**
   * 更新物料锁定状态
   */
  updateMaterialLock(id: string, locked: boolean): void {
    const material = this.getMaterialById(id)
    if (!material)
      return

    material.locked = locked

    this._notifyChanged({
      type: 'update',
      materialId: id,
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
   * 遍历所有物料（含 children 递归）
   * @param callback - 回调，返回 false 停止遍历
   */
  traverse(
    callback: (node: MaterialNode, parent?: MaterialNode) => boolean | void,
  ): void {
    this._traverseNodes(this._schema.materials, undefined, callback)
  }

  /**
   * 查找第一个满足条件的物料（含 children 递归）
   */
  find(
    predicate: (node: MaterialNode) => boolean,
  ): MaterialNode | undefined {
    let found: MaterialNode | undefined
    this.traverse((node) => {
      if (predicate(node)) {
        found = node
        return false
      }
    })
    return found
  }

  /**
   * 查找所有指定类型的物料（含 children 递归）
   */
  findByType(type: string): MaterialNode[] {
    const result: MaterialNode[] = []
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

    // 元素校验 -> 物料校验
    const seenIds = new Set<string>()
    this.traverse((node) => {
      // 缺少 id
      if (!node.id) {
        issues.push({
          level: 'error',
          message: 'Material is missing id',
          path: 'materials',
        })
        return
      }

      // 重复 ID
      if (seenIds.has(node.id)) {
        issues.push({
          level: 'error',
          message: `Duplicate material id: ${node.id}`,
          materialId: node.id,
          path: 'materials',
        })
      }
      else {
        seenIds.add(node.id)
      }

      // 缺少 type
      if (!node.type) {
        issues.push({
          level: 'error',
          message: `Material "${node.id}" is missing type`,
          materialId: node.id,
          path: `materials.${node.id}.type`,
        })
      }

      // 缺少 layout
      if (!node.layout) {
        issues.push({
          level: 'error',
          message: `Material "${node.id}" is missing layout`,
          materialId: node.id,
          path: `materials.${node.id}.layout`,
        })
      }

      // 未注册类型（warning）
      if (this._materialRegistry && node.type && !this._materialRegistry.has(node.type)) {
        issues.push({
          level: 'warning',
          message: `Material type "${node.type}" is not registered`,
          materialId: node.id,
          path: `materials.${node.id}.type`,
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

  private _findMaterialIndex(id: string): number {
    return this._schema.materials.findIndex(el => el.id === id)
  }

  private _traverseNodes(
    nodes: MaterialNode[],
    parent: MaterialNode | undefined,
    callback: (node: MaterialNode, parent?: MaterialNode) => boolean | void,
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
