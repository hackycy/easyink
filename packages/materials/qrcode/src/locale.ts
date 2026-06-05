const zhCN = {
  materials: {
    qrcode: {
      name: '二维码',
      property: {
        value: '二维码值',
        errorLevel: '容错等级',
        foreground: '前景色',
      },
    },
  },
}

const enUS = {
  materials: {
    qrcode: {
      name: 'QR Code',
      property: {
        value: 'QR Code Value',
        errorLevel: 'Error Correction Level',
        foreground: 'Foreground',
      },
    },
  },
}

export const qrcodeLocaleMessages = {
  messages: zhCN,
  locales: {
    'zh-CN': zhCN,
    'en-US': enUS,
  },
}
