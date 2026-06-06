const zhCN = {
  materials: {
    chartRadar: {
      name: '雷达图',
      property: {
        areaColor: '填充颜色',
        lineColor: '线条颜色',
        pointColor: '节点颜色',
        axisColor: '坐标轴颜色',
        labelColor: '标签颜色',
        maxValue: '最大值',
        showValueLabels: '显示数值',
        showAxisLabels: '显示分类标签',
        showArea: '显示填充',
        showPoints: '显示节点',
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
    chartRadar: {
      name: 'Radar Chart',
      property: {
        areaColor: 'Area Color',
        lineColor: 'Line Color',
        pointColor: 'Point Color',
        axisColor: 'Axis Color',
        labelColor: 'Label Color',
        maxValue: 'Max Value',
        showValueLabels: 'Show Values',
        showAxisLabels: 'Show Axis Labels',
        showArea: 'Show Area',
        showPoints: 'Show Points',
      },
      data: {
        category: 'Category Field',
        value: 'Value Field',
      },
    },
  },
}

export const chartRadarLocaleMessages = {
  messages: zhCN,
  locales: {
    'zh-CN': zhCN,
    'en-US': enUS,
  },
}
