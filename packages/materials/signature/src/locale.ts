const zhCN = {
  materials: {
    signature: {
      name: '签名',
      action: {
        clear: '清空签名',
        drawMode: '编辑模式',
      },
      history: {
        clear: '清空签名',
        draw: '更新签名',
      },
      property: {
        backgroundColor: '背景颜色',
        penColor: '签字笔颜色',
      },
    },
  },
}

const enUS = {
  materials: {
    signature: {
      name: 'Signature',
      action: {
        clear: 'Clear signature',
        drawMode: 'Draw mode',
      },
      history: {
        clear: 'Clear signature',
        draw: 'Update signature',
      },
      property: {
        backgroundColor: 'Background Color',
        penColor: 'Pen Color',
      },
    },
  },
}

export const signatureLocaleMessages = {
  messages: zhCN,
  locales: {
    'zh-CN': zhCN,
    'en-US': enUS,
  },
}
