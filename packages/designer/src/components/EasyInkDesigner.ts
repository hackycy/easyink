import type { DesignerContext, DesignerOptions } from '../types'
import { defineComponent, h, provide, watch } from 'vue'
import { useDesigner } from '../composables/use-designer'
import { DESIGNER_INJECTION_KEY } from '../types'
import { DesignCanvas } from './DesignCanvas'
import { PropertyPanel } from './PropertyPanel'
import { StatusBar } from './StatusBar'
import { ToolbarPanel } from './ToolbarPanel'

export const EasyInkDesigner = defineComponent({
  name: 'EasyInkDesigner',
  props: {
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
      addElement: designer.addElement,
      canRedo: designer.canRedo,
      canUndo: designer.canUndo,
      canvas: designer.canvas,
      elementTypes: designer.elementTypes,
      engine: designer.engine,
      interaction: designer.interaction,
      locale: designer.locale,
      redo: designer.redo,
      removeSelected: designer.removeSelected,
      renderer: designer.renderer,
      schema: designer.schema,
      selection: designer.selection,
      undo: designer.undo,
    }

    provide(DESIGNER_INJECTION_KEY, context)

    // 向外 emit schema 变更
    watch(designer.schema, (newSchema) => {
      emit('update:schema', newSchema)
    })

    return () => {
      return h('div', { class: 'easyink-designer' }, [
        h(ToolbarPanel),
        h('div', { class: 'easyink-body' }, [
          h(DesignCanvas),
          h(PropertyPanel),
        ]),
        h(StatusBar),
      ])
    }
  },
})
