<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { jsonToDataSource } from '../utils/json-to-datasource'

const props = defineProps<{
  initialData: Record<string, unknown>
}>()

const emit = defineEmits<{
  update: [data: Record<string, unknown>]
  close: []
}>()

const editorRef = ref<HTMLTextAreaElement>()
const jsonText = ref('')
const parseError = ref('')
const fieldTree = ref<FieldTreeNode[]>([])

interface FieldTreeNode {
  name: string
  path: string
  type: string
  children?: FieldTreeNode[]
  expanded?: boolean
}

onMounted(() => {
  const initial = Object.keys(props.initialData).length > 0
    ? props.initialData
    : {
        name: '张三',
        title: '高级工程师',
        department: '技术部',
        date: '2026-04-16',
        certNo: 'CERT-2026-001',
      }
  jsonText.value = JSON.stringify(initial, null, 2)
  parseAndUpdate()
})

let debounceTimer: ReturnType<typeof setTimeout> | undefined

watch(jsonText, () => {
  if (debounceTimer)
    clearTimeout(debounceTimer)
  debounceTimer = setTimeout(parseAndUpdate, 300)
})

onBeforeUnmount(() => {
  if (debounceTimer)
    clearTimeout(debounceTimer)
})

function parseAndUpdate() {
  try {
    const parsed = JSON.parse(jsonText.value)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      parseError.value = '根数据必须是 JSON 对象'
      return
    }
    parseError.value = ''
    fieldTree.value = buildTreeView(parsed, '')
  }
  catch (e) {
    parseError.value = e instanceof Error ? e.message : String(e)
  }
}

function buildTreeView(obj: unknown, parentPath: string): FieldTreeNode[] {
  if (obj == null || typeof obj !== 'object')
    return []

  const nodes: FieldTreeNode[] = []

  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const path = parentPath ? `${parentPath}/${key}` : key

    if (value != null && typeof value === 'object') {
      if (Array.isArray(value)) {
        const childNodes = value.length > 0 && value[0] != null && typeof value[0] === 'object'
          ? buildTreeView(value[0], path)
          : []
        nodes.push({ name: key, path, type: `array[${value.length}]`, children: childNodes, expanded: true })
      }
      else {
        nodes.push({ name: key, path, type: 'object', children: buildTreeView(value, path), expanded: true })
      }
    }
    else {
      const type = value === null ? 'null' : typeof value
      nodes.push({ name: key, path, type, children: undefined })
    }
  }

  return nodes
}

function handleApply() {
  try {
    const parsed = JSON.parse(jsonText.value)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      parseError.value = '根数据必须是 JSON 对象'
      return
    }
    emit('update', parsed)
    emit('close')
  }
  catch (e) {
    parseError.value = e instanceof Error ? e.message : String(e)
  }
}

function handleFormat() {
  try {
    const parsed = JSON.parse(jsonText.value)
    jsonText.value = JSON.stringify(parsed, null, 2)
    parseError.value = ''
  }
  catch (e) {
    parseError.value = e instanceof Error ? e.message : String(e)
  }
}

function handleOverlayClick(event: Event) {
  if (event.target === event.currentTarget) {
    emit('close')
  }
}

function toggleNode(node: FieldTreeNode) {
  node.expanded = !node.expanded
}

const hasError = computed(() => parseError.value !== '')
</script>

<template>
  <div class="de-overlay" @click="handleOverlayClick">
    <div class="de-modal">
      <div class="de-header">
        <h2 class="de-title">数据编辑器</h2>
        <div class="de-header-actions">
          <button class="de-btn" @click="handleFormat">
            格式化
          </button>
          <button class="de-btn de-btn--primary" :disabled="hasError" @click="handleApply">
            应用
          </button>
          <button class="de-close" @click="emit('close')">
            &times;
          </button>
        </div>
      </div>

      <div class="de-body">
        <div class="de-editor-pane">
          <div class="de-pane-title">JSON 数据</div>
          <textarea
            ref="editorRef"
            v-model="jsonText"
            class="de-textarea"
            spellcheck="false"
            autocomplete="off"
          />
          <div v-if="parseError" class="de-error">
            {{ parseError }}
          </div>
        </div>

        <div class="de-tree-pane">
          <div class="de-pane-title">字段树预览</div>
          <div class="de-tree">
            <template v-if="fieldTree.length > 0">
              <FieldTreeNodeView
                v-for="node in fieldTree"
                :key="node.path"
                :node="node"
                :depth="0"
                @toggle="toggleNode"
              />
            </template>
            <div v-else class="de-tree-empty">
              输入有效 JSON 后显示字段树
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, h } from 'vue'

const FieldTreeNodeView = defineComponent({
  name: 'FieldTreeNodeView',
  props: {
    node: { type: Object, required: true },
    depth: { type: Number, default: 0 },
  },
  emits: ['toggle'],
  setup(props, { emit }) {
    return () => {
      const node = props.node as FieldTreeNode
      const hasChildren = node.children && node.children.length > 0
      const indent = `${props.depth * 16 + 8}px`

      const elements = []

      elements.push(
        h('div', {
          class: 'de-tree-node',
          style: { paddingLeft: indent },
          onClick: () => hasChildren && emit('toggle', node),
        }, [
          h('span', { class: 'de-tree-arrow' }, hasChildren ? (node.expanded ? '\u25BC' : '\u25B6') : '\u00B7'),
          h('span', { class: 'de-tree-name' }, node.name),
          h('span', { class: 'de-tree-type' }, node.type),
        ]),
      )

      if (hasChildren && node.expanded) {
        for (const child of node.children!) {
          elements.push(
            h(FieldTreeNodeView, {
              key: child.path,
              node: child,
              depth: props.depth + 1,
              onToggle: (n: FieldTreeNode) => emit('toggle', n),
            }),
          )
        }
      }

      return h('div', null, elements)
    }
  },
})

export default {
  components: { FieldTreeNodeView },
}
</script>

<style scoped>
.de-overlay {
  position: fixed;
  inset: 0;
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.45);
}

.de-modal {
  width: 860px;
  max-width: 90vw;
  height: 600px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
}

.de-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  border-bottom: 1px solid #eee;
}

.de-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: #1a1a1a;
}

.de-header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.de-close {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: none;
  font-size: 20px;
  color: #999;
  cursor: pointer;
  border-radius: 4px;
}

.de-close:hover {
  background: #f0f0f0;
  color: #333;
}

.de-btn {
  padding: 5px 14px;
  font-size: 13px;
  border: 1px solid #d0d0d0;
  border-radius: 4px;
  background: #fff;
  cursor: pointer;
  color: #333;
}

.de-btn:hover {
  background: #f5f5f5;
}

.de-btn--primary {
  background: #1677ff;
  border-color: #1677ff;
  color: #fff;
}

.de-btn--primary:hover {
  background: #4096ff;
}

.de-btn--primary:disabled {
  background: #d9d9d9;
  border-color: #d9d9d9;
  cursor: not-allowed;
}

.de-body {
  flex: 1;
  display: flex;
  min-height: 0;
}

.de-editor-pane {
  flex: 1;
  display: flex;
  flex-direction: column;
  border-right: 1px solid #eee;
  position: relative;
}

.de-tree-pane {
  width: 280px;
  display: flex;
  flex-direction: column;
}

.de-pane-title {
  padding: 8px 12px;
  font-size: 12px;
  font-weight: 600;
  color: #999;
  border-bottom: 1px solid #f0f0f0;
}

.de-textarea {
  flex: 1;
  margin: 0;
  padding: 12px;
  border: none;
  outline: none;
  resize: none;
  font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
  font-size: 13px;
  line-height: 1.5;
  color: #1a1a1a;
  background: #fafafa;
  tab-size: 2;
}

.de-error {
  padding: 6px 12px;
  font-size: 12px;
  color: #ff4d4f;
  background: #fff2f0;
  border-top: 1px solid #ffccc7;
}

.de-tree {
  flex: 1;
  overflow-y: auto;
  padding: 4px 0;
}

.de-tree-empty {
  padding: 20px 12px;
  font-size: 12px;
  color: #bbb;
  text-align: center;
}

:deep(.de-tree-node) {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  cursor: default;
  font-size: 12px;
  line-height: 1.4;
}

:deep(.de-tree-node:hover) {
  background: #f5f5f5;
}

:deep(.de-tree-arrow) {
  width: 12px;
  font-size: 9px;
  color: #ccc;
  text-align: center;
  flex-shrink: 0;
}

:deep(.de-tree-name) {
  color: #1a1a1a;
  font-weight: 500;
}

:deep(.de-tree-type) {
  color: #999;
  font-size: 11px;
  margin-left: auto;
}
</style>
