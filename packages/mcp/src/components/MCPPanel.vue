<script setup lang="ts">
import type { DataSourceDescriptor } from '@easyink/datasource'
import type { DocumentSchema } from '@easyink/schema'
import type { MCPServerConfig, SessionMessage } from '../types/mcp-types'
import { MCP_NAMESPACE } from '@easyink/datasource'
import { generateId } from '@easyink/shared'
import { computed, onMounted, ref } from 'vue'
import { MCPClient } from '../client/mcp-client'
import { ServerRegistry, validateServerConfig } from '../config/server-registry'
import { DataSourceAligner } from '../utils/datasource-aligner'
import { SchemaValidator } from '../validation/schema-validator'

// Props
const props = defineProps<{
  /** Whether the panel is open */
  open: boolean
  /** Current schema to use as context */
  currentSchema?: DocumentSchema
  /** Known material types for validation */
  knownMaterialTypes?: Set<string>
}>()

// Emits
const emit = defineEmits<{
  'update:open': [open: boolean]
  'schemaApply': [schema: DocumentSchema, versionId: string]
  'datasourceRegister': [dataSource: DataSourceDescriptor, namespace: string]
  'error': [error: { message: string, canRetry: boolean }]
  'historyUpdate': [messages: SessionMessage[]]
}>()

// MCP Client and Registry
const mcpClient = new MCPClient()
const serverRegistry = new ServerRegistry()

// UI State
const prompt = ref('')
const isGenerating = ref(false)
const error = ref<string | null>(null)
const canRetry = ref(false)
const sessionMessages = ref<SessionMessage[]>([])
const showServerConfig = ref(false)
const selectedServerId = ref<string | null>(null)

// Server Config Form
const serverForm = ref<Partial<MCPServerConfig>>({
  type: 'http',
  enabled: true,
})
const serverFormErrors = ref<string[]>([])

// Computed
const servers = computed(() => serverRegistry.getServers())
const enabledServers = computed(() => servers.value.filter(s => s.enabled))
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
    // 1. Add user message
    const userMsg: SessionMessage = {
      id: generateId('msg'),
      role: 'user',
      content: prompt.value,
      timestamp: Date.now(),
      schemaSnapshot: props.currentSchema,
    }
    sessionMessages.value.push(userMsg)

    // 2. Generate using MCP
    const result = await mcpClient.generate({
      serverId: selectedServerId.value!,
      prompt: prompt.value,
      currentSchema: props.currentSchema,
      context: {
        sessionHistory: sessionMessages.value,
      },
    })

    // 3. Validate
    const validator = new SchemaValidator({
      strictMode: true,
      allowedMaterialTypes: props.knownMaterialTypes,
    })
    const validation = validator.validate(result.schema)

    if (!validation.valid) {
      const errors = validation.errors.map(e => e.message).join(', ')
      throw new Error(`Schema validation failed: ${errors}`)
    }

    // 4. Auto-fix if needed
    let finalSchema = result.schema
    if (validation.autoFixed.length > 0) {
      const { fixed } = validator.autoFix(result.schema)
      finalSchema = fixed
    }

    // 5. Align schema and datasource
    const aligner = new DataSourceAligner()
    const alignment = aligner.align(finalSchema, result.dataSource)

    // Show alignment warnings
    if (alignment.warnings.length > 0) {
      console.warn('Alignment warnings:', alignment.warnings)
    }

    // 6. Register datasource with MCP namespace
    emit('datasourceRegister', alignment.dataSource, MCP_NAMESPACE)

    // 7. Save as new template version
    const versionId = generateId('ver')
    emit('schemaApply', alignment.schema, versionId)

    // 8. Add success message
    const assistantMsg: SessionMessage = {
      id: generateId('msg'),
      role: 'assistant',
      content: 'Schema and DataSource generated successfully',
      timestamp: Date.now(),
      toolsUsed: result.toolsUsed,
      schemaSnapshot: alignment.schema,
    }
    sessionMessages.value.push(assistantMsg)

    // 9. Notify history update
    emit('historyUpdate', sessionMessages.value)

    // 10. Clear prompt on success
    prompt.value = ''
  }
  catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    error.value = message
    canRetry.value = true

    // Add error message
    const errorMsg: SessionMessage = {
      id: generateId('msg'),
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      error: message,
    }
    sessionMessages.value.push(errorMsg)

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

function handleClearHistory() {
  if (selectedServerId.value) {
    mcpClient.clearSession(selectedServerId.value)
  }
  sessionMessages.value = []
}

function handleSelectServer(id: string) {
  selectedServerId.value = id
}

function handleAddServer() {
  serverForm.value = {
    type: 'http',
    enabled: true,
    id: generateId('server'),
  }
  serverFormErrors.value = []
  showServerConfig.value = true
}

function handleEditServer(id: string) {
  const server = serverRegistry.getServer(id)
  if (server) {
    serverForm.value = { ...server }
    serverFormErrors.value = []
    showServerConfig.value = true
  }
}

function handleDeleteServer(id: string) {
  serverRegistry.removeServer(id)
  if (selectedServerId.value === id) {
    selectedServerId.value = null
  }
}

function handleSaveServerConfig() {
  const errors = validateServerConfig(serverForm.value)
  if (errors.length > 0) {
    serverFormErrors.value = errors
    return
  }

  serverRegistry.addServer(serverForm.value as MCPServerConfig)
  showServerConfig.value = false
  selectedServerId.value = serverForm.value.id ?? null
}

function handleCancelServerConfig() {
  showServerConfig.value = false
  serverFormErrors.value = []
}

// Auto-select first enabled server
onMounted(() => {
  if (enabledServers.value.length > 0 && !selectedServerId.value) {
    selectedServerId.value = enabledServers.value[0]!.id
  }
})
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
          <button
            class="mcp-panel__server-action"
            @click.stop="handleEditServer(server.id)"
          >
            编辑
          </button>
          <button
            class="mcp-panel__server-action mcp-panel__server-action--danger"
            @click.stop="handleDeleteServer(server.id)"
          >
            删除
          </button>
        </div>
        <button
          class="mcp-panel__add-server"
          @click="handleAddServer"
        >
          + 添加服务器
        </button>
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

    <!-- Session History -->
    <div class="mcp-panel__history">
      <div class="mcp-panel__history-header">
        <label class="mcp-panel__label">会话历史</label>
        <button
          class="mcp-panel__clear"
          @click="handleClearHistory"
        >
          清空
        </button>
      </div>
      <div class="mcp-panel__history-list">
        <div
          v-for="msg in sessionMessages"
          :key="msg.id"
          class="mcp-panel__message"
          :class="`mcp-panel__message--${msg.role}`"
        >
          <div class="mcp-panel__message-header">
            <span class="mcp-panel__message-role">
              {{ msg.role === 'user' ? '你' : 'AI' }}
            </span>
            <span
              v-if="msg.error"
              class="mcp-panel__message-error"
            >
              错误
            </span>
          </div>
          <div
            v-if="msg.content"
            class="mcp-panel__message-content"
          >
            {{ msg.content }}
          </div>
          <div
            v-if="msg.error"
            class="mcp-panel__message-error-detail"
          >
            {{ msg.error }}
          </div>
          <div
            v-if="msg.toolsUsed?.length"
            class="mcp-panel__message-tools"
          >
            <span
              v-for="tool in msg.toolsUsed"
              :key="tool"
              class="mcp-panel__message-tool"
            >
              {{ tool }}
            </span>
          </div>
        </div>
        <div
          v-if="sessionMessages.length === 0"
          class="mcp-panel__history-empty"
        >
          暂无会话记录
        </div>
      </div>
    </div>

    <!-- Server Config Modal -->
    <div
      v-if="showServerConfig"
      class="mcp-panel__modal"
    >
      <div class="mcp-panel__modal-content">
        <h4 class="mcp-panel__modal-title">
          服务器配置
        </h4>

        <div class="mcp-panel__form">
          <div class="mcp-panel__form-group">
            <label>服务器名称</label>
            <input
              v-model="serverForm.name"
              type="text"
              placeholder="例如：我的 AI 服务"
            >
          </div>

          <div class="mcp-panel__form-group">
            <label>连接类型</label>
            <select v-model="serverForm.type">
              <option value="http">
                HTTP
              </option>
              <option value="stdio">
                Stdio (本地进程)
              </option>
            </select>
          </div>

          <div
            v-if="serverForm.type === 'http'"
            class="mcp-panel__form-group"
          >
            <label>服务地址</label>
            <input
              v-model="serverForm.url"
              type="url"
              placeholder="http://localhost:3001/mcp"
            >
          </div>

          <div
            v-if="serverForm.type === 'stdio'"
            class="mcp-panel__form-group"
          >
            <label>启动命令</label>
            <input
              v-model="serverForm.command"
              type="text"
              placeholder="npx"
            >
          </div>

          <div class="mcp-panel__form-group">
            <label>
              <input
                v-model="serverForm.enabled"
                type="checkbox"
              >
              启用此服务器
            </label>
          </div>

          <div
            v-if="serverFormErrors.length > 0"
            class="mcp-panel__form-errors"
          >
            <p
              v-for="err in serverFormErrors"
              :key="err"
            >
              {{ err }}
            </p>
          </div>
        </div>

        <div class="mcp-panel__modal-actions">
          <button
            class="mcp-panel__btn mcp-panel__btn--secondary"
            @click="handleCancelServerConfig"
          >
            取消
          </button>
          <button
            class="mcp-panel__btn mcp-panel__btn--primary"
            @click="handleSaveServerConfig"
          >
            保存
          </button>
        </div>
      </div>
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

.mcp-panel__server-action {
  background: none;
  border: none;
  font-size: 12px;
  color: var(--ei-text-secondary, #6b7280);
  cursor: pointer;
  padding: 4px 8px;
  margin-left: 4px;
}

.mcp-panel__server-action:hover {
  color: var(--ei-primary, #4f46e5);
}

.mcp-panel__server-action--danger:hover {
  color: #dc2626;
}

.mcp-panel__add-server {
  background: none;
  border: 1px dashed var(--ei-border, #d1d5db);
  border-radius: 6px;
  padding: 8px 12px;
  font-size: 14px;
  color: var(--ei-text-secondary, #6b7280);
  cursor: pointer;
  transition: all 0.15s;
}

.mcp-panel__add-server:hover {
  border-color: var(--ei-primary, #4f46e5);
  color: var(--ei-primary, #4f46e5);
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

.mcp-panel__history {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 16px;
  overflow: hidden;
}

.mcp-panel__history-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.mcp-panel__clear {
  background: none;
  border: none;
  font-size: 12px;
  color: var(--ei-text-secondary, #6b7280);
  cursor: pointer;
}

.mcp-panel__clear:hover {
  color: var(--ei-primary, #4f46e5);
}

.mcp-panel__history-list {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.mcp-panel__message {
  padding: 12px;
  border-radius: 8px;
  font-size: 13px;
}

.mcp-panel__message--user {
  background: var(--ei-primary-light, #e0e7ff);
  margin-left: 16px;
}

.mcp-panel__message--assistant {
  background: var(--ei-bg-secondary, #f9fafb);
  margin-right: 16px;
}

.mcp-panel__message-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.mcp-panel__message-role {
  font-weight: 600;
  font-size: 12px;
  color: var(--ei-text-secondary, #6b7280);
}

.mcp-panel__message-error {
  font-size: 10px;
  padding: 2px 6px;
  background: #fef2f2;
  border-radius: 4px;
  color: #dc2626;
}

.mcp-panel__message-content {
  color: var(--ei-text, #111827);
  line-height: 1.5;
}

.mcp-panel__message-error-detail {
  color: #dc2626;
  font-size: 12px;
  margin-top: 4px;
}

.mcp-panel__message-tools {
  display: flex;
  gap: 4px;
  margin-top: 8px;
  flex-wrap: wrap;
}

.mcp-panel__message-tool {
  font-size: 10px;
  padding: 2px 6px;
  background: var(--ei-bg, #fff);
  border-radius: 4px;
  color: var(--ei-text-secondary, #6b7280);
}

.mcp-panel__history-empty {
  text-align: center;
  padding: 32px;
  color: var(--ei-text-quaternary, #9ca3af);
  font-size: 14px;
}

.mcp-panel__modal {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1001;
}

.mcp-panel__modal-content {
  background: var(--ei-bg, #fff);
  border-radius: 12px;
  padding: 24px;
  width: 400px;
  max-width: 90vw;
  max-height: 90vh;
  overflow-y: auto;
}

.mcp-panel__modal-title {
  margin: 0 0 20px 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--ei-text, #111827);
}

.mcp-panel__form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.mcp-panel__form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.mcp-panel__form-group label {
  font-size: 13px;
  font-weight: 500;
  color: var(--ei-text, #111827);
}

.mcp-panel__form-group input,
.mcp-panel__form-group select {
  padding: 8px 12px;
  border: 1px solid var(--ei-border, #d1d5db);
  border-radius: 6px;
  font-size: 14px;
  background: var(--ei-bg, #fff);
  color: var(--ei-text, #111827);
}

.mcp-panel__form-group input:focus,
.mcp-panel__form-group select:focus {
  outline: none;
  border-color: var(--ei-primary, #4f46e5);
  box-shadow: 0 0 0 3px var(--ei-primary-light, rgba(79, 70, 229, 0.1));
}

.mcp-panel__form-group input[type="checkbox"] {
  width: auto;
  margin-right: 8px;
}

.mcp-panel__form-errors {
  padding: 12px;
  background: #fef2f2;
  border-radius: 6px;
}

.mcp-panel__form-errors p {
  margin: 0;
  font-size: 13px;
  color: #dc2626;
}

.mcp-panel__form-errors p + p {
  margin-top: 4px;
}

.mcp-panel__modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 24px;
}

.mcp-panel__btn {
  padding: 8px 16px;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
}

.mcp-panel__btn--secondary {
  background: var(--ei-bg-secondary, #f9fafb);
  border: 1px solid var(--ei-border, #d1d5db);
  color: var(--ei-text, #111827);
}

.mcp-panel__btn--secondary:hover {
  background: var(--ei-bg-hover, #f3f4f6);
}

.mcp-panel__btn--primary {
  background: var(--ei-primary, #4f46e5);
  border: 1px solid var(--ei-primary, #4f46e5);
  color: white;
}

.mcp-panel__btn--primary:hover {
  background: var(--ei-primary-hover, #4338ca);
}
</style>
