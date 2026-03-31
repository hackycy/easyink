import type { InteractionStrategy } from './strategy'
import { defaultStrategy } from './strategy'

/**
 * InteractionStrategyRegistry -- 物料交互策略注册中心
 *
 * 管理物料类型到交互策略的映射。
 * 未注册自定义策略的物料类型将使用默认策略（仅通用移动/缩放）。
 */
export class InteractionStrategyRegistry {
  private strategies = new Map<string, InteractionStrategy>()

  /**
   * 注册物料类型的交互策略
   * @param materialType - 物料类型标识
   * @param strategy - 交互策略实例
   */
  register(materialType: string, strategy: InteractionStrategy): void {
    this.strategies.set(materialType, strategy)
  }

  /**
   * 获取物料类型的交互策略
   *
   * 如果未注册，返回默认策略。
   * @param materialType - 物料类型标识
   */
  get(materialType: string): InteractionStrategy {
    return this.strategies.get(materialType) ?? defaultStrategy
  }

  /**
   * 检查物料类型是否注册了自定义交互策略
   * @param materialType - 物料类型标识
   */
  has(materialType: string): boolean {
    return this.strategies.has(materialType)
  }

  /**
   * 注销物料类型的交互策略
   * @param materialType - 物料类型标识
   */
  unregister(materialType: string): boolean {
    return this.strategies.delete(materialType)
  }

  /**
   * 清空所有已注册的交互策略
   */
  clear(): void {
    this.strategies.clear()
  }
}
