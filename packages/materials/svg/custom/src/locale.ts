const zhCN = {
  materials: {
    svgCustom: {
      name: '自定义 SVG',
      property: {
        content: 'SVG 内容',
      },
      action: {
        importFile: '导入 SVG 文件',
      },
    },
  },
}

const enUS = {
  materials: {
    svgCustom: {
      name: 'Custom SVG',
      property: {
        content: 'SVG Content',
      },
      action: {
        importFile: 'Import SVG File',
      },
    },
  },
}

export const svgCustomLocaleMessages = {
  messages: zhCN,
  locales: {
    'zh-CN': zhCN,
    'en-US': enUS,
  },
}
