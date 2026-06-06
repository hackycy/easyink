const zhCN = {
  materials: {
    chartGauge: {
      name: '仪表盘',
      property: {
        progressColor: '进度颜色',
        trackColor: '轨道颜色',
        pointerColor: '指针颜色',
        labelColor: '标签颜色',
        minValue: '最小值',
        maxValue: '最大值',
        defaultName: '默认标题',
        defaultUnit: '默认单位',
        showPointer: '显示指针',
        showProgress: '显示进度',
        showTitle: '显示标题',
        showValue: '显示数值',
      },
      data: {
        value: '数值字段',
        name: '标题字段',
        unit: '单位字段',
        color: '颜色字段',
      },
    },
  },
}

const enUS = {
  materials: {
    chartGauge: {
      name: 'Gauge Chart',
      property: {
        progressColor: 'Progress Color',
        trackColor: 'Track Color',
        pointerColor: 'Pointer Color',
        labelColor: 'Label Color',
        minValue: 'Minimum',
        maxValue: 'Maximum',
        defaultName: 'Default Title',
        defaultUnit: 'Default Unit',
        showPointer: 'Show Pointer',
        showProgress: 'Show Progress',
        showTitle: 'Show Title',
        showValue: 'Show Value',
      },
      data: {
        value: 'Value Field',
        name: 'Title Field',
        unit: 'Unit Field',
        color: 'Color Field',
      },
    },
  },
}

export const chartGaugeLocaleMessages = {
  messages: zhCN,
  locales: {
    'zh-CN': zhCN,
    'en-US': enUS,
  },
}
