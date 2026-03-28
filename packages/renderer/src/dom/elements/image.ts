import type { ElementRenderFunction } from '../../types'

interface ImageProps {
  src: string
  fit: 'contain' | 'cover' | 'fill' | 'none'
  alt?: string
}

/**
 * 图片元素渲染器
 *
 * 支持数据绑定（binding.path → 图片 URL）
 */
export const renderImage: ElementRenderFunction = (node, context) => {
  const wrapper = document.createElement('div')
  wrapper.className = 'easyink-element easyink-image'
  wrapper.dataset.elementId = node.id
  wrapper.style.overflow = 'hidden'

  const props = node.props as unknown as ImageProps

  // 解析图片 src
  let src: string = props.src ?? ''
  if (node.binding?.path) {
    const resolved = context.resolver.resolve(node.binding.path, context.data)
    if (resolved != null)
      src = String(resolved)
  }

  const img = document.createElement('img')
  img.src = src
  img.alt = props.alt ?? ''

  // object-fit 映射
  img.style.width = '100%'
  img.style.height = '100%'
  img.style.objectFit = props.fit ?? 'contain'
  img.style.display = 'block'

  wrapper.appendChild(img)
  return wrapper
}
