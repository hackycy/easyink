// ─── Components ───
export { DesignCanvas } from './components/DesignCanvas'
export { EasyInkDesigner } from './components/EasyInkDesigner'
export { PropertyPanel } from './components/PropertyPanel'
export { SelectionOverlay } from './components/SelectionOverlay'
export { StatusBar } from './components/StatusBar'
export { ToolbarPanel } from './components/ToolbarPanel'

// ─── Composables ───
export { useCanvas } from './composables/use-canvas'
export type { CanvasOptions } from './composables/use-canvas'
export { useDesigner } from './composables/use-designer'
export { useInteraction } from './composables/use-interaction'

export { useSelection } from './composables/use-selection'

// ─── Editors ───
export {
  ColorEditor,
  getEditor,
  hasEditor,
  NumberEditor,
  registerEditor,
  SelectEditor,
  SwitchEditor,
  TextEditor,
} from './editors/index'
export type { LocaleMessages } from './locale/types'

// ─── Locale ───
export { useLocale } from './locale/use-locale'
export { zhCN } from './locale/zh-CN'
// ─── Types ───
export type {
  CanvasViewport,
  DesignerContext,
  DesignerOptions,
  ResizeHandlePosition,
  SelectionState,
} from './types'
export { DESIGNER_INJECTION_KEY } from './types'
