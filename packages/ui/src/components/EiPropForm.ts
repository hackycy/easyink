import type { FontManager, PropSchema, PropSchemaType } from '@easyink/core'
import type { Component, VNode } from 'vue'
import { defineComponent, h, reactive } from 'vue'
import { EiArrayEditor } from './EiArrayEditor'
import { EiColorPicker } from './EiColorPicker'
import { EiFontSelector } from './EiFontSelector'
import { EiInput } from './EiInput'
import { EiNumberInput } from './EiNumberInput'
import { EiSelect } from './EiSelect'
import { EiSlider } from './EiSlider'
import { EiSwitch } from './EiSwitch'

/**
 * EiPropForm -- PropSchema-driven dynamic form renderer
 *
 * Automatically renders a form based on `PropSchema[]`.
 * Supports grouping, conditional visibility/disabled, onChange callbacks,
 * and nested object/array editing.
 */
export const EiPropForm = defineComponent({
  name: 'EiPropForm',
  props: {
    fontManager: { default: undefined, type: Object as () => FontManager | undefined },
    modelValue: { default: () => ({}), type: Object as () => Record<string, unknown> },
    schemas: { default: () => [], type: Array as () => PropSchema[] },
  },
  emits: ['update:modelValue'],
  setup(props, { emit }) {
    const collapsedGroups = reactive<Record<string, boolean>>({})

    function updateProp(key: string, value: unknown): void {
      const newProps = { ...props.modelValue, [key]: value }

      // Find the schema for onChange callback
      const schema = props.schemas.find(s => s.key === key)
      if (schema?.onChange) {
        const linkedUpdates = schema.onChange(value, newProps)
        if (linkedUpdates) {
          Object.assign(newProps, linkedUpdates)
        }
      }

      emit('update:modelValue', newProps)
    }

    function isDisabled(schema: PropSchema): boolean {
      if (typeof schema.disabled === 'function') {
        return schema.disabled(props.modelValue)
      }
      return schema.disabled === true
    }

    function isVisible(schema: PropSchema): boolean {
      if (schema.visible) {
        return schema.visible(props.modelValue)
      }
      return true
    }

    function renderEditor(schema: PropSchema): VNode | null {
      const value = props.modelValue[schema.key] ?? schema.defaultValue
      const disabled = isDisabled(schema)

      // Use custom editor if specified
      const editorType = schema.editor ?? schema.type

      return renderEditorByType(editorType as PropSchemaType, schema, value, disabled)
    }

    function renderEditorByType(type: PropSchemaType | string, schema: PropSchema, value: unknown, disabled: boolean): VNode | null {
      switch (type) {
        case 'string':
          return h(EiInput, {
            'disabled': disabled,
            'maxLength': schema.maxLength,
            'modelValue': (value ?? '') as string,
            'pattern': schema.pattern,
            'placeholder': schema.description ?? '',
            'onUpdate:modelValue': (v: string) => updateProp(schema.key, v),
          })

        case 'number':
          return h(EiNumberInput, {
            'disabled': disabled,
            'max': schema.max,
            'min': schema.min,
            'modelValue': (value ?? 0) as number,
            'step': schema.step ?? 1,
            'onUpdate:modelValue': (v: number) => updateProp(schema.key, v),
          })

        case 'boolean':
          return h(EiSwitch, {
            'disabled': disabled,
            'modelValue': (value ?? false) as boolean,
            'onUpdate:modelValue': (v: boolean) => updateProp(schema.key, v),
          })

        case 'color':
          return h(EiColorPicker, {
            'disabled': disabled,
            'modelValue': (value ?? '#000000') as string,
            'onUpdate:modelValue': (v: string) => updateProp(schema.key, v),
          })

        case 'select':
          return h(EiSelect, {
            'disabled': disabled,
            'modelValue': value as string | number | boolean,
            'options': schema.enum ?? [],
            'onUpdate:modelValue': (v: string | number | boolean) => updateProp(schema.key, v),
          })

        case 'font':
          return h(EiFontSelector, {
            'disabled': disabled,
            'fontManager': props.fontManager,
            'modelValue': (value ?? '') as string,
            'onUpdate:modelValue': (v: string) => updateProp(schema.key, v),
          })

        case 'slider':
          return h(EiSlider, {
            'disabled': disabled,
            'max': schema.max ?? 100,
            'min': schema.min ?? 0,
            'modelValue': (value ?? 0) as number,
            'step': schema.step ?? 1,
            'onUpdate:modelValue': (v: number) => updateProp(schema.key, v),
          })

        case 'object':
          if (schema.properties) {
            return renderNestedForm(schema, value as Record<string, unknown> | undefined)
          }
          return null

        case 'array':
          if (schema.items) {
            return renderArrayEditor(schema, value as unknown[] | undefined, disabled)
          }
          return null

        default:
          // Fallback to text input
          return h(EiInput, {
            'disabled': disabled,
            'modelValue': String(value ?? ''),
            'onUpdate:modelValue': (v: string) => updateProp(schema.key, v),
          })
      }
    }

    function renderNestedForm(schema: PropSchema, value: Record<string, unknown> | undefined): VNode {
      const nestedValues = value ?? {}
      return h(EiPropForm, {
        'fontManager': props.fontManager,
        'modelValue': nestedValues,
        'schemas': schema.properties!,
        'onUpdate:modelValue': (v: Record<string, unknown>) => updateProp(schema.key, v),
      })
    }

    function renderArrayEditor(schema: PropSchema, value: unknown[] | undefined, disabled: boolean): VNode {
      return h(EiArrayEditor, {
        'disabled': disabled,
        'formRenderer': (schemas: PropSchema[], values: Record<string, unknown>, onChange: (key: string, val: unknown) => void) => {
          return renderFormRows(schemas, values, onChange)
        },
        'itemSchema': schema.items!,
        'modelValue': value ?? [],
        'singleEditorRenderer': (itemSchema: PropSchema, itemValue: unknown, onChange: (v: unknown) => void) => {
          const editorType = (itemSchema.editor ?? itemSchema.type) as PropSchemaType
          const innerSchema: PropSchema = { ...itemSchema, key: '__item__' }
          const comp = resolveEditorComponent(editorType, innerSchema)
          const editorProps = extractEditorProps(editorType, innerSchema, itemValue, disabled)
          return h(comp, {
            ...editorProps,
            'onUpdate:modelValue': onChange,
          })
        },
        'onUpdate:modelValue': (v: unknown[]) => updateProp(schema.key, v),
      })
    }

    function resolveEditorComponent(type: PropSchemaType | string, _schema: PropSchema): Component {
      switch (type) {
        case 'string': return EiInput
        case 'number': return EiNumberInput
        case 'boolean': return EiSwitch
        case 'color': return EiColorPicker
        case 'select': return EiSelect
        case 'font': return EiFontSelector
        case 'slider': return EiSlider
        default: return EiInput
      }
    }

    function extractEditorProps(type: PropSchemaType | string, schema: PropSchema, value: unknown, disabled: boolean): Record<string, unknown> {
      switch (type) {
        case 'string':
          return { disabled, maxLength: schema.maxLength, modelValue: (value ?? '') as string, pattern: schema.pattern }
        case 'number':
          return { disabled, max: schema.max, min: schema.min, modelValue: (value ?? 0) as number, step: schema.step ?? 1 }
        case 'boolean':
          return { disabled, modelValue: (value ?? false) as boolean }
        case 'color':
          return { disabled, modelValue: (value ?? '#000000') as string }
        case 'select':
          return { disabled, modelValue: value as string | number | boolean, options: schema.enum ?? [] }
        case 'font':
          return { disabled, fontManager: props.fontManager, modelValue: (value ?? '') as string }
        case 'slider':
          return { disabled, max: schema.max ?? 100, min: schema.min ?? 0, modelValue: (value ?? 0) as number, step: schema.step ?? 1 }
        default:
          return { disabled, modelValue: String(value ?? '') }
      }
    }

    function renderFormRows(schemas: PropSchema[], values: Record<string, unknown>, onChange: (key: string, value: unknown) => void): VNode {
      const rows = schemas
        .filter(s => !s.visible || s.visible(values))
        .map((s) => {
          const editorType = (s.editor ?? s.type) as PropSchemaType
          const value = values[s.key] ?? s.defaultValue
          const disabled = typeof s.disabled === 'function' ? s.disabled(values) : (s.disabled === true)
          const comp = resolveEditorComponent(editorType, s)
          const editorProps = extractEditorProps(editorType, s, value, disabled)

          return h('div', { class: 'ei-prop-form__row', key: s.key }, [
            h('span', { class: 'ei-prop-form__label', title: s.description ?? s.label }, s.label),
            h('div', { class: 'ei-prop-form__editor' }, [
              h(comp, {
                ...editorProps,
                'onUpdate:modelValue': (v: unknown) => onChange(s.key, v),
              }),
            ]),
          ])
        })

      return h('div', { class: 'ei-prop-form' }, rows)
    }

    function renderRow(schema: PropSchema): VNode | null {
      if (!isVisible(schema))
        return null

      const editor = renderEditor(schema)
      if (!editor)
        return null

      return h('div', { class: 'ei-prop-form__row', key: schema.key }, [
        h('span', { class: 'ei-prop-form__label', title: schema.description ?? schema.label }, schema.label),
        h('div', { class: 'ei-prop-form__editor' }, [editor]),
      ])
    }

    return () => {
      const schemas = props.schemas

      // Group schemas
      const groups = new Map<string, PropSchema[]>()
      const defaultGroup = 'default'
      for (const schema of schemas) {
        const group = schema.group ?? defaultGroup
        if (!groups.has(group)) {
          groups.set(group, [])
        }
        groups.get(group)!.push(schema)
      }

      const groupNodes: VNode[] = []

      for (const [groupName, groupSchemas] of groups) {
        const rows = groupSchemas
          .map(s => renderRow(s))
          .filter((n): n is VNode => n !== null)

        if (rows.length === 0)
          continue

        const isCollapsed = collapsedGroups[groupName] === true

        // Single default group: no header
        if (groups.size === 1 && groupName === defaultGroup) {
          groupNodes.push(
            h('div', { class: 'ei-prop-form__group', key: groupName }, [
              h('div', { class: 'ei-prop-form__group-body' }, rows),
            ]),
          )
        }
        else {
          groupNodes.push(
            h('div', { class: 'ei-prop-form__group', key: groupName }, [
              h('div', {
                class: 'ei-prop-form__group-header',
                onClick: () => {
                  collapsedGroups[groupName] = !isCollapsed
                },
              }, [
                h('span', {
                  class: isCollapsed
                    ? 'ei-prop-form__group-arrow ei-prop-form__group-arrow--collapsed'
                    : 'ei-prop-form__group-arrow',
                }),
                groupName,
              ]),
              isCollapsed ? null : h('div', { class: 'ei-prop-form__group-body' }, rows),
            ]),
          )
        }
      }

      return h('div', { class: 'ei-prop-form' }, groupNodes)
    }
  },
})
