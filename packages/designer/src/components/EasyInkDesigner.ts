import type { DesignerContext, DesignerOptions } from '../types'
import { defineComponent, h, provide, triggerRef, watch } from 'vue'
import { useDesigner } from '../composables/use-designer'
import { DESIGNER_INJECTION_KEY } from '../types'
import { ContextMenu } from './ContextMenu'
import { DataBindingLayer } from './DataBindingLayer'
import { DesignCanvas } from './DesignCanvas'
import { MaterialBar } from './MaterialBar'
import { MaterialInteractionLayer } from './MaterialInteractionLayer'
import { PropertyPanel } from './PropertyPanel'
import { SidebarPanel } from './SidebarPanel'
import { StatusBar } from './StatusBar'
import { ToolbarPanel } from './ToolbarPanel'

export const EasyInkDesigner = defineComponent({
  name: 'EasyInkDesigner',
  props: {
    data: { default: undefined, type: Object },
    dataSources: { default: undefined, type: Array },
    defaultFlowHeight: { default: undefined, type: Number },
    locale: { default: undefined, type: Object },
    plugins: { default: undefined, type: Array },
    schema: { default: undefined, type: Object },
    zoom: { default: 1, type: Number },
  },
  emits: ['update:schema'],
  setup(props, { emit }) {
    const designer = useDesigner(props as unknown as DesignerOptions)

    // 提供上下文给子组件
    const context: DesignerContext = {
      addMaterial: designer.addMaterial,
      batchOperations: designer.batchOperations,
      canRedo: designer.canRedo,
      canUndo: designer.canUndo,
      canvas: designer.canvas,
      contextMenu: designer.contextMenu,
      engine: designer.engine,
      guides: designer.guides,
      interaction: designer.interaction,
      locale: designer.locale,
      marquee: designer.marquee,
      materialTypes: designer.materialTypes,
      redo: designer.redo,
      removeSelected: designer.removeSelected,
      renderer: designer.renderer,
      schema: designer.schema,
      selection: designer.selection,
      snapping: designer.snapping,
      strategyManager: designer.strategyManager,
      undo: designer.undo,
    }

    provide(DESIGNER_INJECTION_KEY, context)

    // 向外 emit schema 变更
    watch(designer.schema, (newSchema) => {
      emit('update:schema', newSchema)
    })

    watch(() => props.data, (newData) => {
      designer.engine.setData((newData ?? {}) as Record<string, unknown>)
      triggerRef(designer.schema)
    }, { deep: true, immediate: true })

    return () => {
      return h('div', { class: 'easyink-designer' }, [
        h(ToolbarPanel),
        h('div', { class: 'easyink-body' }, [
          h(MaterialBar),
          h(SidebarPanel),
          h('div', { class: 'easyink-canvas-area' }, [
            h(DesignCanvas),
            h(MaterialInteractionLayer),
            h(DataBindingLayer),
          ]),
          h(PropertyPanel),
        ]),
        h(StatusBar),
        h(ContextMenu),
      ])
    }
  },
})
