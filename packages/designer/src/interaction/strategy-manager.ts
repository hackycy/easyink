import type { EasyInkEngine, MaterialNode } from '@easyink/core'
import type { InteractionContext, InteractionState } from './strategy'
import type { InteractionStrategyRegistry } from './strategy-registry'
import { ref } from 'vue'

/**
 * InteractionStrategyManager -- 管理当前激活的交互策略
 *
 * 负责：
 * - 维护两级状态机（selected / editing）
 * - 事件分发给活动 Strategy
 * - 状态切换时的生命周期回调
 */
export function useStrategyManager(
  engine: EasyInkEngine,
  registry: InteractionStrategyRegistry,
  getSelectedMaterial: () => MaterialNode | undefined,
) {
  const interactionState = ref<InteractionState>('selected')
  const editingMaterialId = ref<string | null>(null)

  const context: InteractionContext = {
    executeCommand: cmd => engine.execute(cmd),
    getEngine: () => engine,
    getSelectedMaterial,
  }

  /**
   * 进入编辑状态
   */
  function enterEditing(material: MaterialNode): void {
    if (interactionState.value === 'editing') {
      exitEditing()
    }
    interactionState.value = 'editing'
    editingMaterialId.value = material.id

    const strategy = registry.get(material.type)
    strategy.onEnterEditing?.(material, context)
  }

  /**
   * 退出编辑状态
   */
  function exitEditing(): void {
    if (interactionState.value !== 'editing') {
      return
    }

    const materialId = editingMaterialId.value
    if (materialId) {
      const material = engine.schema.getMaterialById(materialId)
      if (material) {
        const strategy = registry.get(material.type)
        strategy.onExitEditing?.(material, context)
      }
    }

    interactionState.value = 'selected'
    editingMaterialId.value = null
  }

  /**
   * 获取当前交互状态
   */
  function getState(): InteractionState {
    return interactionState.value
  }

  /**
   * 获取策略注册表
   */
  function getRegistry(): InteractionStrategyRegistry {
    return registry
  }

  /**
   * 获取交互上下文
   */
  function getContext(): InteractionContext {
    return context
  }

  return {
    editingMaterialId,
    enterEditing,
    exitEditing,
    getContext,
    getRegistry,
    getState,
    interactionState,
  }
}

export type StrategyManager = ReturnType<typeof useStrategyManager>
