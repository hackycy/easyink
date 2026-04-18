import type { TableNode } from '@easyink/schema'

/** Selection payload for table cell selection. */
export interface TableCellPayload {
  row: number
  col: number
}

/**
 * Delegate interface for table editing behaviors.
 * Provides accessors and context that behaviors need from the material layer.
 */
export interface TableEditingDelegate {
  /** Get current table node by ID. */
  getNode: (nodeId: string) => TableNode | undefined
  /** Table kind: 'static' or 'data'. */
  getTableKind: () => 'static' | 'data'
  /** Number of virtual placeholder rows (0 for table-static, 2 for table-data). */
  getPlaceholderRowCount: () => number
  /** Document unit string (e.g. 'mm', 'px'). */
  getUnit: () => string
  /** Convert screen pixels to document units. */
  screenToDoc: (screenVal: number, screenOrigin: number, zoom: number) => number
  /** Current viewport zoom level. */
  getZoom: () => number
  /** Page DOM element for coordinate conversion. */
  getPageEl: () => HTMLElement | null
  /** Translate i18n key. */
  t: (key: string) => string
}
