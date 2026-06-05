const zhCN = {
  materials: {
    text: {
      name: '文本',
      property: {
        content: '内容',
        prefix: '前缀',
        suffix: '后缀',
        writingMode: '书写模式',
        heightMode: '高度模式',
        minHeight: '最小高度',
        maxHeight: '最大高度',
        wrapMode: '换行模式',
        overflow: '溢出',
      },
      placeholder: {
        empty: '请输入内容或绑定数据',
      },
      option: {
        writingModeHorizontal: '水平',
        writingModeVertical: '垂直',
        heightModeFixed: '固定高度',
        heightModeAuto: '自动高度',
        wrapNormal: '按词换行',
        wrapNoWrap: '不换行',
        wrapAnywhere: '任意换行',
        overflowVisible: '显示',
        overflowHidden: '隐藏',
        overflowEllipsis: '省略',
      },
      history: {
        updateHeight: '调整文本高度',
      },
    },
  },
}

const enUS = {
  materials: {
    text: {
      name: 'Text',
      property: {
        content: 'Content',
        prefix: 'Prefix',
        suffix: 'Suffix',
        writingMode: 'Writing Mode',
        heightMode: 'Height Mode',
        minHeight: 'Min Height',
        maxHeight: 'Max Height',
        wrapMode: 'Wrap Mode',
        overflow: 'Overflow',
      },
      placeholder: {
        empty: 'Enter content or bind data',
      },
      option: {
        writingModeHorizontal: 'Horizontal',
        writingModeVertical: 'Vertical',
        heightModeFixed: 'Fixed Height',
        heightModeAuto: 'Auto Height',
        wrapNormal: 'Word Wrap',
        wrapNoWrap: 'No Wrap',
        wrapAnywhere: 'Anywhere Wrap',
        overflowVisible: 'Visible',
        overflowHidden: 'Hidden',
        overflowEllipsis: 'Ellipsis',
      },
      history: {
        updateHeight: 'Update Text Height',
      },
    },
  },
}

export const textLocaleMessages = {
  messages: zhCN,
  locales: {
    'zh-CN': zhCN,
    'en-US': enUS,
  },
}
