import type { ElementRenderFunction } from '../types'

/**
 * ElementRenderRegistry — 元素类型 → 渲染函数映射
 *
 * 渲染器侧的注册中心，将元素 type 字符串映射到对应的渲染函数。
 * 与 core 的 ElementRegistry（声明性元信息）互补。
 */
export class ElementRenderRegistry {
  private _renderers = new Map<string, ElementRenderFunction>()

  /**
   * 注册元素渲染函数
   */
  register(type: string, fn: ElementRenderFunction): void {
    this._renderers.set(type, fn)
  }

  /**
   * 注销元素渲染函数
   */
  unregister(type: string): boolean {
    return this._renderers.delete(type)
  }

  /**
   * 获取元素渲染函数
   */
  get(type: string): ElementRenderFunction | undefined {
    return this._renderers.get(type)
  }

  /**
   * 是否已注册
   */
  has(type: string): boolean {
    return this._renderers.has(type)
  }

  /**
   * 清空所有注册
   */
  clear(): void {
    this._renderers.clear()
  }
}
