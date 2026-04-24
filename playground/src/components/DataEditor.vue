<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = defineProps<{
  initialData: Record<string, unknown>
}>()

const emit = defineEmits<{
  update: [data: Record<string, unknown>]
  close: []
}>()

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

interface VisibleFieldTreeNode {
  node: FieldTreeNode
  depth: number
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

const visibleFieldTree = computed(() => flattenVisibleNodes(fieldTree.value, 0))

function flattenVisibleNodes(nodes: FieldTreeNode[], depth: number): VisibleFieldTreeNode[] {
  const visibleNodes: VisibleFieldTreeNode[] = []

  for (const node of nodes) {
    visibleNodes.push({ node, depth })
    if (node.expanded && node.children?.length) {
      visibleNodes.push(...flattenVisibleNodes(node.children, depth + 1))
    }
  }

  return visibleNodes
}
</script>

<template>
  <div class="fixed inset-0 z-[10000] flex items-center justify-center bg-bg-overlay" @click="handleOverlayClick">
    <div class="w-[860px] max-w-[90vw] h-[600px] max-h-[80vh] flex flex-col bg-white rounded-lg shadow-modal">
      <div class="flex items-center justify-between px-5 py-3 border-b border-border-light">
        <h2 class="m-0 text-base font-semibold text-text-primary">
          数据编辑器
        </h2>
        <div class="flex items-center gap-2">
          <button class="px-3.5 py-1.5 text-[13px] border border-border-dark rounded bg-white cursor-pointer text-text-secondary hover:bg-bg-tertiary" @click="handleFormat">
            格式化
          </button>
          <button class="px-3.5 py-1.5 text-[13px] border border-primary rounded bg-primary cursor-pointer text-white hover:bg-primary-hover disabled:bg-[#d9d9d9] disabled:border-[#d9d9d9] disabled:cursor-not-allowed" :disabled="hasError" @click="handleApply">
            应用
          </button>
          <button class="w-7 h-7 flex items-center justify-center border-none bg-transparent text-xl text-text-quaternary cursor-pointer rounded hover:bg-border-light hover:text-text-secondary" @click="emit('close')">
            &times;
          </button>
        </div>
      </div>

      <div class="flex-1 flex min-h-0">
        <div class="flex-1 flex flex-col border-r border-border-light relative">
          <div class="px-3 py-2 text-xs font-semibold text-text-quaternary border-b border-border-light">
            JSON 数据
          </div>
          <textarea
            v-model="jsonText"
            class="flex-1 m-0 px-3 py-3 border-none outline-none resize-none font-mono text-[13px] leading-relaxed text-text-primary bg-bg-quaternary"
            style="tab-size: 2;"
            spellcheck="false"
            autocomplete="off"
          />
          <div v-if="parseError" class="px-3 py-1.5 text-xs text-danger bg-danger-bg border-t border-danger-border">
            {{ parseError }}
          </div>
        </div>

        <div class="w-[280px] flex flex-col">
          <div class="px-3 py-2 text-xs font-semibold text-text-quaternary border-b border-border-light">
            字段树预览
          </div>
          <div class="flex-1 overflow-y-auto py-1">
            <div v-if="visibleFieldTree.length > 0">
              <div
                v-for="entry in visibleFieldTree"
                :key="entry.node.path"
                class="flex items-center gap-1 px-2 py-0.5 cursor-default text-xs leading-snug hover:bg-bg-tertiary"
                :style="{ paddingLeft: `${entry.depth * 16 + 8}px` }"
                @click="entry.node.children?.length && toggleNode(entry.node)"
              >
                <span class="w-3 text-[9px] text-[#ccc] text-center flex-shrink-0">{{ entry.node.children?.length ? (entry.node.expanded ? '▼' : '▶') : '·' }}</span>
                <span class="text-text-primary font-medium">{{ entry.node.name }}</span>
                <span class="text-text-quaternary text-[11px] ml-auto">{{ entry.node.type }}</span>
              </div>
            </div>
            <div v-else class="px-3 py-5 text-xs text-text-disabled text-center">
              输入有效 JSON 后显示字段树
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
