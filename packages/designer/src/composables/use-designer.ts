import type { ElementNode, ElementTypeDefinition, TemplateSchema } from '@easyink/core'
import type { DesignerOptions } from '../types'
import {
  createAddElementCommand,
  createRemoveElementCommand,
  EasyInkEngine,
} from '@easyink/core'
import { ScreenRenderer } from '@easyink/renderer'
import { generateId } from '@easyink/shared'
import { computed, onUnmounted, ref, shallowRef } from 'vue'
import { useLocale } from '../locale/use-locale'
import { useCanvas } from './use-canvas'
import { useInteraction } from './use-interaction'
import { useSelection } from './use-selection'

export function useDesigner(options?: DesignerOptions) {
  // 1. 创建引擎
  const engine = new EasyInkEngine({
    dataSources: options?.dataSources,
    defaultFlowHeight: options?.defaultFlowHeight,
    plugins: options?.plugins,
    schema: options?.schema,
  })

  // 2. 创建渲染器
  const screenRenderer = new ScreenRenderer({
    hooks: engine.hooks,
    zoom: options?.zoom ?? 1,
  })

  // 3. 响应式 Schema
  const schema = shallowRef<TemplateSchema>(engine.getSchema())

  engine.on('schema:change', () => {
    schema.value = engine.getSchema()
  })

  // 4. 子 composable
  const selection = useSelection(engine)
  const canvas = useCanvas({ initialZoom: options?.zoom })
  const locale = useLocale(options?.locale)
  const interaction = useInteraction(engine, selection, canvas)

  // 5. undo/redo 状态
  const canUndo = ref(engine.commands.canUndo)
  const canRedo = ref(engine.commands.canRedo)

  engine.commands.on('stateChanged', () => {
    canUndo.value = engine.commands.canUndo
    canRedo.value = engine.commands.canRedo
  })

  function undo(): void {
    engine.undo()
  }

  function redo(): void {
    engine.redo()
  }

  // 6. 元素操作
  function addElement(type: string): void {
    const def = engine.elementRegistry.get(type)
    if (!def) {
      return
    }
    const element: ElementNode = {
      id: generateId(),
      layout: {
        height: 60,
        position: 'absolute',
        width: 100,
        x: 10,
        y: 10,
        ...def.defaultLayout,
      },
      props: { ...def.defaultProps },
      style: { ...def.defaultStyle },
      type: def.type,
    }
    const cmd = createAddElementCommand(
      { element, index: -1 },
      engine.operations,
    )
    engine.execute(cmd)
    selection.select(element.id)
  }

  function removeSelected(): void {
    const el = selection.selectedElement.value
    if (!el) {
      return
    }
    const elements = engine.schema.schema.elements
    const index = elements.indexOf(el)
    const cmd = createRemoveElementCommand(
      { element: structuredClone(el), index },
      engine.operations,
    )
    engine.execute(cmd)
    selection.deselect()
  }

  const elementTypes = computed<ElementTypeDefinition[]>(() => engine.elementRegistry.list())

  // 清理
  onUnmounted(() => {
    screenRenderer.destroy()
    engine.destroy()
  })

  return {
    addElement,
    canRedo,
    canUndo,
    canvas,
    elementTypes,
    engine,
    interaction,
    locale,
    redo,
    removeSelected,
    renderer: screenRenderer,
    schema,
    selection,
    undo,
  }
}
