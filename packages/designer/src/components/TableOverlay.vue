<script setup lang="ts">
import type { TableNode } from '@easyink/schema'
import { computed } from 'vue'
import { useDesignerStore } from '../composables'
import { useTableColumnResize, useTableRowResize } from '../composables'
import { isTableNode } from '@easyink/schema'

const store = useDesignerStore()

const props = defineProps<{
  getPageEl: () => HTMLElement | null
}>()

const { onColumnBorderPointerDown } = useTableColumnResize({
  store,
  getPageEl: props.getPageEl,
})

const { onRowBorderPointerDown } = useTableRowResize({
  store,
  getPageEl: props.getPageEl,
})

const tableNode = computed<TableNode | null>(() => {
  const id = store.tableEditing.tableId
  if (!id)
    return null
  const node = store.getElementById(id)
  if (!node || !isTableNode(node))
    return null
  return node
})

const unit = computed(() => store.schema.unit)

/** Sum of all column ratios (may != 1 after column resize). */
const totalColRatio = computed(() => {
  const node = tableNode.value
  if (!node)
    return 1
  let sum = 0
  for (const col of node.table.topology.columns)
    sum += col.ratio
  return sum || 1
})

/** Column border X positions (between columns, excludes left edge and right edge). */
const colBorderXList = computed(() => {
  const node = tableNode.value
  if (!node)
    return []
  const { columns } = node.table.topology
  const total = totalColRatio.value
  const positions: number[] = []
  let accX = 0
  for (let i = 0; i < columns.length - 1; i++) {
    accX += (columns[i]!.ratio / total) * node.width
    positions.push(accX)
  }
  return positions
})

/** Row border Y positions (between rows, excludes top edge and bottom edge).
 *  Uses proportional distribution to match browser table layout (height:100%). */
const rowBorderYList = computed(() => {
  const node = tableNode.value
  if (!node)
    return []
  const { rows } = node.table.topology
  let totalRowHeight = 0
  for (const row of rows)
    totalRowHeight += row.height
  const scale = totalRowHeight > 0 ? node.height / totalRowHeight : 1
  const positions: number[] = []
  let accY = 0
  for (let i = 0; i < rows.length - 1; i++) {
    accY += rows[i]!.height * scale
    positions.push(accY)
  }
  return positions
})

/** Selected cell highlight rect. */
const cellHighlight = computed(() => {
  const node = tableNode.value
  const cellPath = store.tableEditing.cellPath
  if (!node || !cellPath)
    return null

  const { columns, rows } = node.table.topology
  const { row, col } = cellPath
  if (row >= rows.length || col >= columns.length)
    return null

  const total = totalColRatio.value

  // Proportional row scale to match browser table layout (height:100%)
  let totalRowHeight = 0
  for (const r of rows)
    totalRowHeight += r.height
  const rowScale = totalRowHeight > 0 ? node.height / totalRowHeight : 1

  let x = 0
  for (let c = 0; c < col; c++)
    x += (columns[c]!.ratio / total) * node.width

  let y = 0
  for (let r = 0; r < row; r++)
    y += rows[r]!.height * rowScale

  const cell = rows[row]!.cells[col]
  const colSpan = cell?.colSpan ?? 1
  const rowSpan = cell?.rowSpan ?? 1

  let w = 0
  for (let c = col; c < Math.min(col + colSpan, columns.length); c++)
    w += (columns[c]!.ratio / total) * node.width

  let h = 0
  for (let r = row; r < Math.min(row + rowSpan, rows.length); r++)
    h += rows[r]!.height * rowScale

  return { x, y, w, h }
})

const showCellHighlight = computed(() => {
  return store.tableEditing.phase === 'cell-selected' || store.tableEditing.phase === 'content-editing'
})
</script>

<template>
  <div
    v-if="tableNode"
    class="ei-table-overlay"
    :style="{
      left: `${tableNode.x}${unit}`,
      top: `${tableNode.y}${unit}`,
      width: `${tableNode.width}${unit}`,
      height: `${tableNode.height}${unit}`,
    }"
  >
    <!-- Column grid lines -->
    <div
      v-for="(x, i) in colBorderXList"
      :key="`col-${i}`"
      class="ei-table-overlay__col-line"
      :style="{ left: `${x}${unit}` }"
    />

    <!-- Row grid lines -->
    <div
      v-for="(y, i) in rowBorderYList"
      :key="`row-${i}`"
      class="ei-table-overlay__row-line"
      :style="{ top: `${y}${unit}` }"
    />

    <!-- Column resize handles -->
    <div
      v-for="(x, i) in colBorderXList"
      :key="`col-handle-${i}`"
      class="ei-table-overlay__col-handle"
      :style="{ left: `${x}${unit}` }"
      @pointerdown="onColumnBorderPointerDown($event, tableNode!, i)"
    />

    <!-- Row resize handles -->
    <div
      v-for="(y, i) in rowBorderYList"
      :key="`row-handle-${i}`"
      class="ei-table-overlay__row-handle"
      :style="{ top: `${y}${unit}` }"
      @pointerdown="onRowBorderPointerDown($event, tableNode!, i)"
    />

    <!-- Selected cell highlight -->
    <div
      v-if="showCellHighlight && cellHighlight"
      class="ei-table-overlay__cell-highlight"
      :style="{
        left: `${cellHighlight.x}${unit}`,
        top: `${cellHighlight.y}${unit}`,
        width: `${cellHighlight.w}${unit}`,
        height: `${cellHighlight.h}${unit}`,
      }"
    />
  </div>
</template>

<style scoped>
.ei-table-overlay {
  position: absolute;
  pointer-events: none;
  z-index: 10;
}

.ei-table-overlay__col-line,
.ei-table-overlay__row-line {
  position: absolute;
  pointer-events: none;
}

.ei-table-overlay__col-line {
  top: 0;
  width: 1px;
  height: 100%;
  background: rgba(24, 144, 255, 0.3);
}

.ei-table-overlay__row-line {
  left: 0;
  width: 100%;
  height: 1px;
  background: rgba(24, 144, 255, 0.3);
}

/* Column resize handle: tall thin hit area */
.ei-table-overlay__col-handle {
  position: absolute;
  top: 0;
  width: 6px;
  height: 100%;
  margin-left: -3px;
  cursor: col-resize;
  pointer-events: auto;
  z-index: 2;
}

.ei-table-overlay__col-handle:hover {
  background: rgba(24, 144, 255, 0.15);
}

/* Row resize handle: wide thin hit area */
.ei-table-overlay__row-handle {
  position: absolute;
  left: 0;
  width: 100%;
  height: 6px;
  margin-top: -3px;
  cursor: row-resize;
  pointer-events: auto;
  z-index: 2;
}

.ei-table-overlay__row-handle:hover {
  background: rgba(24, 144, 255, 0.15);
}

/* Cell highlight */
.ei-table-overlay__cell-highlight {
  position: absolute;
  border: 2px solid var(--ei-primary, #1890ff);
  background: rgba(24, 144, 255, 0.08);
  pointer-events: none;
  z-index: 1;
}
</style>
