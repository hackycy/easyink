import type { StaticTableCell, StaticTableColumn, StaticTableProps } from '@easyink/core'
import type { InteractionContext, InteractionStrategy } from '@easyink/designer'
import {
  createDeleteTableColumnCommand,
  createDeleteTableRowCommand,
  createEditTableCellCommand,
  createInsertTableColumnCommand,
  createInsertTableRowCommand,
  createUpdatePropsCommand,
} from '@easyink/core'
import { generateId } from '@easyink/shared'
import { h } from 'vue'

/**
 * 静态表格交互策略
 *
 * - selected 级：列宽拖拽手柄
 * - editing 级（双击）：
 *   - 表头单元格（showHeader=true 时）：contenteditable 编辑
 *   - 数据区单元格：contenteditable 编辑
 * - 右键菜单：插入行/删除行/插入列/删除列
 */
export const tableInteractionStrategy: InteractionStrategy = {
  onDoubleClick(event, state) {
    if (state !== 'selected') {
      return false
    }
    return true
  },

  onMouseDown(event, state) {
    if (state !== 'selected') {
      return false
    }

    const target = event.originalEvent.target as HTMLElement
    if (target.classList.contains('easyink-table-col-handle')) {
      const colIndex = Number(target.dataset.colIndex)
      if (!Number.isNaN(colIndex)) {
        startColumnResize(event.material.id, colIndex, event.originalEvent)
        return true
      }
    }
    return false
  },

  onEnterEditing(material, context) {
    const tableEl = document.querySelector(
      `[data-material-id="${material.id}"] table`,
    ) as HTMLElement | null
    if (!tableEl) {
      return
    }

    const props = material.props as unknown as StaticTableProps
    const columns = props.columns ?? []
    const cells = props.cells ?? {}

    // 使表头可编辑（仅当 showHeader 不为 false）
    if ((material.props.showHeader as boolean | undefined) !== false) {
      const headerCells = tableEl.querySelectorAll('thead th')
      headerCells.forEach((th, colIndex) => {
        const thEl = th as HTMLElement
        thEl.contentEditable = 'true'
        thEl.style.outline = 'none'
        thEl.style.cursor = 'text'

        function onBlur(): void {
          thEl.contentEditable = 'false'
          thEl.style.cursor = ''
          const newTitle = thEl.textContent ?? ''
          if (newTitle !== columns[colIndex].title) {
            commitHeaderChange(material.id, columns, colIndex, newTitle, context)
          }
        }

        function onKeyDown(e: KeyboardEvent): void {
          if (e.key === 'Escape') {
            thEl.textContent = columns[colIndex].title
            thEl.contentEditable = 'false'
            thEl.style.cursor = ''
          }
          else if (e.key === 'Enter') {
            e.preventDefault()
            thEl.blur()
          }
        }

        thEl.addEventListener('blur', onBlur)
        thEl.addEventListener('keydown', onKeyDown)
      })
    }

    // 使数据单元格可编辑
    const dataCells = tableEl.querySelectorAll('tbody td')
    dataCells.forEach((td) => {
      const tdEl = td as HTMLTableCellElement
      const row = tdEl.parentElement as HTMLTableRowElement
      if (!row)
        return

      const rowIndex = row.rowIndex - (tableEl.querySelector('thead') ? 1 : 0)
      const colIndex = tdEl.cellIndex
      const cellKey = `${rowIndex}-${colIndex}`
      const cell = cells[cellKey]

      // 绑定模式下阻止编辑
      if (cell?.binding?.path) {
        return
      }

      tdEl.contentEditable = 'true'
      tdEl.style.outline = 'none'
      tdEl.style.cursor = 'text'

      function onBlur(): void {
        tdEl.contentEditable = 'false'
        tdEl.style.cursor = ''
        const newValue = tdEl.textContent ?? ''
        const oldValue = cell?.value ?? ''
        if (newValue !== oldValue) {
          commitCellChange(material.id, cellKey, cell, newValue, context)
        }
      }

      function onKeyDown(e: KeyboardEvent): void {
        if (e.key === 'Escape') {
          tdEl.textContent = cell?.value ?? ''
          tdEl.contentEditable = 'false'
          tdEl.style.cursor = ''
        }
        else if (e.key === 'Enter') {
          e.preventDefault()
          tdEl.blur()
        }
      }

      tdEl.addEventListener('blur', onBlur)
      tdEl.addEventListener('keydown', onKeyDown)
    })
  },

  onExitEditing(material) {
    const tableEl = document.querySelector(
      `[data-material-id="${material.id}"] table`,
    ) as HTMLElement | null
    if (!tableEl) {
      return
    }

    // 关闭所有编辑状态
    const allEditable = tableEl.querySelectorAll('[contenteditable="true"]')
    allEditable.forEach((el) => {
      const htmlEl = el as HTMLElement
      htmlEl.contentEditable = 'false'
      htmlEl.style.cursor = ''
    })
  },

  renderOverlay(state, material) {
    if (state !== 'selected') {
      return null
    }

    const props = material.props as unknown as StaticTableProps
    const columns = props.columns ?? []
    if (columns.length <= 1) {
      return null
    }

    // 生成列宽拖拽手柄
    const handles: ReturnType<typeof h>[] = []
    let accWidth = 0
    for (let i = 0; i < columns.length - 1; i++) {
      accWidth += columns[i].width
      handles.push(
        h('div', {
          'class': 'easyink-table-col-handle',
          'data-col-index': i,
          'style': {
            position: 'absolute',
            left: `${accWidth}%`,
            top: '0',
            width: '6px',
            height: '100%',
            marginLeft: '-3px',
            cursor: 'col-resize',
            zIndex: 10,
          },
        }),
      )
    }

    return h('div', {
      class: 'easyink-table-col-handles',
      style: {
        position: 'absolute',
        inset: '0',
        pointerEvents: 'none',
      },
    }, handles.map(handle => h('div', {
      style: { pointerEvents: 'auto' },
    }, [handle])))
  },
}

// ─── 右键菜单项工厂 ───

/**
 * 创建静态表格的右键菜单项
 */
export function createTableContextMenuItems(
  materialId: string,
  rowIndex: number,
  colIndex: number,
  context: InteractionContext,
): Array<{ label: string, action: () => void }> {
  const engine = context.getEngine()
  const material = engine.schema.getMaterialById(materialId)
  if (!material) {
    return []
  }

  const props = material.props as unknown as StaticTableProps
  const columns = props.columns ?? []
  const cells = props.cells ?? {}
  const rowCount = props.rowCount ?? 0

  return [
    {
      label: '上方插入行',
      action: () => {
        const cmd = createInsertTableRowCommand(
          { materialId, rowIndex },
          engine.operations,
        )
        context.executeCommand(cmd)
      },
    },
    {
      label: '下方插入行',
      action: () => {
        const cmd = createInsertTableRowCommand(
          { materialId, rowIndex: rowIndex + 1 },
          engine.operations,
        )
        context.executeCommand(cmd)
      },
    },
    {
      label: '删除行',
      action: () => {
        if (rowCount <= 1)
          return
        const deletedCells: Record<string, StaticTableCell> = {}
        for (let c = 0; c < columns.length; c++) {
          const key = `${rowIndex}-${c}`
          if (cells[key]) {
            deletedCells[key] = cells[key]
          }
        }
        const cmd = createDeleteTableRowCommand(
          { materialId, rowIndex, deletedCells },
          engine.operations,
        )
        context.executeCommand(cmd)
      },
    },
    {
      label: '左侧插入列',
      action: () => {
        const newCol = { key: generateId(), title: `列 ${columns.length + 1}`, width: Math.round(100 / (columns.length + 1)) }
        const cmd = createInsertTableColumnCommand(
          { materialId, colIndex, column: newCol },
          engine.operations,
        )
        context.executeCommand(cmd)
      },
    },
    {
      label: '右侧插入列',
      action: () => {
        const newCol = { key: generateId(), title: `列 ${columns.length + 1}`, width: Math.round(100 / (columns.length + 1)) }
        const cmd = createInsertTableColumnCommand(
          { materialId, colIndex: colIndex + 1, column: newCol },
          engine.operations,
        )
        context.executeCommand(cmd)
      },
    },
    {
      label: '删除列',
      action: () => {
        if (columns.length <= 1)
          return
        const deletedCells: Record<string, StaticTableCell> = {}
        for (let r = 0; r < rowCount; r++) {
          const key = `${r}-${colIndex}`
          if (cells[key]) {
            deletedCells[key] = cells[key]
          }
        }
        const cmd = createDeleteTableColumnCommand(
          {
            materialId,
            colIndex,
            deletedColumn: columns[colIndex],
            deletedCells,
          },
          engine.operations,
        )
        context.executeCommand(cmd)
      },
    },
  ]
}

// ─── 辅助函数 ───

function startColumnResize(
  materialId: string,
  colIndex: number,
  startEvent: MouseEvent,
): void {
  const tableWrapper = document.querySelector(
    `[data-material-id="${materialId}"]`,
  ) as HTMLElement | null
  if (!tableWrapper) {
    return
  }

  const wrapperRect = tableWrapper.getBoundingClientRect()
  const startX = startEvent.clientX

  const tableEl = tableWrapper.querySelector('table') as HTMLTableElement | null
  if (!tableEl) {
    return
  }

  const cols = tableEl.querySelectorAll('colgroup col')
  const currentWidths: number[] = []
  cols.forEach((colEl) => {
    currentWidths.push(Number.parseFloat((colEl as HTMLElement).style.width) || 0)
  })

  function onMouseMove(e: MouseEvent): void {
    const deltaX = e.clientX - startX
    const deltaPercent = (deltaX / wrapperRect.width) * 100

    const newLeft = Math.max(5, currentWidths[colIndex] + deltaPercent)
    const newRight = Math.max(5, currentWidths[colIndex + 1] - deltaPercent)

    cols[colIndex]!.setAttribute('style', `width: ${newLeft}%`)
    cols[colIndex + 1]!.setAttribute('style', `width: ${newRight}%`)
  }

  function onMouseUp(e: MouseEvent): void {
    document.removeEventListener('mousemove', onMouseMove)
    document.removeEventListener('mouseup', onMouseUp)

    const deltaX = e.clientX - startX
    const deltaPercent = (deltaX / wrapperRect.width) * 100

    const newLeft = Math.max(5, currentWidths[colIndex] + deltaPercent)
    const newRight = Math.max(5, currentWidths[colIndex + 1] - deltaPercent)

    const detail = {
      materialId,
      colIndex,
      widths: currentWidths.map((w, i) => {
        if (i === colIndex)
          return newLeft
        if (i === colIndex + 1)
          return newRight
        return w
      }),
    }

    tableWrapper!.dispatchEvent(new CustomEvent('easyink:column-resize', { detail, bubbles: true }))
  }

  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('mouseup', onMouseUp)
}

function commitHeaderChange(
  materialId: string,
  columns: StaticTableColumn[],
  colIndex: number,
  newTitle: string,
  context: InteractionContext,
): void {
  const updatedColumns = columns.map((col, idx) => {
    if (idx === colIndex) {
      return { ...col, title: newTitle }
    }
    return col
  })

  const engine = context.getEngine()
  const cmd = createUpdatePropsCommand(
    {
      materialId,
      oldProps: { columns },
      newProps: { columns: updatedColumns },
    },
    engine.operations,
  )
  context.executeCommand(cmd)
}

function commitCellChange(
  materialId: string,
  cellKey: string,
  oldCell: StaticTableCell | undefined,
  newValue: string,
  context: InteractionContext,
): void {
  const engine = context.getEngine()
  const newCell: StaticTableCell = {
    ...(oldCell ?? {}),
    value: newValue,
  }

  const cmd = createEditTableCellCommand(
    {
      materialId,
      cellKey,
      oldCell,
      newCell,
    },
    engine.operations,
  )
  context.executeCommand(cmd)
}
