import type { ElementRenderRegistry } from './element-registry'
import { renderBarcode } from './elements/barcode'
import { renderImage } from './elements/image'
import { renderLine } from './elements/line'
import { renderRect } from './elements/rect'
import { renderTable } from './elements/table'
import { renderText } from './elements/text'

/**
 * 注册所有内置元素渲染函数
 */
export function registerBuiltinRenderers(registry: ElementRenderRegistry): void {
  registry.register('barcode', renderBarcode)
  registry.register('image', renderImage)
  registry.register('line', renderLine)
  registry.register('rect', renderRect)
  registry.register('table', renderTable)
  registry.register('text', renderText)
}
