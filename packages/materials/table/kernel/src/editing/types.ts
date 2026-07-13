import type { MaterialNode } from '@easyink/schema'
import type { JsonObject } from '@easyink/shared'

/** Selection payload for table cell selection. */
export interface TableCellPayload extends JsonObject {
  row: number
  col: number
}

/**
 * Delegate interface for table editing behaviors.
 * Provides accessors and context that behaviors need from the material layer.
 */
export interface TableEditingDelegate {
  /** Get current table node by ID. */
  getNode: (nodeId: string) => MaterialNode<unknown> | undefined
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
  /**
   * Optional per-row visibility mask aligned with the projected model rows.
   * Returns `true` for hidden rows. table-data builds this from
   * `showHeader` / `showFooter`. Omitted/undefined means all rows visible.
   */
  getHiddenRowMask?: (node: MaterialNode<unknown>) => readonly boolean[] | undefined
  /** Whether a given row can be resized by the outer table control layer. */
  canResizeRow?: (node: MaterialNode<unknown>, rowIndex: number) => boolean
  /** Whether a given column can be resized by the outer table control layer. */
  canResizeColumn?: (node: MaterialNode<unknown>, colIndex: number) => boolean
}
