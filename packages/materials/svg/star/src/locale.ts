const zhCN = {
  materials: {
    svgStar: {
      name: '星星',
      property: {
        fillColor: '填充色',
        points: '星角数量',
        innerRatio: '内角比例',
        edit: '星星编辑',
      },
      history: {
        update: '调整星星形状',
      },
    },
  },
}

const enUS = {
  materials: {
    svgStar: {
      name: 'Star',
      property: {
        fillColor: 'Fill Color',
        points: 'Star Points',
        innerRatio: 'Inner Ratio',
        edit: 'Star Edit',
      },
      history: {
        update: 'Adjust Star Shape',
      },
    },
  },
}

export const svgStarLocaleMessages = {
  messages: zhCN,
  locales: {
    'zh-CN': zhCN,
    'en-US': enUS,
  },
}
