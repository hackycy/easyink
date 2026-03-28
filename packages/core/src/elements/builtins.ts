import type { ElementTypeDefinition } from './types'

// ─── Text 文本 ───

export const textElementType: ElementTypeDefinition = {
  type: 'text',
  name: '文本',
  icon: 'text',
  category: 'basic',
  propDefinitions: [
    { key: 'content', label: '内容', editor: 'text', group: '文本', defaultValue: '' },
    {
      key: 'verticalAlign',
      label: '垂直对齐',
      editor: 'select',
      group: '文本',
      defaultValue: 'top',
      editorOptions: { options: ['top', 'middle', 'bottom'] },
    },
    {
      key: 'wordBreak',
      label: '换行',
      editor: 'select',
      group: '文本',
      defaultValue: 'normal',
      editorOptions: { options: ['normal', 'break-all', 'break-word'] },
    },
    {
      key: 'overflow',
      label: '溢出',
      editor: 'select',
      group: '文本',
      defaultValue: 'visible',
      editorOptions: { options: ['visible', 'hidden', 'ellipsis'] },
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

export const imageElementType: ElementTypeDefinition = {
  type: 'image',
  name: '图片',
  icon: 'image',
  category: 'basic',
  propDefinitions: [
    { key: 'src', label: '图片地址', editor: 'text', group: '图片', defaultValue: '' },
    {
      key: 'fit',
      label: '填充模式',
      editor: 'select',
      group: '图片',
      defaultValue: 'contain',
      editorOptions: { options: ['contain', 'cover', 'fill', 'none'] },
    },
    { key: 'alt', label: '替代文本', editor: 'text', group: '图片', defaultValue: '' },
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

export const rectElementType: ElementTypeDefinition = {
  type: 'rect',
  name: '矩形',
  icon: 'rect',
  category: 'basic',
  propDefinitions: [
    {
      key: 'borderRadius',
      label: '圆角',
      editor: 'number',
      group: '矩形',
      defaultValue: 0,
      editorOptions: { min: 0 },
    },
    { key: 'fill', label: '填充色', editor: 'color', group: '矩形', defaultValue: 'transparent' },
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

export const lineElementType: ElementTypeDefinition = {
  type: 'line',
  name: '线条',
  icon: 'line',
  category: 'basic',
  propDefinitions: [
    {
      key: 'direction',
      label: '方向',
      editor: 'select',
      group: '线条',
      defaultValue: 'horizontal',
      editorOptions: { options: ['horizontal', 'vertical', 'custom'] },
    },
    {
      key: 'strokeWidth',
      label: '线宽',
      editor: 'number',
      group: '线条',
      defaultValue: 1,
      editorOptions: { min: 0.5, step: 0.5 },
    },
    { key: 'strokeColor', label: '颜色', editor: 'color', group: '线条', defaultValue: '#000000' },
    {
      key: 'strokeStyle',
      label: '样式',
      editor: 'select',
      group: '线条',
      defaultValue: 'solid',
      editorOptions: { options: ['solid', 'dashed', 'dotted'] },
    },
    {
      key: 'endX',
      label: '终点X偏移',
      editor: 'number',
      group: '线条',
      visible: (props: Record<string, unknown>) => props.direction === 'custom',
    },
    {
      key: 'endY',
      label: '终点Y偏移',
      editor: 'number',
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

// ─── Table 动态表格 ───

export const tableElementType: ElementTypeDefinition = {
  type: 'table',
  name: '表格',
  icon: 'table',
  category: 'data',
  propDefinitions: [
    { key: 'bordered', label: '显示边框', editor: 'switch', group: '表格', defaultValue: true },
    { key: 'striped', label: '斑马纹', editor: 'switch', group: '表格', defaultValue: false },
    {
      key: 'rowHeight',
      label: '行高',
      editor: 'number',
      group: '表格',
      defaultValue: 'auto',
      editorOptions: { min: 0 },
    },
    {
      key: 'emptyBehavior',
      label: '空数据行为',
      editor: 'select',
      group: '表格',
      defaultValue: 'placeholder',
      editorOptions: { options: ['placeholder', 'collapse', 'min-rows'] },
    },
    {
      key: 'minRows',
      label: '最小行数',
      editor: 'number',
      group: '表格',
      defaultValue: 1,
      editorOptions: { min: 1 },
      visible: (props: Record<string, unknown>) => props.emptyBehavior === 'min-rows',
    },
    { key: 'emptyText', label: '空状态文本', editor: 'text', group: '表格', defaultValue: '暂无数据' },
  ],
  defaultProps: {
    columns: [],
    bordered: true,
    striped: false,
    rowHeight: 'auto',
    emptyBehavior: 'placeholder',
    minRows: 1,
    emptyText: '暂无数据',
  },
  defaultLayout: {
    position: 'flow',
    width: 'auto',
    height: 'auto',
  },
  isContainer: true,
  supportsRepeat: true,
}

// ─── Barcode 条形码/二维码 ───

export const barcodeElementType: ElementTypeDefinition = {
  type: 'barcode',
  name: '条形码',
  icon: 'barcode',
  category: 'data',
  propDefinitions: [
    {
      key: 'format',
      label: '编码格式',
      editor: 'select',
      group: '条形码',
      defaultValue: 'CODE128',
      editorOptions: {
        options: [
          'CODE128',
          'EAN13',
          'EAN8',
          'UPC',
          'CODE39',
          'ITF14',
          'QR',
        ],
      },
    },
    { key: 'value', label: '内容', editor: 'text', group: '条形码', defaultValue: '' },
    {
      key: 'displayValue',
      label: '显示文字',
      editor: 'switch',
      group: '条形码',
      defaultValue: true,
    },
    {
      key: 'barWidth',
      label: '线条宽度',
      editor: 'number',
      group: '条形码',
      defaultValue: 2,
      editorOptions: { min: 1, max: 5, step: 0.5 },
    },
    {
      key: 'errorCorrectionLevel',
      label: '纠错级别',
      editor: 'select',
      group: '条形码',
      defaultValue: 'M',
      editorOptions: { options: ['L', 'M', 'Q', 'H'] },
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

// ─── 全部内置元素类型 ───

/**
 * 所有内置元素类型定义列表
 *
 * 不含 render 函数，仅声明元信息和默认值。
 * 渲染函数由 renderer/designer 包在注册时附加。
 */
export const builtinElementTypes: ElementTypeDefinition[] = [
  barcodeElementType,
  imageElementType,
  lineElementType,
  rectElementType,
  tableElementType,
  textElementType,
]
