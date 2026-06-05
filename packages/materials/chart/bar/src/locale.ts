const zhCN = {
  materials: {
    chartBar: {
      name: '柱状图',
      property: {
        barColor: '柱子颜色',
        axisColor: '坐标轴颜色',
        labelColor: '标签颜色',
        showValueLabels: '显示数值',
        showGrid: '显示网格线',
        showXAxisLabel: '显示 X 轴标签',
        showYAxisLabel: '显示 Y 轴标签',
        showXAxisLine: '显示 X 轴线',
        showYAxisLine: '显示 Y 轴线',
      },
      data: {
        category: '分类字段',
        value: '数值字段',
      },
    },
  },
}

const enUS = {
  materials: {
    chartBar: {
      name: 'Bar Chart',
      property: {
        barColor: 'Bar Color',
        axisColor: 'Axis Color',
        labelColor: 'Label Color',
        showValueLabels: 'Show Values',
        showGrid: 'Show Grid',
        showXAxisLabel: 'Show X Labels',
        showYAxisLabel: 'Show Y Labels',
        showXAxisLine: 'Show X Axis Line',
        showYAxisLine: 'Show Y Axis Line',
      },
      data: {
        category: 'Category Field',
        value: 'Value Field',
      },
    },
  },
}

export const chartBarLocaleMessages = {
  messages: zhCN,
  locales: {
    'zh-CN': zhCN,
    'en-US': enUS,
  },
}
