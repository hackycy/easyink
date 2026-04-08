import type { MaterialNode } from '@easyink/schema'
import type { DesignerStore } from '../store/designer-store'
import type { NodeSignal } from '../types'
import { watch } from 'vue'

/**
 * Create a framework-agnostic NodeSignal wrapping Vue reactivity.
 * The signal tracks a specific element by ID in the designer store.
 * Extension code receives this interface and never depends on Vue.
 */
export function createNodeSignal(store: DesignerStore, nodeId: string): NodeSignal {
  return {
    get(): MaterialNode {
      const node = store.getElementById(nodeId)
      if (!node) {
        throw new Error(`NodeSignal: element "${nodeId}" not found`)
      }
      return node
    },
    subscribe(callback: (node: MaterialNode) => void): () => void {
      const stop = watch(
        () => store.getElementById(nodeId),
        (node) => {
          if (node) {
            callback(node)
          }
        },
        { deep: true },
      )
      return stop
    },
  }
}
