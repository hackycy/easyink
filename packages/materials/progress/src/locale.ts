const zhCN = {
  materials: {
    progress: {
      name: '进度条',
      property: {
        value: '预设值',
        progressHeight: '进度条高度',
        trackColor: '进度条背景颜色',
        progressColor: '进度条高亮颜色',
        suffix: '进度文字后缀',
        showText: '显示进度文字',
        textPosition: '文字位置',
      },
      option: {
        textPositionTop: '进度条上方',
        textPositionBottom: '进度条下方',
      },
    },
  },
}

const enUS = {
  materials: {
    progress: {
      name: 'Progress Bar',
      property: {
        value: 'Preset Value',
        progressHeight: 'Progress Height',
        trackColor: 'Track Color',
        progressColor: 'Progress Color',
        suffix: 'Text Suffix',
        showText: 'Show Progress Text',
        textPosition: 'Text Position',
      },
      option: {
        textPositionTop: 'Above Progress Bar',
        textPositionBottom: 'Below Progress Bar',
      },
    },
  },
}

export const progressLocaleMessages = {
  messages: zhCN,
  locales: {
    'zh-CN': zhCN,
    'en-US': enUS,
  },
}
