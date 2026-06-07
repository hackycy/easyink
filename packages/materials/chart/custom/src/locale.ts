const zhCN = {
  materials: {
    chartCustom: {
      name: '自定义 ECharts',
      property: {
        optionMode: 'Option 来源',
        optionCode: 'Option 代码',
      },
      optionMode: {
        code: '代码编辑',
        bound: '数据绑定',
      },
      datasource: {
        bindOption: '绑定为 ECharts option',
      },
    },
  },
}

const enUS = {
  materials: {
    chartCustom: {
      name: 'Custom ECharts',
      property: {
        optionMode: 'Option Source',
        optionCode: 'Option Code',
      },
      optionMode: {
        code: 'Code',
        bound: 'Binding',
      },
      datasource: {
        bindOption: 'Bind as ECharts option',
      },
    },
  },
}

export const chartCustomLocaleMessages = {
  messages: zhCN,
  locales: {
    'zh-CN': zhCN,
    'en-US': enUS,
  },
}
