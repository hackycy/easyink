import type { ElementRenderFunction } from '../../types'

interface TextProps {
  content: string
  verticalAlign?: 'top' | 'middle' | 'bottom'
  wordBreak?: 'normal' | 'break-all' | 'break-word'
  overflow?: 'visible' | 'hidden' | 'ellipsis'
}

/**
 * 文本元素渲染器
 *
 * 支持数据绑定（binding.path → resolve 为标量显示文本）
 * 数组降级策略：join(', ')
 */
export const renderText: ElementRenderFunction = (node, context) => {
  const el = document.createElement('div')
  el.className = 'easyink-element easyink-text'
  el.dataset.elementId = node.id

  const props = node.props as unknown as TextProps

  // ── 解析内容 ──
  let content: string = props.content ?? ''

  if (node.binding?.path) {
    const resolved = context.resolver.resolve(node.binding.path, context.data)
    if (resolved != null) {
      if (Array.isArray(resolved)) {
        // 数组降级：join
        content = resolved.join(', ')
      }
      else {
        content = String(resolved)
      }
      // 格式化
      if (node.binding.formatter) {
        content = context.resolver.format(
          Array.isArray(resolved) ? resolved : resolved,
          node.binding.formatter,
        )
      }
    }
  }

  // 安全插入：使用 textContent 防 XSS
  el.textContent = content

  // ── 垂直对齐（flex 实现） ──
  if (props.verticalAlign && props.verticalAlign !== 'top') {
    el.style.display = 'flex'
    el.style.alignItems = props.verticalAlign === 'middle' ? 'center' : 'flex-end'
  }

  // ── 文本换行 ──
  if (props.wordBreak)
    el.style.wordBreak = props.wordBreak

  // ── 溢出 ──
  if (props.overflow === 'hidden') {
    el.style.overflow = 'hidden'
  }
  else if (props.overflow === 'ellipsis') {
    el.style.overflow = 'hidden'
    el.style.textOverflow = 'ellipsis'
    el.style.whiteSpace = 'nowrap'
  }

  return el
}
