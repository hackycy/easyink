import type { DataFieldNode } from '@easyink/core'
import type { DesignerContext } from '../types'
import { defineComponent, h, inject, reactive } from 'vue'
import { DESIGNER_INJECTION_KEY } from '../types'

export const DataSourcePanel = defineComponent({
  name: 'DataSourcePanel',
  setup() {
    const ctx = inject(DESIGNER_INJECTION_KEY) as DesignerContext
    const expandedNodes = reactive(new Set<string>())

    function toggleExpand(path: string): void {
      if (expandedNodes.has(path)) {
        expandedNodes.delete(path)
      }
      else {
        expandedNodes.add(path)
      }
    }

    function onLeafDragStart(node: DataFieldNode, e: DragEvent): void {
      const path = node.fullPath ?? node.key ?? ''
      e.dataTransfer?.setData('application/easyink-binding', JSON.stringify({ path }))
      e.dataTransfer!.effectAllowed = 'link'
    }

    function renderNode(node: DataFieldNode, parentPath: string, depth: number): ReturnType<typeof h> {
      const nodePath = parentPath ? `${parentPath}.${node.key ?? node.title}` : (node.key ?? node.title)
      const hasChildren = node.children && node.children.length > 0
      const isExpanded = expandedNodes.has(nodePath)

      if (hasChildren) {
        return h('div', { class: 'easyink-datasource-node', key: nodePath }, [
          h('div', {
            class: 'easyink-datasource-node__header',
            onClick: () => toggleExpand(nodePath),
            style: { paddingLeft: `${depth * 16}px` },
          }, [
            h('span', { class: 'easyink-datasource-node__chevron' }, isExpanded ? '▼' : '▶'),
            h('span', { class: 'easyink-datasource-node__title' }, node.title),
          ]),
          isExpanded
            ? h(
                'div',
                { class: 'easyink-datasource-node__children' },
                node.children!.map(child => renderNode(child, nodePath, depth + 1)),
              )
            : null,
        ])
      }

      // Leaf node
      return h('div', {
        class: 'easyink-datasource-leaf',
        draggable: true,
        key: nodePath,
        onDragstart: (e: DragEvent) => onLeafDragStart(node, e),
        style: { paddingLeft: `${depth * 16}px` },
      }, [
        h('span', { class: 'easyink-datasource-leaf__key' }, node.key ?? ''),
        h('span', { class: 'easyink-datasource-leaf__title' }, node.title),
      ])
    }

    return () => {
      const fieldTree = ctx.engine.dataSource.getFieldTree()
      const t = ctx.locale.t

      if (fieldTree.length === 0) {
        return h('div', { class: 'easyink-datasource-panel' }, [
          h('div', { class: 'easyink-datasource-panel__empty' }, t('dataSource.empty')),
        ])
      }

      return h('div', { class: 'easyink-datasource-panel' }, [
        h('div', { class: 'easyink-datasource-panel__hint' }, t('dataSource.dragHint')),
        ...fieldTree.map(source =>
          h('div', { class: 'easyink-datasource-group', key: source.name }, [
            h('div', {
              class: 'easyink-datasource-group__header',
              onClick: () => toggleExpand(source.name),
            }, [
              h(
                'span',
                { class: 'easyink-datasource-node__chevron' },
                expandedNodes.has(source.name) ? '▼' : '▶',
              ),
              h('span', { class: 'easyink-datasource-group__name' }, source.displayName),
            ]),
            expandedNodes.has(source.name)
              ? h(
                  'div',
                  { class: 'easyink-datasource-group__fields' },
                  source.fields.map(field => renderNode(field, source.name, 1)),
                )
              : null,
          ]),
        ),
      ])
    }
  },
})
