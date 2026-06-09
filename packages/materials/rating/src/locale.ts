const zhCN = {
  materials: {
    rating: {
      name: '评分',
      property: {
        value: '预设值',
        character: '字符设置',
        characterCount: '字符个数',
        characterSize: '字符大小',
        activeColor: '字符高亮颜色',
        backgroundColor: '背景颜色',
      },
    },
  },
}

const enUS = {
  materials: {
    rating: {
      name: 'Rating',
      property: {
        value: 'Preset Value',
        character: 'Character',
        characterCount: 'Character Count',
        characterSize: 'Character Size',
        activeColor: 'Active Color',
        backgroundColor: 'Background Color',
      },
    },
  },
}

export const ratingLocaleMessages = {
  messages: zhCN,
  locales: {
    'zh-CN': zhCN,
    'en-US': enUS,
  },
}
