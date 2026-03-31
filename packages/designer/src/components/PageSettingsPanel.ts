import type { PageSettings } from '@easyink/core'
import type { DesignerContext } from '../types'
import { createUpdatePageSettingsCommand, PAPER_SIZES } from '@easyink/core'
import { defineComponent, h, inject } from 'vue'
import { getEditor } from '../editors/EditorRegistry'
import { DESIGNER_INJECTION_KEY } from '../types'
import { BackgroundLayerList } from './BackgroundLayerList'

import '../editors/index'

const PRESET_NAMES = Object.keys(PAPER_SIZES)

function getPaperType(paper: PageSettings['paper']): string {
  if (typeof paper === 'string') {
    return paper
  }
  if (paper.type === 'custom') {
    return 'custom'
  }
  return 'label'
}

export const PageSettingsPanel = defineComponent({
  name: 'PageSettingsPanel',
  setup() {
    const ctx = inject(DESIGNER_INJECTION_KEY) as DesignerContext

    function getPage(): PageSettings {
      return ctx.schema.value.page
    }

    function executeUpdate(newSettings: PageSettings): void {
      const oldSettings = getPage()
      const cmd = createUpdatePageSettingsCommand({
        newSettings,
        oldSettings,
      }, ctx.engine.operations)
      ctx.engine.execute(cmd)
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

    function renderPaperSection() {
      const t = ctx.locale.t
      const page = getPage()
      const paperType = getPaperType(page.paper)

      const paperOptions = [
        ...PRESET_NAMES,
        'custom',
        'label',
      ]

      const rows = [
        renderEditorRow(t('pageSettings.paperPreset'), 'select', paperType, { options: paperOptions }, (v) => {
          const value = v as string
          if (PRESET_NAMES.includes(value)) {
            executeUpdate({ ...page, paper: value as PageSettings['paper'] })
          }
          else if (value === 'custom') {
            const dims = typeof page.paper === 'string'
              ? PAPER_SIZES[page.paper] ?? { height: 297, width: 210 }
              : { height: page.paper.height, width: page.paper.width }
            executeUpdate({ ...page, paper: { ...dims, type: 'custom' } })
          }
          else {
            const dims = typeof page.paper === 'string'
              ? PAPER_SIZES[page.paper] ?? { height: 297, width: 210 }
              : { height: page.paper.height, width: page.paper.width }
            executeUpdate({ ...page, paper: { ...dims, type: 'label' } })
          }
        }),
      ]

      // Custom/label width/height
      if (paperType === 'custom' || paperType === 'label') {
        const paper = page.paper as { height: number, type: 'custom' | 'label', width: number }
        rows.push(
          renderEditorRow(t('pageSettings.width'), 'number', paper.width, { min: 1, step: 1 }, (v) => {
            executeUpdate({ ...page, paper: { ...paper, width: v as number } })
          }),
          renderEditorRow(t('pageSettings.height'), 'number', paper.height, { min: 1, step: 1 }, (v) => {
            executeUpdate({ ...page, paper: { ...paper, height: v as number } })
          }),
        )
      }

      // Orientation (only for presets)
      if (typeof page.paper === 'string') {
        rows.push(
          renderEditorRow(t('pageSettings.orientation'), 'select', page.orientation, {
            options: [
              'portrait',
              'landscape',
            ],
          }, (v) => {
            executeUpdate({ ...page, orientation: v as 'portrait' | 'landscape' })
          }),
        )
      }

      return h('div', { class: 'easyink-property-group' }, [
        h('div', { class: 'easyink-property-group__title' }, t('pageSettings.paper')),
        ...rows,
      ])
    }

    function renderMarginsSection() {
      const t = ctx.locale.t
      const page = getPage()
      const m = page.margins

      function updateMargin(key: keyof typeof m, value: number): void {
        executeUpdate({ ...page, margins: { ...m, [key]: value } })
      }

      return h('div', { class: 'easyink-property-group' }, [
        h('div', { class: 'easyink-property-group__title' }, t('pageSettings.margins')),
        renderEditorRow(t('pageSettings.marginTop'), 'number', m.top, { min: 0, step: 1 }, v => updateMargin('top', v as number)),
        renderEditorRow(t('pageSettings.marginRight'), 'number', m.right, { min: 0, step: 1 }, v => updateMargin('right', v as number)),
        renderEditorRow(t('pageSettings.marginBottom'), 'number', m.bottom, { min: 0, step: 1 }, v => updateMargin('bottom', v as number)),
        renderEditorRow(t('pageSettings.marginLeft'), 'number', m.left, { min: 0, step: 1 }, v => updateMargin('left', v as number)),
      ])
    }

    function renderUnitSection() {
      const t = ctx.locale.t
      const page = getPage()

      return h('div', { class: 'easyink-property-group' }, [
        h('div', { class: 'easyink-property-group__title' }, t('pageSettings.unit')),
        renderEditorRow(t('pageSettings.unit'), 'select', page.unit, {
          options: [
            'mm',
            'inch',
            'pt',
          ],
        }, (v) => {
          executeUpdate({ ...page, unit: v as 'mm' | 'inch' | 'pt' })
        }),
      ])
    }

    function renderOverflowSection() {
      const t = ctx.locale.t
      const page = getPage()

      return h('div', { class: 'easyink-property-group' }, [
        h('div', { class: 'easyink-property-group__title' }, t('pageSettings.overflow')),
        renderEditorRow(t('pageSettings.overflow'), 'select', page.overflow ?? 'clip', {
          options: [
            'clip',
            'auto-extend',
          ],
        }, (v) => {
          executeUpdate({ ...page, overflow: v as 'clip' | 'auto-extend' })
        }),
      ])
    }

    function renderBackgroundSection() {
      const t = ctx.locale.t
      return h('div', { class: 'easyink-property-group' }, [
        h('div', { class: 'easyink-property-group__title' }, t('pageSettings.background')),
        h(BackgroundLayerList),
      ])
    }

    return () => {
      return h('div', { class: 'easyink-page-settings' }, [
        renderPaperSection(),
        renderMarginsSection(),
        renderUnitSection(),
        renderOverflowSection(),
        renderBackgroundSection(),
      ])
    }
  },
})
