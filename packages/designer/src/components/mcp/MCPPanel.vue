<script setup lang="ts">
import type { DataSourceDescriptor } from '@easyink/datasource'
import type { DocumentSchema } from '@easyink/schema'
import { MCP_NAMESPACE } from '@easyink/datasource'
import { generateId } from '@easyink/shared'
import { computed, ref } from 'vue'

// Props
const props = defineProps<{
  /** Whether the panel is open */
  open: boolean
  /** Current schema to use as context */
  currentSchema?: DocumentSchema
}>()

// Emits
const emit = defineEmits<{
  'update:open': [open: boolean]
  'schemaApply': [schema: DocumentSchema, versionId: string]
  'datasourceRegister': [dataSource: DataSourceDescriptor, namespace: string]
  'error': [error: { message: string, canRetry: boolean }]
}>()

// UI State
const prompt = ref('')
const isGenerating = ref(false)
const error = ref<string | null>(null)
const canRetry = ref(false)

// Mock server list (in production, this would come from MCP ServerRegistry)
const servers = ref<Array<{ id: string, name: string, enabled: boolean }>>([
  { id: 'mock-server', name: 'Mock AI Server', enabled: true },
])
const selectedServerId = ref<string | null>('mock-server')

// Computed
const canGenerate = computed(() =>
  prompt.value.trim().length > 0
  && selectedServerId.value !== null
  && !isGenerating.value,
)

// Methods
function handleClose() {
  emit('update:open', false)
}

function handlePromptKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
    e.preventDefault()
    handleGenerate()
  }
}

async function handleGenerate() {
  if (!canGenerate.value)
    return

  isGenerating.value = true
  error.value = null
  canRetry.value = false

  try {
    // Simulate generation (in production, this would call MCPClient)
    await new Promise(resolve => setTimeout(resolve, 1000))

    // Generate mock schema
    const mockSchema: DocumentSchema = props.currentSchema
      ? JSON.parse(JSON.stringify(props.currentSchema))
      : {
          version: '1.0.0',
          unit: 'mm' as const,
          page: {
            mode: 'fixed' as const,
            width: 210,
            height: 297,
          },
          guides: { x: [], y: [] },
          elements: [],
        }

    // Generate mock data source
    const mockDataSource: DataSourceDescriptor = {
      id: generateId('ds'),
      name: 'MCP Generated Data',
      title: 'AI Generated Data Source',
      tag: 'mcp-generated',
      expand: true,
      fields: [
        {
          name: 'items',
          path: 'items',
          tag: 'collection',
          expand: true,
          fields: [
            { name: 'name', path: 'items/name', title: 'Item Name' },
            { name: 'quantity', path: 'items/quantity', title: 'Quantity' },
            { name: 'price', path: 'items/price', title: 'Price' },
          ],
        },
      ],
      meta: {
        namespace: MCP_NAMESPACE,
        generatedBy: 'mcp-client',
        prompt: prompt.value,
      },
    }

    // Register datasource
    emit('datasourceRegister', mockDataSource, MCP_NAMESPACE)

    // Apply schema
    const versionId = generateId('ver')
    emit('schemaApply', mockSchema, versionId)

    prompt.value = ''
  }
  catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    error.value = message
    canRetry.value = true
    emit('error', { message, canRetry: true })
  }
  finally {
    isGenerating.value = false
  }
}

function handleRetry() {
  error.value = null
  canRetry.value = false
  handleGenerate()
}

function handleSelectServer(id: string) {
  selectedServerId.value = id
}
</script>

<template>
  <div
    v-if="open"
    class="mcp-panel"
  >
    <!-- Header -->
    <div class="mcp-panel__header">
      <h3 class="mcp-panel__title">
        AI 模板生成
      </h3>
      <button
        class="mcp-panel__close"
        @click="handleClose"
      >
        ×
      </button>
    </div>

    <!-- Server Selection -->
    <div class="mcp-panel__servers">
      <label class="mcp-panel__label">选择服务器</label>
      <div class="mcp-panel__server-list">
        <div
          v-for="server in servers"
          :key="server.id"
          class="mcp-panel__server-item"
          :class="{ 'mcp-panel__server-item--selected': selectedServerId === server.id }"
          @click="handleSelectServer(server.id)"
        >
          <span class="mcp-panel__server-name">{{ server.name }}</span>
          <span
            v-if="!server.enabled"
            class="mcp-panel__server-badge"
          >已禁用</span>
        </div>
      </div>
    </div>

    <!-- Prompt Input -->
    <div class="mcp-panel__input">
      <label class="mcp-panel__label">描述你的模板</label>
      <textarea
        v-model="prompt"
        class="mcp-panel__textarea"
        placeholder="例如：生成一个销售发票模板，包含公司信息、商品明细和总金额..."
        rows="4"
        :disabled="isGenerating"
        @keydown="handlePromptKeydown"
      />
      <div class="mcp-panel__input-actions">
        <span class="mcp-panel__hint">Ctrl+Enter 快捷生成</span>
        <button
          class="mcp-panel__generate"
          :disabled="!canGenerate"
          @click="handleGenerate"
        >
          <span v-if="isGenerating">生成中...</span>
          <span v-else>生成模板</span>
        </button>
      </div>
    </div>

    <!-- Error Display -->
    <div
      v-if="error"
      class="mcp-panel__error"
    >
      <span class="mcp-panel__error-message">{{ error }}</span>
      <button
        v-if="canRetry"
        class="mcp-panel__retry"
        @click="handleRetry"
      >
        重试
      </button>
    </div>

    <!-- Info -->
    <div class="mcp-panel__info">
      <p class="mcp-panel__info-text">
        MCP 集成正在进行中。当前显示的是模拟数据，用于演示 UI 结构。
        完整 MCP 功能需要配置 MCP Server。
      </p>
    </div>
  </div>
</template>

<style scoped>
.mcp-panel {
  position: fixed;
  top: 0;
  right: 0;
  width: 400px;
  height: 100vh;
  background: var(--ei-bg, #fff);
  border-left: 1px solid var(--ei-border, #e5e7eb);
  display: flex;
  flex-direction: column;
  z-index: 1000;
  box-shadow: -4px 0 16px rgba(0, 0, 0, 0.1);
}

.mcp-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  border-bottom: 1px solid var(--ei-border, #e5e7eb);
}

.mcp-panel__title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--ei-text, #111827);
}

.mcp-panel__close {
  background: none;
  border: none;
  font-size: 24px;
  cursor: pointer;
  color: var(--ei-text-secondary, #6b7280);
  padding: 0;
  line-height: 1;
}

.mcp-panel__servers {
  padding: 16px;
  border-bottom: 1px solid var(--ei-border, #e5e7eb);
}

.mcp-panel__label {
  display: block;
  font-size: 12px;
  font-weight: 500;
  color: var(--ei-text-secondary, #6b7280);
  margin-bottom: 8px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.mcp-panel__server-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.mcp-panel__server-item {
  display: flex;
  align-items: center;
  padding: 8px 12px;
  background: var(--ei-bg-secondary, #f9fafb);
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.15s;
}

.mcp-panel__server-item:hover {
  background: var(--ei-bg-hover, #f3f4f6);
}

.mcp-panel__server-item--selected {
  background: var(--ei-primary-light, #e0e7ff);
  border: 1px solid var(--ei-primary, #4f46e5);
}

.mcp-panel__server-name {
  flex: 1;
  font-size: 14px;
}

.mcp-panel__server-badge {
  font-size: 10px;
  padding: 2px 6px;
  background: var(--ei-bg-tertiary, #e5e7eb);
  border-radius: 4px;
  color: var(--ei-text-secondary, #6b7280);
}

.mcp-panel__input {
  padding: 16px;
  border-bottom: 1px solid var(--ei-border, #e5e7eb);
}

.mcp-panel__textarea {
  width: 100%;
  padding: 12px;
  border: 1px solid var(--ei-border, #d1d5db);
  border-radius: 6px;
  font-size: 14px;
  font-family: inherit;
  resize: vertical;
  min-height: 100px;
  background: var(--ei-bg, #fff);
  color: var(--ei-text, #111827);
}

.mcp-panel__textarea:focus {
  outline: none;
  border-color: var(--ei-primary, #4f46e5);
  box-shadow: 0 0 0 3px var(--ei-primary-light, rgba(79, 70, 229, 0.1));
}

.mcp-panel__textarea:disabled {
  background: var(--ei-bg-secondary, #f9fafb);
  cursor: not-allowed;
}

.mcp-panel__input-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 12px;
}

.mcp-panel__hint {
  font-size: 12px;
  color: var(--ei-text-quaternary, #9ca3af);
}

.mcp-panel__generate {
  padding: 8px 20px;
  background: var(--ei-primary, #4f46e5);
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s;
}

.mcp-panel__generate:hover:not(:disabled) {
  background: var(--ei-primary-hover, #4338ca);
}

.mcp-panel__generate:disabled {
  background: var(--ei-bg-tertiary, #e5e7eb);
  cursor: not-allowed;
}

.mcp-panel__error {
  margin: 16px;
  padding: 12px;
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.mcp-panel__error-message {
  font-size: 13px;
  color: #dc2626;
  flex: 1;
}

.mcp-panel__retry {
  padding: 6px 12px;
  background: white;
  border: 1px solid #fecaca;
  border-radius: 4px;
  font-size: 12px;
  color: #dc2626;
  cursor: pointer;
}

.mcp-panel__retry:hover {
  background: #fef2f2;
}

.mcp-panel__info {
  padding: 16px;
  flex: 1;
}

.mcp-panel__info-text {
  font-size: 13px;
  color: var(--ei-text-secondary, #6b7280);
  line-height: 1.6;
  margin: 0;
}
</style>
