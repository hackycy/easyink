import type { MaterialTypeDefinition } from './types'

// ─── Text 文本 ───

export const textMaterialType: MaterialTypeDefinition = {
  type: 'text',
  name: '文本',
  icon: 'text',
  category: 'basic',
  propSchemas: [
    { key: 'content', label: '内容', type: 'string', group: '文本', defaultValue: '' },
    {
      key: 'verticalAlign',
      label: '垂直对齐',
      type: 'select',
      group: '文本',
      defaultValue: 'top',
      enum: [
        { label: 'top', value: 'top' },
        { label: 'middle', value: 'middle' },
        { label: 'bottom', value: 'bottom' },
      ],
    },
    {
      key: 'wordBreak',
      label: '换行',
      type: 'select',
      group: '文本',
      defaultValue: 'normal',
      enum: [
        { label: 'normal', value: 'normal' },
        { label: 'break-all', value: 'break-all' },
        { label: 'break-word', value: 'break-word' },
      ],
    },
    {
      key: 'overflow',
      label: '溢出',
      type: 'select',
      group: '文本',
      defaultValue: 'visible',
      enum: [
        { label: 'visible', value: 'visible' },
        { label: 'hidden', value: 'hidden' },
        { label: 'ellipsis', value: 'ellipsis' },
      ],
    },
  ],
  defaultProps: {
    content: '',
    verticalAlign: 'top',
    wordBreak: 'normal',
    overflow: 'visible',
  },
  defaultLayout: {
    position: 'absolute',
    width: 100,
    height: 30,
  },
  defaultStyle: {
    fontSize: 14,
    color: '#000000',
  },
}

// ─── Image 图片 ───

export const imageMaterialType: MaterialTypeDefinition = {
  type: 'image',
  name: '图片',
  icon: 'image',
  category: 'basic',
  propSchemas: [
    { key: 'src', label: '图片地址', type: 'string', group: '图片', defaultValue: '' },
    {
      key: 'fit',
      label: '填充模式',
      type: 'select',
      group: '图片',
      defaultValue: 'contain',
      enum: [
        { label: 'contain', value: 'contain' },
        { label: 'cover', value: 'cover' },
        { label: 'fill', value: 'fill' },
        { label: 'none', value: 'none' },
      ],
    },
    { key: 'alt', label: '替代文本', type: 'string', group: '图片', defaultValue: '' },
  ],
  defaultProps: {
    src: '',
    fit: 'contain',
    alt: '',
  },
  defaultLayout: {
    position: 'absolute',
    width: 100,
    height: 100,
  },
}

// ─── Rect 矩形 ───

export const rectMaterialType: MaterialTypeDefinition = {
  type: 'rect',
  name: '矩形',
  icon: 'rect',
  category: 'basic',
  propSchemas: [
    {
      key: 'borderRadius',
      label: '圆角',
      type: 'number',
      group: '矩形',
      defaultValue: 0,
      min: 0,
    },
    { key: 'fill', label: '填充色', type: 'color', group: '矩形', defaultValue: 'transparent' },
  ],
  defaultProps: {
    borderRadius: 0,
    fill: 'transparent',
  },
  defaultLayout: {
    position: 'absolute',
    width: 100,
    height: 60,
  },
}

// ─── Line 线条 ───

export const lineMaterialType: MaterialTypeDefinition = {
  type: 'line',
  name: '线条',
  icon: 'line',
  category: 'basic',
  propSchemas: [
    {
      key: 'direction',
      label: '方向',
      type: 'select',
      group: '线条',
      defaultValue: 'horizontal',
      enum: [
        { label: 'horizontal', value: 'horizontal' },
        { label: 'vertical', value: 'vertical' },
        { label: 'custom', value: 'custom' },
      ],
    },
    {
      key: 'strokeWidth',
      label: '线宽',
      type: 'number',
      group: '线条',
      defaultValue: 1,
      min: 0.5,
      step: 0.5,
    },
    { key: 'strokeColor', label: '颜色', type: 'color', group: '线条', defaultValue: '#000000' },
    {
      key: 'strokeStyle',
      label: '样式',
      type: 'select',
      group: '线条',
      defaultValue: 'solid',
      enum: [
        { label: 'solid', value: 'solid' },
        { label: 'dashed', value: 'dashed' },
        { label: 'dotted', value: 'dotted' },
      ],
    },
    {
      key: 'endX',
      label: '终点X偏移',
      type: 'number',
      group: '线条',
      visible: (props: Record<string, unknown>) => props.direction === 'custom',
    },
    {
      key: 'endY',
      label: '终点Y偏移',
      type: 'number',
      group: '线条',
      visible: (props: Record<string, unknown>) => props.direction === 'custom',
    },
  ],
  defaultProps: {
    direction: 'horizontal',
    strokeWidth: 1,
    strokeColor: '#000000',
    strokeStyle: 'solid',
  },
  defaultLayout: {
    position: 'absolute',
    width: 100,
    height: 0,
  },
}

// ─── DataTable 数据表格（动态，绑定数据源数组） ───

export const dataTableMaterialType: MaterialTypeDefinition = {
  type: 'data-table',
  name: '数据表格',
  icon: 'data-table',
  category: 'table',
  propSchemas: [
    { key: 'bordered', label: '显示边框', type: 'boolean', group: '表格', defaultValue: true },
    { key: 'striped', label: '斑马纹', type: 'boolean', group: '表格', defaultValue: false },
    {
      key: 'rowHeight',
      label: '行高',
      type: 'number',
      group: '表格',
      defaultValue: 'auto',
      min: 0,
    },
    { key: 'showHeader', label: '显示表头', type: 'boolean', group: '表格', defaultValue: true },
  ],
  defaultProps: {
    columns: [],
    bordered: true,
    striped: false,
    rowHeight: 'auto',
    showHeader: true,
  },
  defaultLayout: {
    position: 'flow',
    width: 'auto',
    height: 'auto',
  },
  isContainer: true,
  supportsRepeat: true,
}

// ─── Table 静态表格（手动编辑数据） ───

export const tableMaterialType: MaterialTypeDefinition = {
  type: 'table',
  name: '表格',
  icon: 'table',
  category: 'table',
  propSchemas: [
    { key: 'bordered', label: '显示边框', type: 'boolean', group: '表格', defaultValue: true },
    {
      key: 'borderStyle',
      label: '边框样式',
      type: 'select',
      group: '表格',
      defaultValue: 'solid',
      enum: [
        { label: 'solid', value: 'solid' },
        { label: 'dashed', value: 'dashed' },
        { label: 'dotted', value: 'dotted' },
      ],
    },
  ],
  defaultProps: {
    columns: [
      { key: 'col-1', title: '列 1', width: 50 },
      { key: 'col-2', title: '列 2', width: 50 },
    ],
    rowCount: 3,
    cells: {},
    bordered: true,
    borderStyle: 'solid',
  },
  defaultLayout: {
    position: 'flow',
    width: 'auto',
    height: 'auto',
  },
  isContainer: false,
  supportsRepeat: false,
}

// ─── Barcode 条形码/二维码 ───

export const barcodeMaterialType: MaterialTypeDefinition = {
  type: 'barcode',
  name: '条形码',
  icon: 'barcode',
  category: 'data',
  propSchemas: [
    {
      key: 'format',
      label: '编码格式',
      type: 'select',
      group: '条形码',
      defaultValue: 'CODE128',
      enum: [
        { label: 'CODE128', value: 'CODE128' },
        { label: 'EAN13', value: 'EAN13' },
        { label: 'EAN8', value: 'EAN8' },
        { label: 'UPC', value: 'UPC' },
        { label: 'CODE39', value: 'CODE39' },
        { label: 'ITF14', value: 'ITF14' },
        { label: 'QR', value: 'QR' },
      ],
    },
    { key: 'value', label: '内容', type: 'string', group: '条形码', defaultValue: '' },
    {
      key: 'displayValue',
      label: '显示文字',
      type: 'boolean',
      group: '条形码',
      defaultValue: true,
    },
    {
      key: 'barWidth',
      label: '线条宽度',
      type: 'number',
      group: '条形码',
      defaultValue: 2,
      min: 1,
      max: 5,
      step: 0.5,
    },
    {
      key: 'errorCorrectionLevel',
      label: '纠错级别',
      type: 'select',
      group: '条形码',
      defaultValue: 'M',
      enum: [
        { label: 'L', value: 'L' },
        { label: 'M', value: 'M' },
        { label: 'Q', value: 'Q' },
        { label: 'H', value: 'H' },
      ],
      visible: (props: Record<string, unknown>) => props.format === 'QR',
    },
  ],
  defaultProps: {
    format: 'CODE128',
    value: '',
    displayValue: true,
    barWidth: 2,
    errorCorrectionLevel: 'M',
  },
  defaultLayout: {
    position: 'absolute',
    width: 150,
    height: 60,
  },
}

// ─── 全部内置物料类型 ───

/**
 * 所有内置物料类型定义列表
 *
 * 不含 render 函数，仅声明元信息和默认值。
 * 渲染函数由 renderer/designer 包在注册时附加。
 */
export const builtinMaterialTypes: MaterialTypeDefinition[] = [
  barcodeMaterialType,
  dataTableMaterialType,
  imageMaterialType,
  lineMaterialType,
  rectMaterialType,
  tableMaterialType,
  textMaterialType,
]
