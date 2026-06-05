const zhCN = {
  materials: {
    table: {
      property: {
        cell: '单元格属性',
      },
      action: {
        insertRowAbove: '上方插入行',
        insertRowBelow: '下方插入行',
        removeRow: '删除行',
        insertColLeft: '左侧插入列',
        insertColRight: '右侧插入列',
        removeCol: '删除列',
        mergeRight: '向右合并',
        mergeDown: '向下合并',
        split: '拆分',
        splitCell: '拆分单元格',
        alignLeft: '左对齐',
        alignCenter: '居中对齐',
        alignRight: '右对齐',
        alignTop: '顶部对齐',
        alignMiddle: '垂直居中',
        alignBottom: '底部对齐',
      },
      history: {
        insertRowAbove: '上方插入行',
        insertRowBelow: '下方插入行',
        removeRow: '删除行',
        insertColLeft: '左侧插入列',
        insertColRight: '右侧插入列',
        removeCol: '删除列',
        mergeRight: '向右合并',
        mergeDown: '向下合并',
        splitCell: '拆分单元格',
        updateCell: '修改单元格',
        updateSection: '修改表格区段',
        resizeColumn: '调整列宽',
        resizeRow: '调整行高',
        updateVisibility: '切换表格区段显示',
      },
      section: {
        header: '表头',
        data: '数据区',
        summary: '汇总区',
        footer: '表尾',
      },
    },
  },
}

const enUS = {
  materials: {
    table: {
      property: {
        cell: 'Cell Properties',
      },
      action: {
        insertRowAbove: 'Insert Row Above',
        insertRowBelow: 'Insert Row Below',
        removeRow: 'Remove Row',
        insertColLeft: 'Insert Column Left',
        insertColRight: 'Insert Column Right',
        removeCol: 'Remove Column',
        mergeRight: 'Merge Right',
        mergeDown: 'Merge Down',
        split: 'Split',
        splitCell: 'Split Cell',
        alignLeft: 'Align Left',
        alignCenter: 'Align Center',
        alignRight: 'Align Right',
        alignTop: 'Align Top',
        alignMiddle: 'Align Middle',
        alignBottom: 'Align Bottom',
      },
      history: {
        insertRowAbove: 'Insert Row Above',
        insertRowBelow: 'Insert Row Below',
        removeRow: 'Remove Row',
        insertColLeft: 'Insert Column Left',
        insertColRight: 'Insert Column Right',
        removeCol: 'Remove Column',
        mergeRight: 'Merge Right',
        mergeDown: 'Merge Down',
        splitCell: 'Split Cell',
        updateCell: 'Update Cell',
        updateSection: 'Update Table Section',
        resizeColumn: 'Resize Column',
        resizeRow: 'Resize Row',
        updateVisibility: 'Toggle Table Section Visibility',
      },
      section: {
        header: 'Header',
        data: 'Data',
        summary: 'Summary',
        footer: 'Footer',
      },
    },
  },
}

export const tableKernelLocaleMessages = {
  messages: zhCN,
  locales: {
    'zh-CN': zhCN,
    'en-US': enUS,
  },
}
