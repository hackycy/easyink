const zhCN = {
  materials: {
    image: {
      name: '图片',
      property: {
        src: '图片地址',
        fit: '填充模式',
        alt: '替代文字',
      },
      action: {
        pick: '选择图片',
        clear: '清空图片',
        preview: '图片预览',
        previewLoading: '图片加载中',
        previewFailed: '图片预览失败',
      },
      option: {
        fitContain: '包含',
        fitCover: '覆盖',
        fitFill: '拉伸',
        fitNone: '不缩放',
      },
    },
  },
}

const enUS = {
  materials: {
    image: {
      name: 'Image',
      property: {
        src: 'Image URL',
        fit: 'Fit Mode',
        alt: 'Alt Text',
      },
      action: {
        pick: 'Pick Image',
        clear: 'Clear Image',
        preview: 'Image Preview',
        previewLoading: 'Image Loading',
        previewFailed: 'Image Preview Failed',
      },
      option: {
        fitContain: 'Contain',
        fitCover: 'Cover',
        fitFill: 'Fill',
        fitNone: 'None',
      },
    },
  },
}

export const imageLocaleMessages = {
  messages: zhCN,
  locales: {
    'zh-CN': zhCN,
    'en-US': enUS,
  },
}
