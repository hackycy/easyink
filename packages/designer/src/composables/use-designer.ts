import type { MaterialNode, MaterialTypeDefinition, TemplateSchema } from '@easyink/core'
import type { DesignerOptions } from '../types'
import {
  createAddMaterialCommand,
  createRemoveMaterialCommand,
  EasyInkEngine,
} from '@easyink/core'
import { ScreenRenderer } from '@easyink/renderer'
import { cloneDeep, generateId } from '@easyink/shared'
import { computed, onUnmounted, ref, shallowRef } from 'vue'
import { InteractionStrategyRegistry, useStrategyManager } from '../interaction'
import { useLocale } from '../locale/use-locale'
import { useBatchOperations } from './use-batch-operations'
import { useCanvas } from './use-canvas'
import { useContextMenu } from './use-context-menu'
import { useGuides } from './use-guides'
import { useInteraction } from './use-interaction'
import { useMarquee } from './use-marquee'
import { useSelection } from './use-selection'
import { useSnapping } from './use-snapping'

export function useDesigner(options?: DesignerOptions) {
  // 1. 创建引擎
  const engine = new EasyInkEngine({
    dataSources: options?.dataSources,
    defaultFlowHeight: options?.defaultFlowHeight,
    plugins: options?.plugins,
    schema: options?.schema,
  })
  engine.setData(options?.data ?? {})

  // 2. 创建渲染器（设计模式：显示占位符而非实际数据）
  const screenRenderer = new ScreenRenderer({
    hooks: engine.hooks,
    zoom: options?.zoom ?? 1,
    designMode: true,
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
  const snapping = useSnapping(engine, canvas)
  const interaction = useInteraction(engine, selection, canvas, snapping)
  const marquee = useMarquee(engine, selection, canvas)
  const batchOperations = useBatchOperations(engine, selection)
  const guides = useGuides(engine)
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

  // 6. 交互策略
  const strategyRegistry = new InteractionStrategyRegistry()
  const strategyManager = useStrategyManager(
    engine,
    strategyRegistry,
    () => selection.selectedElement.value,
  )

  // 6.1 注册外部物料插件
  if (options?.materials) {
    for (const plugin of options.materials) {
      engine.materialRegistry.register(plugin.definition)
      if (plugin.render) {
        screenRenderer.domRenderer.registry.register(plugin.definition.type, plugin.render)
      }
      if (plugin.interaction) {
        strategyRegistry.register(plugin.definition.type, plugin.interaction)
      }
    }
  }

  // 7. 物料操作
  function addMaterial(type: string, preMade?: MaterialNode): void {
    const def = engine.materialRegistry.get(type)
    if (!def) {
      return
    }
    const material: MaterialNode = preMade ?? {
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
    if (!preMade) {
      material.id = generateId()
    }
    const cmd = createAddMaterialCommand(
      { material, index: -1 },
      engine.operations,
    )
    engine.execute(cmd)
    selection.select(material.id)
  }

  function removeSelected(): void {
    // Multi-select: use batch delete
    if (selection.selectedIds.value.length > 1) {
      batchOperations.batchDelete()
      return
    }

    const el = selection.selectedElement.value
    if (!el) {
      return
    }
    const materials = engine.schema.schema.materials
    const index = materials.indexOf(el)
    const cmd = createRemoveMaterialCommand(
      { material: cloneDeep(el), index },
      engine.operations,
    )
    engine.execute(cmd)
    selection.deselect()
  }

  const materialTypes = computed<MaterialTypeDefinition[]>(() => engine.materialRegistry.list())

  // 8. 右键菜单
  const contextMenu = useContextMenu(engine, selection, removeSelected)

  // 清理
  onUnmounted(() => {
    screenRenderer.destroy()
    engine.destroy()
  })

  return {
    addMaterial,
    batchOperations,
    canRedo,
    canUndo,
    canvas,
    contextMenu,
    engine,
    guides,
    interaction,
    locale,
    marquee,
    materialTypes,
    redo,
    removeSelected,
    renderer: screenRenderer,
    schema,
    selection,
    snapping,
    strategyManager,
    strategyRegistry,
    undo,
  }
}
