import type { BackgroundLayer, BackgroundPosition, ColorLayer, ImageLayer } from '@easyink/shared'
import type { DesignerContext } from '../types'
import {
  createAddBackgroundLayerCommand,
  createRemoveBackgroundLayerCommand,
  createReorderBackgroundLayerCommand,
  createUpdateBackgroundLayerCommand,
} from '@easyink/core'
import { defineComponent, h, inject, ref } from 'vue'
import { getEditor } from '../editors/EditorRegistry'
import { DESIGNER_INJECTION_KEY } from '../types'
import { BackgroundPositionPicker } from './BackgroundPositionPicker'

import '../editors/index'

export const BackgroundLayerList = defineComponent({
  name: 'BackgroundLayerList',
  setup() {
    const ctx = inject(DESIGNER_INJECTION_KEY) as DesignerContext
    const expandedIndex = ref<number | null>(null)
    const showAddMenu = ref(false)

    function getLayers(): BackgroundLayer[] {
      return ctx.schema.value.page.background?.layers ?? []
    }

    function addLayer(type: 'color' | 'image'): void {
      const layer: BackgroundLayer = type === 'color'
        ? { color: '#ffffff', type: 'color' }
        : { type: 'image', url: '' }
      const layers = getLayers()
      const cmd = createAddBackgroundLayerCommand({
        index: layers.length,
        layer,
      }, ctx.engine.operations)
      ctx.engine.execute(cmd)
      expandedIndex.value = layers.length
      showAddMenu.value = false
    }

    function removeLayer(index: number): void {
      const layers = getLayers()
      const layer = layers[index]
      if (!layer) {
        return
      }
      const cmd = createRemoveBackgroundLayerCommand({
        index,
        layer,
      }, ctx.engine.operations)
      ctx.engine.execute(cmd)
      if (expandedIndex.value === index) {
        expandedIndex.value = null
      }
      else if (expandedIndex.value !== null && expandedIndex.value > index) {
        expandedIndex.value--
      }
    }

    function updateLayer(index: number, newLayer: BackgroundLayer): void {
      const layers = getLayers()
      const oldLayer = layers[index]
      if (!oldLayer) {
        return
      }
      const cmd = createUpdateBackgroundLayerCommand({
        index,
        newLayer,
        oldLayer,
      }, ctx.engine.operations)
      ctx.engine.execute(cmd)
    }

    function toggleEnabled(index: number): void {
      const layers = getLayers()
      const layer = layers[index]
      if (!layer) {
        return
      }
      updateLayer(index, { ...layer, enabled: layer.enabled === false })
    }

    function onDragStart(index: number, e: DragEvent): void {
      e.dataTransfer?.setData('application/easyink-bg-layer', String(index))
      e.dataTransfer!.effectAllowed = 'move'
    }

    function onDragOver(e: DragEvent): void {
      if (e.dataTransfer?.types.includes('application/easyink-bg-layer')) {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
      }
    }

    function onDrop(toIndex: number, e: DragEvent): void {
      e.preventDefault()
      const fromStr = e.dataTransfer?.getData('application/easyink-bg-layer')
      if (fromStr === undefined || fromStr === '') {
        return
      }
      const fromIndex = Number(fromStr)
      if (fromIndex === toIndex) {
        return
      }
      const cmd = createReorderBackgroundLayerCommand({
        fromIndex,
        toIndex,
      }, ctx.engine.operations)
      ctx.engine.execute(cmd)
      // Track expanded index through reorder
      if (expandedIndex.value === fromIndex) {
        expandedIndex.value = toIndex
      }
      else if (expandedIndex.value !== null) {
        if (fromIndex < expandedIndex.value && toIndex >= expandedIndex.value) {
          expandedIndex.value--
        }
        else if (fromIndex > expandedIndex.value && toIndex <= expandedIndex.value) {
          expandedIndex.value++
        }
      }
    }

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

    function renderColorDetail(index: number, layer: ColorLayer) {
      const t = ctx.locale.t
      return h('div', { class: 'easyink-bg-layer-item__detail' }, [
        renderEditorRow(t('pageSettings.layerColor'), 'color', layer.color, {}, (v) => {
          updateLayer(index, { ...layer, color: v as string })
        }),
        renderEditorRow(t('pageSettings.layerOpacity'), 'number', layer.opacity ?? 1, { max: 1, min: 0, step: 0.1 }, (v) => {
          updateLayer(index, { ...layer, opacity: v as number })
        }),
      ])
    }

    function renderImageDetail(index: number, layer: ImageLayer) {
      const t = ctx.locale.t
      return h('div', { class: 'easyink-bg-layer-item__detail' }, [
        renderEditorRow(t('pageSettings.layerUrl'), 'text', layer.url, {}, (v) => {
          updateLayer(index, { ...layer, url: v as string })
        }),
        renderEditorRow(t('pageSettings.layerSize'), 'select', layer.size ?? 'auto', {
          options: [
            'auto',
            'cover',
            'contain',
          ],
        }, (v) => {
          updateLayer(index, { ...layer, size: v as ImageLayer['size'] })
        }),
        renderEditorRow(t('pageSettings.layerRepeat'), 'select', layer.repeat ?? 'repeat', {
          options: [
            'repeat',
            'no-repeat',
            'repeat-x',
            'repeat-y',
          ],
        }, (v) => {
          updateLayer(index, { ...layer, repeat: v as ImageLayer['repeat'] })
        }),
        h('div', { class: 'easyink-property-row' }, [
          h('span', { class: 'easyink-property-row__label' }, t('pageSettings.layerPosition')),
          h('div', { class: 'easyink-property-row__editor' }, [
            h(BackgroundPositionPicker, {
              'modelValue': layer.position ?? 'center',
              'onUpdate:modelValue': (v: BackgroundPosition) => {
                updateLayer(index, { ...layer, position: v })
              },
            }),
          ]),
        ]),
        renderEditorRow(t('pageSettings.layerOpacity'), 'number', layer.opacity ?? 1, { max: 1, min: 0, step: 0.1 }, (v) => {
          updateLayer(index, { ...layer, opacity: v as number })
        }),
      ])
    }

    function renderLayerItem(layer: BackgroundLayer, index: number) {
      const t = ctx.locale.t
      const isExpanded = expandedIndex.value === index
      const isDisabled = layer.enabled === false

      const preview = layer.type === 'color'
        ? h('span', {
            class: 'easyink-bg-layer-item__preview',
            style: { backgroundColor: (layer as ColorLayer).color },
          })
        : h('span', {
            class: 'easyink-bg-layer-item__preview easyink-bg-layer-item__preview--image',
            style: (layer as ImageLayer).url
              ? { backgroundImage: `url(${(layer as ImageLayer).url})` }
              : {},
          })

      const typeLabel = layer.type === 'color' ? t('pageSettings.colorLayer') : t('pageSettings.imageLayer')

      return h('div', {
        class: `easyink-bg-layer-item ${isDisabled ? 'easyink-bg-layer-item--disabled' : ''}`,
        key: index,
      }, [
        h('div', {
          class: 'easyink-bg-layer-item__header',
          draggable: true,
          onClick: () => { expandedIndex.value = isExpanded ? null : index },
          onDragover: onDragOver,
          onDragstart: (e: DragEvent) => onDragStart(index, e),
          onDrop: (e: DragEvent) => onDrop(index, e),
        }, [
          preview,
          h('span', { class: 'easyink-bg-layer-item__type' }, typeLabel),
          h('div', { class: 'easyink-bg-layer-item__actions' }, [
            h('button', {
              class: `easyink-layer-item__btn ${isDisabled ? 'easyink-layer-item__btn--active' : ''}`,
              onClick: (e: MouseEvent) => {
                e.stopPropagation()
                toggleEnabled(index)
              },
              title: t('pageSettings.layerEnabled'),
              type: 'button',
            }, isDisabled ? 'H' : 'V'),
            h('button', {
              class: 'easyink-layer-item__btn',
              onClick: (e: MouseEvent) => {
                e.stopPropagation()
                removeLayer(index)
              },
              title: t('pageSettings.deleteLayer'),
              type: 'button',
            }, 'X'),
          ]),
          h('span', { class: 'easyink-bg-layer-item__chevron' }, isExpanded ? '-' : '+'),
        ]),
        isExpanded
          ? (layer.type === 'color'
              ? renderColorDetail(index, layer as ColorLayer)
              : renderImageDetail(index, layer as ImageLayer))
          : null,
      ])
    }

    return () => {
      const t = ctx.locale.t
      const layers = getLayers()

      const children = []

      if (layers.length === 0) {
        children.push(
          h('div', { class: 'easyink-bg-layer-list__empty' }, t('pageSettings.emptyLayers')),
        )
      }
      else {
        // Display in reverse order (topmost first)
        const reversed = [...layers].map((layer, i) => ({ index: i, layer })).reverse()
        for (const { index, layer } of reversed) {
          children.push(renderLayerItem(layer, index))
        }
      }

      // Add button
      children.push(
        h('div', { class: 'easyink-bg-layer-add' }, [
          h('button', {
            class: 'easyink-bg-layer-add__btn',
            onClick: () => { showAddMenu.value = !showAddMenu.value },
            type: 'button',
          }, `+ ${t('pageSettings.addLayer')}`),
          showAddMenu.value
            ? h('div', { class: 'easyink-bg-layer-add__menu' }, [
                h('button', {
                  class: 'easyink-bg-layer-add__option',
                  onClick: () => addLayer('color'),
                  type: 'button',
                }, t('pageSettings.colorLayer')),
                h('button', {
                  class: 'easyink-bg-layer-add__option',
                  onClick: () => addLayer('image'),
                  type: 'button',
                }, t('pageSettings.imageLayer')),
              ])
            : null,
        ]),
      )

      return h('div', { class: 'easyink-bg-layer-list' }, children)
    }
  },
})
