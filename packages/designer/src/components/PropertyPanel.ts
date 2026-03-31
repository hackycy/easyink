import {
  createMoveMaterialCommand,
  createResizeMaterialCommand,
  createUpdateBindingCommand,
  createUpdatePropsCommand,
  createUpdateStyleCommand,
} from '@easyink/core'
import { EiPropForm } from '@easyink/ui'
import { defineComponent, h, inject } from 'vue'
import { getEditor } from '../editors/EditorRegistry'
import { DESIGNER_INJECTION_KEY } from '../types'

// 确保内置编辑器已注册
import '../editors/index'

export const PropertyPanel = defineComponent({
  name: 'PropertyPanel',
  setup() {
    const ctx = inject(DESIGNER_INJECTION_KEY)!

    function renderEditorRow(label: string, editorType: string, value: unknown, options: Record<string, unknown>, onChange: (v: unknown) => void) {
      const EditorComp = getEditor(editorType)
      if (!EditorComp) {
        return null
      }

      return h('div', { class: 'easyink-property-row' }, [
        h('span', { class: 'easyink-property-row__label' }, label),
        h('div', { class: 'easyink-property-row__editor' }, [
          h(EditorComp, {
            'modelValue': value,
            options,
            'onUpdate:modelValue': onChange,
          }),
        ]),
      ])
    }

    function renderLayoutSection() {
      const el = ctx.selection.selectedElement.value!
      const layout = el.layout
      const t = ctx.locale.t

      function updateLayout(key: string, value: number): void {
        const oldLayout = { ...el.layout }
        if (key === 'x' || key === 'y') {
          const cmd = createMoveMaterialCommand({
            materialId: el.id,
            newX: key === 'x' ? value : (layout.x ?? 0),
            newY: key === 'y' ? value : (layout.y ?? 0),
            oldX: oldLayout.x ?? 0,
            oldY: oldLayout.y ?? 0,
          }, ctx.engine.operations)
          ctx.engine.execute(cmd)
        }
        else {
          const cmd = createResizeMaterialCommand({
            materialId: el.id,
            newHeight: key === 'height' ? value : layout.height,
            newWidth: key === 'width' ? value : layout.width,
            oldHeight: oldLayout.height,
            oldWidth: oldLayout.width,
          }, ctx.engine.operations)
          ctx.engine.execute(cmd)
        }
      }

      return h('div', { class: 'easyink-property-group' }, [
        h('div', { class: 'easyink-property-group__title' }, t('property.layout')),
        renderEditorRow(t('property.x'), 'number', layout.x ?? 0, {}, v => updateLayout('x', v as number)),
        renderEditorRow(t('property.y'), 'number', layout.y ?? 0, {}, v => updateLayout('y', v as number)),
        renderEditorRow(t('property.width'), 'number', typeof layout.width === 'number' ? layout.width : 0, {}, v => updateLayout('width', v as number)),
        renderEditorRow(t('property.height'), 'number', typeof layout.height === 'number' ? layout.height : 0, {}, v => updateLayout('height', v as number)),
      ])
    }

    function renderStyleSection() {
      const el = ctx.selection.selectedElement.value!
      const style = el.style
      const t = ctx.locale.t

      function updateStyle(key: string, value: unknown): void {
        const cmd = createUpdateStyleCommand({
          materialId: el.id,
          newStyle: { ...style, [key]: value },
          oldStyle: { ...style },
        }, ctx.engine.operations)
        ctx.engine.execute(cmd)
      }

      const rows = []
      if (style.color !== undefined || el.type === 'text') {
        rows.push(renderEditorRow(t('property.color'), 'color', style.color ?? '#000000', {}, v => updateStyle('color', v)))
      }
      if (style.backgroundColor !== undefined) {
        rows.push(renderEditorRow(t('property.backgroundColor'), 'color', style.backgroundColor ?? '#ffffff', {}, v => updateStyle('backgroundColor', v)))
      }
      if (style.fontSize !== undefined || el.type === 'text') {
        rows.push(renderEditorRow(t('property.fontSize'), 'number', style.fontSize ?? 14, { min: 1, step: 1 }, v => updateStyle('fontSize', v)))
      }
      if (style.opacity !== undefined) {
        rows.push(renderEditorRow(t('property.opacity'), 'number', style.opacity ?? 1, { max: 1, min: 0, step: 0.1 }, v => updateStyle('opacity', v)))
      }

      if (rows.length === 0) {
        return null
      }

      return h('div', { class: 'easyink-property-group' }, [
        h('div', { class: 'easyink-property-group__title' }, t('property.style')),
        ...rows,
      ])
    }

    function renderPropsSection() {
      const el = ctx.selection.selectedElement.value!
      const def = ctx.engine.materialRegistry.get(el.type)
      if (!def || def.propSchemas.length === 0) {
        return null
      }

      const t = ctx.locale.t

      function updateProps(newProps: Record<string, unknown>): void {
        const cmd = createUpdatePropsCommand({
          materialId: el.id,
          newProps: { ...el.props, ...newProps },
          oldProps: { ...el.props },
        }, ctx.engine.operations)
        ctx.engine.execute(cmd)
      }

      return h('div', { class: 'easyink-property-group' }, [
        h('div', { class: 'easyink-property-group__title' }, t('property.props')),
        h(EiPropForm, {
          'fontManager': ctx.engine.font,
          'modelValue': el.props,
          'schemas': def.propSchemas,
          'onUpdate:modelValue': updateProps,
        }),
      ])
    }

    function renderBindingSection() {
      const el = ctx.selection.selectedElement.value!
      const binding = el.binding
      const t = ctx.locale.t

      function updateBinding(path: string): void {
        const cmd = createUpdateBindingCommand({
          materialId: el.id,
          newBinding: path ? { path } : undefined,
          oldBinding: binding ? { ...binding } : undefined,
        }, ctx.engine.operations)
        ctx.engine.execute(cmd)
      }

      return h('div', { class: 'easyink-property-group' }, [
        h('div', { class: 'easyink-property-group__title' }, t('property.dataBinding')),
        renderEditorRow(t('property.bindingPath'), 'text', binding?.path ?? '', {}, v => updateBinding(v as string)),
      ])
    }

    return () => {
      const el = ctx.selection.selectedElement.value
      const t = ctx.locale.t

      if (!el) {
        return h('div', { class: 'easyink-property-panel' }, [
          h('div', { class: 'easyink-property-panel__header' }, t('property.title')),
          h('div', { class: 'easyink-property-panel__empty' }, t('property.noSelection')),
        ])
      }

      const propsSection = renderPropsSection()
      const sections = [
        h('div', { class: 'easyink-property-panel__header' }, `${t('property.title')} - ${el.name ?? el.type}`),
        renderLayoutSection(),
        renderStyleSection(),
        propsSection,
        renderBindingSection(),
      ]

      return h('div', { class: 'easyink-property-panel' }, sections)
    }
  },
})
