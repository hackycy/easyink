import type { InteractionStrategy } from '@easyink/designer'
import { createUpdatePropsCommand } from '@easyink/core'

/**
 * 文本物料交互策略
 *
 * - selected 级：无额外浮层（仅通用 Overlay）
 * - editing 级（双击进入）：创建 contenteditable 行内编辑器
 * - 绑定模式下阻止进入 editing 级
 */
export const textInteractionStrategy: InteractionStrategy = {
  onDoubleClick(event, state) {
    if (state !== 'selected') {
      return false
    }

    // 绑定模式下阻止进入 editing 级
    if (event.material.binding?.path) {
      return false
    }

    return true
  },

  onEnterEditing(material, context) {
    const materialEl = document.querySelector(
      `[data-material-id="${material.id}"]`,
    ) as HTMLElement | null

    if (!materialEl) {
      return
    }

    const oldContent = (material.props.content as string) ?? ''

    materialEl.contentEditable = 'true'
    materialEl.style.outline = 'none'
    materialEl.style.cursor = 'text'
    materialEl.focus()

    // 选中全部文本
    const selection = window.getSelection()
    if (selection) {
      const range = document.createRange()
      range.selectNodeContents(materialEl)
      selection.removeAllRanges()
      selection.addRange(range)
    }

    function commitEdit(): void {
      materialEl!.contentEditable = 'false'
      materialEl!.style.cursor = ''

      const newContent = materialEl!.textContent ?? ''
      if (newContent !== oldContent) {
        const engine = context.getEngine()
        const cmd = createUpdatePropsCommand(
          {
            materialId: material.id,
            oldProps: { content: oldContent },
            newProps: { content: newContent },
          },
          engine.operations,
        )
        context.executeCommand(cmd)
      }
    }

    function onBlur(): void {
      commitEdit()
      cleanup()
    }

    function onKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape') {
        // 取消编辑，恢复原始内容
        materialEl!.textContent = oldContent
        materialEl!.contentEditable = 'false'
        materialEl!.style.cursor = ''
        cleanup()
      }
    }

    function cleanup(): void {
      materialEl!.removeEventListener('blur', onBlur)
      materialEl!.removeEventListener('keydown', onKeyDown)
    }

    materialEl.addEventListener('blur', onBlur)
    materialEl.addEventListener('keydown', onKeyDown)
  },

  onExitEditing(material) {
    const materialEl = document.querySelector(
      `[data-material-id="${material.id}"]`,
    ) as HTMLElement | null

    if (materialEl) {
      materialEl.contentEditable = 'false'
      materialEl.style.cursor = ''
      materialEl.blur()
    }
  },
}
