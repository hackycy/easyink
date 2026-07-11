import type { PropertyAccessor, PropertyDescriptor } from '@easyink/core'

type MaterialNode = Parameters<PropertyAccessor['read']>[0]

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

export const FONT_WEIGHT_OPTIONS: NonNullable<PropertyDescriptor['enum']> = [
  { label: 'designer.option.normal', value: 'normal' },
  { label: 'designer.option.bold', value: 'bold' },
]

export const FONT_STYLE_OPTIONS: NonNullable<PropertyDescriptor['enum']> = [
  { label: 'designer.option.normal', value: 'normal' },
  { label: 'designer.option.italic', value: 'italic' },
]

export const HORIZONTAL_ALIGN_OPTIONS: NonNullable<PropertyDescriptor['enum']> = [
  { label: 'designer.option.alignLeft', value: 'left' },
  { label: 'designer.option.alignCenter', value: 'center' },
  { label: 'designer.option.alignRight', value: 'right' },
]

export const VERTICAL_ALIGN_OPTIONS: NonNullable<PropertyDescriptor['enum']> = [
  { label: 'designer.option.alignTop', value: 'top' },
  { label: 'designer.option.alignMiddle', value: 'middle' },
  { label: 'designer.option.alignBottom', value: 'bottom' },
]

export const STROKE_STYLE_OPTIONS: NonNullable<PropertyDescriptor['enum']> = [
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

const placementAccessor: PropertyAccessor = {
  paths: Object.freeze(['/output/placement']),
  read: readPlacementMode,
  write: (node, value) => {
    node.output.placement ??= {}
    node.output.placement.mode = value === 'fixed' ? 'fixed' : 'flow'
  },
}

const keepTogetherAccessor: PropertyAccessor = {
  paths: Object.freeze(['/output/break']),
  read: node => readBreakConfig(node).keepTogether === true,
  write: (node, value) => {
    node.output.break ??= {}
    node.output.break.keepTogether = value === true
  },
}

const breakBeforeAccessor: PropertyAccessor = {
  paths: Object.freeze(['/output/break']),
  read: node => readBreakConfig(node).before === 'page',
  write: (node, value) => {
    node.output.break ??= {}
    node.output.break.before = value === true ? 'page' : 'auto'
  },
}

const breakAfterAccessor: PropertyAccessor = {
  paths: Object.freeze(['/output/break']),
  read: node => readBreakConfig(node).after === 'page',
  write: (node, value) => {
    node.output.break ??= {}
    node.output.break.after = value === true ? 'page' : 'auto'
  },
}

const repeatAccessor: PropertyAccessor = {
  paths: Object.freeze(['/output/repeat']),
  read: node => readRepeatConfig(node).scope === 'every-output-page',
  write: (node, value) => {
    node.output.repeat ??= {}
    node.output.repeat.scope = value === true ? 'every-output-page' : 'none'
  },
}

export function createLayoutBehaviorPropSchemas(context: LayoutBehaviorPropContext): PropertyDescriptor[] {
  const page = context.page
  const schemas: PropertyDescriptor[] = []
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
      accessor: placementAccessor,
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
        accessor: keepTogetherAccessor,
      },
      {
        key: 'break.before',
        label: 'designer.property.pageBreakBefore',
        type: 'switch',
        group: 'pagination',
        default: false,
        visible: props => props.__placementMode !== 'fixed',
        accessor: breakBeforeAccessor,
      },
      {
        key: 'break.after',
        label: 'designer.property.pageBreakAfter',
        type: 'switch',
        group: 'pagination',
        default: false,
        visible: props => props.__placementMode !== 'fixed',
        accessor: breakAfterAccessor,
      },
    )
  }

  schemas.push({
    key: 'repeat.scope',
    label: 'designer.property.repeatEveryPage',
    type: 'switch',
    group: 'repeat',
    default: false,
    accessor: repeatAccessor,
  })

  return schemas
}

function readPlacementMode(node: MaterialNode): NonNullable<NodePlacementConfig['mode']> {
  return node.output.placement?.mode === 'fixed' ? 'fixed' : 'flow'
}

function readBreakConfig(node: MaterialNode): NodeBreakConfig {
  return node.output.break ?? {}
}

function readRepeatConfig(node: MaterialNode): NodeRepeatConfig {
  return node.output.repeat ?? { scope: 'none' }
}

/**
 * Group property descriptors by their group field.
 * Items without a group default to 'general'.
 */
export function groupPropSchemas(schemas: PropertyDescriptor[]): Map<string, PropertyDescriptor[]> {
  const groups = new Map<string, PropertyDescriptor[]>()
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
