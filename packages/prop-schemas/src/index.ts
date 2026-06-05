import type { PropSchema } from '@easyink/core'
import { UpdateMaterialBehaviorCommand } from '@easyink/core'

type MaterialNode = Parameters<NonNullable<PropSchema['read']>>[0]

interface NodePlacementConfig {
  mode?: 'flow' | 'fixed'
}

interface NodeBreakConfig {
  keepTogether?: boolean
  before?: 'auto' | 'page'
  after?: 'auto' | 'page'
}

interface NodeRepeatConfig {
  scope?: 'none' | 'every-output-page'
}

export const FONT_WEIGHT_OPTIONS: NonNullable<PropSchema['enum']> = [
  { label: 'designer.option.normal', value: 'normal' },
  { label: 'designer.option.bold', value: 'bold' },
]

export const FONT_STYLE_OPTIONS: NonNullable<PropSchema['enum']> = [
  { label: 'designer.option.normal', value: 'normal' },
  { label: 'designer.option.italic', value: 'italic' },
]

export const HORIZONTAL_ALIGN_OPTIONS: NonNullable<PropSchema['enum']> = [
  { label: 'designer.option.alignLeft', value: 'left' },
  { label: 'designer.option.alignCenter', value: 'center' },
  { label: 'designer.option.alignRight', value: 'right' },
]

export const VERTICAL_ALIGN_OPTIONS: NonNullable<PropSchema['enum']> = [
  { label: 'designer.option.alignTop', value: 'top' },
  { label: 'designer.option.alignMiddle', value: 'middle' },
  { label: 'designer.option.alignBottom', value: 'bottom' },
]

export const STROKE_STYLE_OPTIONS: NonNullable<PropSchema['enum']> = [
  { label: 'designer.option.strokeSolid', value: 'solid' },
  { label: 'designer.option.strokeDashed', value: 'dashed' },
  { label: 'designer.option.strokeDotted', value: 'dotted' },
]

export interface LayoutBehaviorPropContext {
  page: {
    mode?: string
    width?: number
    height?: number
    layout?: { strategy?: string, flowAxis?: string }
    reflow?: { strategy?: string }
    pagination?: { strategy?: string }
  }
}

export function createLayoutBehaviorPropSchemas(context: LayoutBehaviorPropContext): PropSchema[] {
  const page = context.page
  const schemas: PropSchema[] = []
  const supportsFlow = page.layout?.strategy === 'stack-flow' && page.reflow?.strategy === 'flow-y'
  const supportsBreakRules = supportsFlow && page.pagination?.strategy === 'auto-sheets'

  if (supportsFlow) {
    schemas.push({
      key: 'placement.mode',
      label: 'designer.property.placementMode',
      type: 'enum',
      group: 'layout',
      default: 'flow',
      enum: [
        { label: 'designer.property.flow', value: 'flow' },
        { label: 'designer.property.fixedPosition', value: 'fixed' },
      ],
      read: readPlacementMode,
      commit: (node, value) => new UpdateMaterialBehaviorCommand(node, {
        placement: { ...(node.placement ?? {}), mode: value === 'fixed' ? 'fixed' : 'flow' },
      }),
    })
  }

  if (supportsBreakRules) {
    schemas.push(
      {
        key: 'break.keepTogether',
        label: 'designer.property.keepTogether',
        type: 'switch',
        group: 'pagination',
        default: false,
        visible: props => props.__placementMode !== 'fixed',
        read: node => readBreakConfig(node).keepTogether === true,
        commit: (node, value) => new UpdateMaterialBehaviorCommand(node, {
          break: { ...readBreakConfig(node), keepTogether: value === true },
        }),
      },
      {
        key: 'break.before',
        label: 'designer.property.pageBreakBefore',
        type: 'switch',
        group: 'pagination',
        default: false,
        visible: props => props.__placementMode !== 'fixed',
        read: node => readBreakConfig(node).before === 'page',
        commit: (node, value) => new UpdateMaterialBehaviorCommand(node, {
          break: { ...readBreakConfig(node), before: value === true ? 'page' : 'auto' },
        }),
      },
      {
        key: 'break.after',
        label: 'designer.property.pageBreakAfter',
        type: 'switch',
        group: 'pagination',
        default: false,
        visible: props => props.__placementMode !== 'fixed',
        read: node => readBreakConfig(node).after === 'page',
        commit: (node, value) => new UpdateMaterialBehaviorCommand(node, {
          break: { ...readBreakConfig(node), after: value === true ? 'page' : 'auto' },
        }),
      },
    )
  }

  schemas.push({
    key: 'repeat.scope',
    label: 'designer.property.repeatEveryPage',
    type: 'switch',
    group: 'repeat',
    default: false,
    read: node => readRepeatConfig(node).scope === 'every-output-page',
    commit: (node, value) => new UpdateMaterialBehaviorCommand(node, {
      repeat: { scope: value === true ? 'every-output-page' : 'none' },
    }),
  })

  return schemas
}

function readPlacementMode(node: MaterialNode): NonNullable<NodePlacementConfig['mode']> {
  if (node.placement?.mode === 'fixed' || node.placement?.mode === 'flow')
    return node.placement.mode
  return (node.props as Record<string, unknown>).layoutMode === 'fixed' ? 'fixed' : 'flow'
}

function readBreakConfig(node: MaterialNode): NodeBreakConfig {
  const props = node.props as Record<string, unknown>
  return {
    ...node.break,
    keepTogether: node.break?.keepTogether ?? (props.keepTogether === true),
    before: node.break?.before ?? (props.pageBreakBefore === true ? 'page' : 'auto'),
    after: node.break?.after ?? (props.pageBreakAfter === true ? 'page' : 'auto'),
  }
}

function readRepeatConfig(node: MaterialNode): NodeRepeatConfig {
  return node.repeat ?? { scope: 'none' }
}

/**
 * Group PropSchema items by their group field.
 * Items without a group default to 'general'.
 */
export function groupPropSchemas(schemas: PropSchema[]): Map<string, PropSchema[]> {
  const groups = new Map<string, PropSchema[]>()
  for (const schema of schemas) {
    const group = schema.group ?? 'general'
    const list = groups.get(group)
    if (list) {
      list.push(schema)
    }
    else {
      groups.set(group, [schema])
    }
  }
  return groups
}
