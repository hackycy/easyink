const zhCN = {
  materials: {
    flowRow: {
      name: '流动行',
      property: {
        gap: '间距',
        paddingHorizontal: '水平内边距',
        paddingVertical: '垂直内边距',
        column: '流式列属性',
        wrapMode: '换行模式',
        ratio: '宽度比例',
      },
      action: {
        insertBefore: '左侧插入',
        insertAfter: '右侧插入',
        removeColumn: '删除列',
      },
      history: {
        insertColumn: '插入流式列',
        removeColumn: '删除流式列',
        resizeColumn: '调整流式列宽',
        updateColumn: '修改流式列',
        updateHeight: '调整流式行高度',
      },
      option: {
        inline: '行内',
        block: '独占行',
      },
    },
  },
}

const enUS = {
  materials: {
    flowRow: {
      name: 'Flow Row',
      property: {
        gap: 'Gap',
        paddingHorizontal: 'Horizontal Padding',
        paddingVertical: 'Vertical Padding',
        column: 'Flow Column Properties',
        wrapMode: 'Wrap Mode',
        ratio: 'Width Ratio',
      },
      action: {
        insertBefore: 'Insert Left',
        insertAfter: 'Insert Right',
        removeColumn: 'Remove Column',
      },
      history: {
        insertColumn: 'Insert Flow Column',
        removeColumn: 'Remove Flow Column',
        resizeColumn: 'Resize Flow Column',
        updateColumn: 'Update Flow Column',
        updateHeight: 'Update Flow Row Height',
      },
      option: {
        inline: 'Inline',
        block: 'Full Line',
      },
    },
  },
}

export const flowRowLocaleMessages = {
  messages: zhCN,
  locales: {
    'zh-CN': zhCN,
    'en-US': enUS,
  },
}
