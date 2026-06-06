const zhCN = {
  materials: {
    chartScatter: {
      name: '散点图',
      property: {
        pointColor: '点颜色',
        axisColor: '坐标轴颜色',
        labelColor: '标签颜色',
        showValueLabels: '显示标签',
        showGrid: '显示网格线',
        showXAxisLabel: '显示 X 轴标签',
        showYAxisLabel: '显示 Y 轴标签',
        showXAxisLine: '显示 X 轴线',
        showYAxisLine: '显示 Y 轴线',
        symbolSize: '点大小',
      },
      data: {
        x: 'X 数值字段',
        y: 'Y 数值字段',
        label: '标签字段',
        color: '颜色字段',
      },
    },
  },
}

const enUS = {
  materials: {
    chartScatter: {
      name: 'Scatter Chart',
      property: {
        pointColor: 'Point Color',
        axisColor: 'Axis Color',
        labelColor: 'Label Color',
        showValueLabels: 'Show Labels',
        showGrid: 'Show Grid',
        showXAxisLabel: 'Show X Labels',
        showYAxisLabel: 'Show Y Labels',
        showXAxisLine: 'Show X Axis Line',
        showYAxisLine: 'Show Y Axis Line',
        symbolSize: 'Point Size',
      },
      data: {
        x: 'X Value Field',
        y: 'Y Value Field',
        label: 'Label Field',
        color: 'Color Field',
      },
    },
  },
}

export const chartScatterLocaleMessages = {
  messages: zhCN,
  locales: {
    'zh-CN': zhCN,
    'en-US': enUS,
  },
}
