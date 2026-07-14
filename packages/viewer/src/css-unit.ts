export type ViewerCssUnit = 'mm' | 'pt' | 'px' | 'in'

export function toViewerCssUnit(unit: 'mm' | 'pt' | 'px' | 'inch'): ViewerCssUnit {
  return unit === 'inch' ? 'in' : unit
}
