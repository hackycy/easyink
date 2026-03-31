import type { DataTableColumn, DataTableProps } from '@easyink/core'
import type { InteractionContext, InteractionStrategy } from '@easyink/designer'
import { createUpdatePropsCommand } from '@easyink/core'
import { h } from 'vue'

/**
 * 数据表格交互策略
 *
 * - selected 级：在列边界线上渲染列宽拖拽手柄
 * - editing 级（双击）：
 *   - 表头行单元格：进入标题编辑（contenteditable）
 *   - 交互行单元格：选中该列，属性面板聚焦列配置
 * - drop 处理：字段拖入交互行设置 column.binding.path
 */
export const dataTableInteractionStrategy: InteractionStrategy = {
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

    // 检查是否点击了列宽拖拽手柄
    const target = event.originalEvent.target as HTMLElement
    if (target.classList.contains('easyink-dt-col-handle')) {
      const colIndex = Number(target.dataset.colIndex)
      if (!Number.isNaN(colIndex)) {
        startColumnResize(event.material.id, colIndex, event.originalEvent)
        return true
      }
    }
    return false
  },

  onEnterEditing(material, context) {
    // 查找表格 DOM，启用表头编辑
    const tableEl = document.querySelector(
      `[data-material-id="${material.id}"] table`,
    ) as HTMLElement | null
    if (!tableEl) {
      return
    }

    const props = material.props as unknown as DataTableProps
    const columns = props.columns ?? []
    if (columns.length === 0) {
      return
    }

    // 使表头单元格可编辑
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
          commitColumnTitleChange(material.id, columns, colIndex, newTitle, context)
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
  },

  onExitEditing(material) {
    const tableEl = document.querySelector(
      `[data-material-id="${material.id}"] table`,
    ) as HTMLElement | null
    if (!tableEl) {
      return
    }

    const headerCells = tableEl.querySelectorAll('thead th')
    headerCells.forEach((th) => {
      const thEl = th as HTMLElement
      thEl.contentEditable = 'false'
      thEl.style.cursor = ''
    })
  },

  renderOverlay(state, material) {
    if (state !== 'selected') {
      return null
    }

    const props = material.props as unknown as DataTableProps
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
          'class': 'easyink-dt-col-handle',
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
      class: 'easyink-dt-col-handles',
      style: {
        position: 'absolute',
        inset: '0',
        pointerEvents: 'none',
      },
    }, handles.map(handle => h('div', {
      style: { pointerEvents: 'auto' },
    }, [handle])))
  },

  onDrop(event, material, context) {
    const transferData = event.dataTransfer?.getData('text/plain')
    if (!transferData) {
      return false
    }

    const props = material.props as unknown as DataTableProps
    const columns = [...(props.columns ?? [])]

    // 识别拖入的列位置
    const target = event.target as HTMLElement
    const td = target.closest('td')
    if (!td) {
      return false
    }

    const tr = td.parentElement as HTMLTableRowElement | null
    if (!tr) {
      return false
    }

    const cellIndex = td.cellIndex
    if (cellIndex < 0 || cellIndex >= columns.length) {
      return false
    }

    // 同源约束校验
    const dotIdx = transferData.indexOf('.')
    if (dotIdx > 0) {
      const newPrefix = transferData.slice(0, dotIdx)
      for (const col of columns) {
        if (col.binding?.path) {
          const existingDotIdx = col.binding.path.indexOf('.')
          if (existingDotIdx > 0) {
            const existingPrefix = col.binding.path.slice(0, existingDotIdx)
            if (existingPrefix !== newPrefix) {
              return false
            }
          }
        }
      }
    }

    // 更新列绑定
    const updatedColumns = columns.map((col, idx) => {
      if (idx === cellIndex) {
        return { ...col, binding: { path: transferData } }
      }
      return col
    })

    const engine = context.getEngine()
    const cmd = createUpdatePropsCommand(
      {
        materialId: material.id,
        oldProps: { columns },
        newProps: { columns: updatedColumns },
      },
      engine.operations,
    )
    context.executeCommand(cmd)
    return true
  },
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

  // 获取当前列宽
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

    // 触发列宽持久化 -- 通过 DOM 事件冒泡
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

function commitColumnTitleChange(
  materialId: string,
  columns: DataTableColumn[],
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
