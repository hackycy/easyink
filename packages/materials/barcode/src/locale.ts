const zhCN = {
  materials: {
    barcode: {
      name: '条形码',
      property: {
        value: '条码值',
        format: '条码格式',
        showText: '显示文字',
        lineWidth: '线宽',
        lineColor: '线条颜色',
      },
    },
  },
}

const enUS = {
  materials: {
    barcode: {
      name: 'Barcode',
      property: {
        value: 'Barcode Value',
        format: 'Barcode Format',
        showText: 'Show Text',
        lineWidth: 'Line Width',
        lineColor: 'Line Color',
      },
    },
  },
}

export const barcodeLocaleMessages = {
  messages: zhCN,
  locales: {
    'zh-CN': zhCN,
    'en-US': enUS,
  },
}
