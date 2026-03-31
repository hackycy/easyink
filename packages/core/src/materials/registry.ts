import type { MaterialTypeDefinition } from './types'

/**
 * 物料类型注册中心 -- 管理所有物料类型定义
 *
 * 支持内置物料和插件扩展物料。同名注册时后者覆盖前者。
 */
export class MaterialRegistry {
  private definitions = new Map<string, MaterialTypeDefinition>()

  /**
   * 注册物料类型定义
   *
   * 如果已存在同 type 的定义，将被覆盖。
   * @param definition - 物料类型定义
   * @throws {TypeError} 如果 type 为空字符串
   */
  register(definition: MaterialTypeDefinition): void {
    if (!definition.type)
      throw new TypeError('[EasyInk] Material type must be a non-empty string')

    this.definitions.set(definition.type, definition)
  }

  /**
   * 批量注册物料类型定义
   * @param definitions - 物料类型定义数组
   */
  registerAll(definitions: MaterialTypeDefinition[]): void {
    for (const def of definitions) {
      this.register(def)
    }
  }

  /**
   * 注销物料类型定义
   * @param type - 物料类型标识
   * @returns 是否成功注销（type 不存在时返回 false）
   */
  unregister(type: string): boolean {
    return this.definitions.delete(type)
  }

  /**
   * 获取物料类型定义
   * @param type - 物料类型标识
   * @returns 物料类型定义，不存在则返回 undefined
   */
  get(type: string): MaterialTypeDefinition | undefined {
    return this.definitions.get(type)
  }

  /**
   * 检查物料类型是否已注册
   * @param type - 物料类型标识
   */
  has(type: string): boolean {
    return this.definitions.has(type)
  }

  /**
   * 获取所有已注册的物料类型定义
   * @returns 物料类型定义数组（按注册顺序）
   */
  list(): MaterialTypeDefinition[] {
    return [...this.definitions.values()]
  }

  /**
   * 按分类获取已注册的物料类型定义
   * @param category - 分类名称
   * @returns 指定分类的物料类型定义数组
   */
  listByCategory(category: string): MaterialTypeDefinition[] {
    return [...this.definitions.values()].filter(d => d.category === category)
  }

  /**
   * 获取所有已注册的分类名称
   * @returns 分类名称数组（去重）
   */
  categories(): string[] {
    const cats = new Set<string>()
    for (const def of this.definitions.values()) {
      if (def.category)
        cats.add(def.category)
    }
    return [...cats]
  }

  /**
   * 获取所有已注册的物料类型标识
   * @returns 类型标识数组
   */
  types(): string[] {
    return [...this.definitions.keys()]
  }

  /**
   * 清空所有已注册的物料类型
   */
  clear(): void {
    this.definitions.clear()
  }
}
