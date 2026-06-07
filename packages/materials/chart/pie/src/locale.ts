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
        paletteProduct: '产品',
        palettePrimer: '代码',
        paletteAtlassian: '协作',
        paletteSpectrum: '鲜活',
        paletteMint: '薄荷',
        paletteSunset: '日落',
        paletteAurora: '极光',
        paletteEarth: '自然',
        paletteMono: '中性',
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
        paletteProduct: 'Product',
        palettePrimer: 'Primer',
        paletteAtlassian: 'Atlassian',
        paletteSpectrum: 'Spectrum',
        paletteMint: 'Mint',
        paletteSunset: 'Sunset',
        paletteAurora: 'Aurora',
        paletteEarth: 'Earth',
        paletteMono: 'Neutral',
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
