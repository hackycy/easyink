const zhCN = {
  materials: {
    chartPie: {
      name: '饼图',
      property: {
        palettePreset: '配色方案',
        labelColor: '标签颜色',
        innerRadiusPercent: '内半径比例',
        sectorGapAngle: '扇区间隙',
        sectorCornerRadius: '扇区圆角',
        showValueLabels: '显示数值',
        showLegend: '显示图例',
      },
      data: {
        category: '分类字段',
        value: '数值字段',
        color: '颜色字段',
      },
      option: {
        paletteClassic: '经典',
        paletteBusiness: '商务',
        palettePastel: '柔和',
      },
    },
  },
}

const enUS = {
  materials: {
    chartPie: {
      name: 'Pie Chart',
      property: {
        palettePreset: 'Palette',
        labelColor: 'Label Color',
        innerRadiusPercent: 'Inner Radius',
        sectorGapAngle: 'Sector Gap',
        sectorCornerRadius: 'Sector Corner Radius',
        showValueLabels: 'Show Values',
        showLegend: 'Show Legend',
      },
      data: {
        category: 'Category Field',
        value: 'Value Field',
        color: 'Color Field',
      },
      option: {
        paletteClassic: 'Classic',
        paletteBusiness: 'Business',
        palettePastel: 'Pastel',
      },
    },
  },
}

export const chartPieLocaleMessages = {
  messages: zhCN,
  locales: {
    'zh-CN': zhCN,
    'en-US': enUS,
  },
}
