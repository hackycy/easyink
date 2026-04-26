<script setup lang="ts">
import type { DesignerStore } from '@easyink/designer'
import type { AIGenerationPlan } from '@easyink/shared'
import type { MCPServerConfig, SessionMessage } from '../types'
import { AI_NAMESPACE } from '@easyink/datasource'
import { DataSourceAligner, SchemaValidator } from '@easyink/schema-tools'
import { generateId, inferAIGenerationPlan } from '@easyink/shared'
import { computed, onMounted, ref } from 'vue'
import { MCPClient } from '../mcp-client'
import { ServerRegistry, validateServerConfig } from '../server-registry'

const props = defineProps<{
  /** Designer store, injected automatically by EasyInkDesigner. */
  store: DesignerStore
  /** Whether the panel is open (controlled by toggle command). */
  open: boolean
  /** Known material types for validation. */
  knownMaterialTypes?: Set<string>
}>()

const emit = defineEmits<{
  'update:open': [open: boolean]
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
const lastGenerationPlan = ref<AIGenerationPlan | null>(null)
const selectedServerId = ref<string | null>(null)

/**
 * Live status while a generation is in flight. Shown as a single line in
 * the header of the panel; cleared when the request finishes (success,
 * failure, or cancellation).
 */
const progressMessage = ref<string>('')
const progressCount = ref(0)
const progressStartedAt = ref(0)
let progressTimer: ReturnType<typeof setInterval> | undefined
const elapsedSeconds = ref(0)

/** Active AbortController for the in-flight generation, if any. */
let activeAbort: AbortController | undefined

// Server Config Form
const serverForm = ref<Partial<MCPServerConfig>>({
  type: 'http',
  enabled: true,
})
const serverFormErrors = ref<string[]>([])

// Reactive snapshot of the registry. The registry itself stores plain arrays,
// so we re-read it explicitly via refreshServers() after every mutation.
const servers = ref<MCPServerConfig[]>(serverRegistry.getServers())
function refreshServers() {
  servers.value = serverRegistry.getServers()
}

// Per-server connection state, mirrored from MCPClient for UI reactivity.
const serverStates = ref<Record<string, 'disconnected' | 'connecting' | 'connected' | 'error'>>({})
const serverErrors = ref<Record<string, string | undefined>>({})

const enabledServers = computed(() => servers.value.filter(s => s.enabled))
const selectedServer = computed(() =>
  selectedServerId.value
    ? servers.value.find(s => s.id === selectedServerId.value) ?? null
    : null,
)
const canGenerate = computed(() =>
  prompt.value.trim().length > 0
  && selectedServer.value !== null
  && selectedServer.value.enabled
  && !isGenerating.value,
)

async function ensureConnected(serverId: string): Promise<void> {
  const status = mcpClient.getServerStatus(serverId)
  if (status?.state === 'connected')
    return

  const config = serverRegistry.getServer(serverId)
  if (!config)
    throw new Error(`服务器配置不存在: ${serverId}`)
  if (!config.enabled)
    throw new Error(`服务器已禁用: ${config.name}`)

  serverStates.value = { ...serverStates.value, [serverId]: 'connecting' }
  serverErrors.value = { ...serverErrors.value, [serverId]: undefined }
  try {
    await mcpClient.connect(config)
    serverStates.value = { ...serverStates.value, [serverId]: 'connected' }
  }
  catch (err) {
    const message = err instanceof Error ? err.message : 'Connection failed'
    serverStates.value = { ...serverStates.value, [serverId]: 'error' }
    serverErrors.value = { ...serverErrors.value, [serverId]: message }
    throw new Error(`连接 MCP 服务器失败 (${config.name}): ${message}`)
  }
}

async function handleToggleEnabled(server: MCPServerConfig, enabled: boolean) {
  serverRegistry.setEnabled(server.id, enabled)
  refreshServers()
  if (!enabled) {
    try {
      await mcpClient.disconnect(server.id)
    }
    catch {}
    serverStates.value = { ...serverStates.value, [server.id]: 'disconnected' }
  }
}

function handleClose() {
  emit('update:open', false)
}

function handlePromptKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
    e.preventDefault()
    handleGenerate()
  }
}

function formatDomain(domain: AIGenerationPlan['domain']): string {
  const labels: Record<AIGenerationPlan['domain'], string> = {
    'supermarket-receipt': '商超/便利店小票',
    'restaurant-receipt': '餐饮小票',
    'shipping-label': '快递/商品标签',
    'business-document': '发票/报价单/订单',
    'certificate': '证书/奖状',
    'generic': '通用文档',
  }
  return labels[domain]
}

function formatTableStrategy(strategy: AIGenerationPlan['tableStrategy']): string {
  const labels: Record<AIGenerationPlan['tableStrategy'], string> = {
    'table-data-for-arrays': '明细数组使用 table-data',
    'table-static-for-fixed': '固定网格使用 table-static',
    'avoid-table': '优先不用表格物料',
  }
  return labels[strategy]
}

async function handleGenerate() {
  if (!canGenerate.value)
    return

  const generationPlan = inferAIGenerationPlan(prompt.value)
  lastGenerationPlan.value = generationPlan
  await runGenerate(generationPlan)
}

async function runGenerate(generationPlan: AIGenerationPlan) {
  isGenerating.value = true
  error.value = null
  canRetry.value = false

  // Reset progress state and start the elapsed-time ticker.
  progressMessage.value = '准备中...'
  progressCount.value = 0
  progressStartedAt.value = Date.now()
  elapsedSeconds.value = 0
  progressTimer = setInterval(() => {
    elapsedSeconds.value = Math.floor((Date.now() - progressStartedAt.value) / 1000)
  }, 500)

  activeAbort = new AbortController()

  try {
    // 0. Ensure the selected server is connected (lazy connect).
    await ensureConnected(selectedServerId.value!)

    // 1. Add user message
    const userMsg: SessionMessage = {
      id: generateId('msg'),
      role: 'user',
      content: prompt.value,
      timestamp: Date.now(),
      schemaSnapshot: props.store.schema,
    }
    sessionMessages.value.push(userMsg)

    // 2. Generate using MCP
    const result = await mcpClient.generate({
      serverId: selectedServerId.value!,
      prompt: prompt.value,
      currentSchema: props.store.schema,
      generationPlan,
      context: {
        sessionHistory: sessionMessages.value,
      },
      signal: activeAbort.signal,
      onProgress: (p) => {
        progressCount.value = p.progress
        if (p.message)
          progressMessage.value = p.message
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

    if (alignment.warnings.length > 0) {
      console.warn('[ai] Alignment warnings:', alignment.warnings)
    }

    // 6. Register data source via store (Provider Factory pattern)
    props.store.dataSourceRegistry.registerProviderFactory({
      id: alignment.dataSource.id,
      namespace: AI_NAMESPACE,
      resolve: async () => alignment.dataSource,
    })

    // 7. Apply schema and persist AI metadata under `extensions.ai`
    const versionId = generateId('ver')
    props.store.setSchema(alignment.schema)

    const existing = (props.store.getExtension('ai') ?? {}) as {
      dataSources?: Array<{ id: string, name: string, tag?: string, fields: unknown, meta?: Record<string, unknown> }>
      providerFactories?: Array<{ id: string, namespace: string }>
      currentVersionId?: string
    }
    props.store.setExtension('ai', {
      ...existing,
      currentVersionId: versionId,
      dataSources: [
        ...(existing.dataSources ?? []),
        {
          id: alignment.dataSource.id,
          name: alignment.dataSource.name,
          tag: alignment.dataSource.tag,
          fields: alignment.dataSource.fields,
          meta: alignment.dataSource.meta,
        },
      ],
      providerFactories: [
        ...(existing.providerFactories ?? []),
        { id: alignment.dataSource.id, namespace: AI_NAMESPACE },
      ],
    })

    // 8. Add success message
    const assistantMsg: SessionMessage = {
      id: generateId('msg'),
      role: 'assistant',
      content: `模板已生成: ${generationPlan.domain}`,
      timestamp: Date.now(),
      toolsUsed: result.toolsUsed,
      schemaSnapshot: alignment.schema,
      assumptions: result.metadata?.assumptions as Record<string, unknown> | undefined,
    }
    sessionMessages.value.push(assistantMsg)

    // 9. Clear prompt on success
    prompt.value = ''
  }
  catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    error.value = message
    canRetry.value = true

    const errorMsg: SessionMessage = {
      id: generateId('msg'),
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      error: message,
    }
    sessionMessages.value.push(errorMsg)
  }
  finally {
    isGenerating.value = false
    if (progressTimer) {
      clearInterval(progressTimer)
      progressTimer = undefined
    }
    activeAbort = undefined
  }
}

function handleCancel() {
  activeAbort?.abort()
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
  refreshServers()
  mcpClient.disconnect(id).catch(() => {})
  serverStates.value = { ...serverStates.value, [id]: 'disconnected' }
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

  const id = serverForm.value.id!
  serverRegistry.addServer(serverForm.value as MCPServerConfig)
  // Config changed: drop any existing connection so next generate reconnects.
  mcpClient.disconnect(id).catch(() => {})
  serverStates.value = { ...serverStates.value, [id]: 'disconnected' }
  refreshServers()
  showServerConfig.value = false
  selectedServerId.value = id
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
          <input
            type="checkbox"
            class="mcp-panel__server-toggle"
            :checked="server.enabled"
            :title="server.enabled ? '点击禁用' : '点击启用'"
            @click.stop
            @change="(e) => handleToggleEnabled(server, (e.target as HTMLInputElement).checked)"
          >
          <span class="mcp-panel__server-name">{{ server.name }}</span>
          <span
            v-if="serverStates[server.id] === 'connecting'"
            class="mcp-panel__server-badge"
          >连接中</span>
          <span
            v-else-if="serverStates[server.id] === 'connected'"
            class="mcp-panel__server-badge mcp-panel__server-badge--ok"
          >已连接</span>
          <span
            v-else-if="serverStates[server.id] === 'error'"
            class="mcp-panel__server-badge mcp-panel__server-badge--err"
            :title="serverErrors[server.id]"
          >连接失败</span>
          <span
            v-else-if="!server.enabled"
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
          v-if="isGenerating"
          class="mcp-panel__generate mcp-panel__generate--cancel"
          @click="handleCancel"
        >
          取消
        </button>
        <button
          v-else
          class="mcp-panel__generate"
          :disabled="!canGenerate"
          @click="handleGenerate"
        >
          生成模板
        </button>
      </div>
    </div>

    <!-- Non-blocking Assumption Summary -->
    <div
      v-if="lastGenerationPlan"
      class="mcp-panel__assumption-inline"
    >
      <div class="mcp-panel__assumption-inline-row">
        <span>{{ formatDomain(lastGenerationPlan.domain) }}</span>
        <strong>{{ lastGenerationPlan.page.width }}mm x {{ lastGenerationPlan.page.height }}mm · {{ lastGenerationPlan.page.mode }}</strong>
      </div>
      <div class="mcp-panel__assumption-inline-row">
        <span>{{ formatTableStrategy(lastGenerationPlan.tableStrategy) }}</span>
        <strong>英文路径 + 中文标题</strong>
      </div>
    </div>

    <!-- Progress Display -->
    <div
      v-if="isGenerating"
      class="mcp-panel__progress"
    >
      <span class="mcp-panel__progress-spinner" />
      <span class="mcp-panel__progress-text">
        {{ progressMessage || '生成中...' }}
      </span>
      <span class="mcp-panel__progress-meta">
        {{ elapsedSeconds }}s · {{ progressCount }} 进度
      </span>
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

.mcp-panel__server-badge--ok {
  background: #dcfce7;
  color: #166534;
}

.mcp-panel__server-badge--err {
  background: #fee2e2;
  color: #991b1b;
}

.mcp-panel__server-toggle {
  margin-right: 8px;
  cursor: pointer;
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

.mcp-panel__assumption-inline {
  margin: 0 16px 12px;
  padding: 10px 12px;
  border: 1px solid var(--ei-border, #e5e7eb);
  border-radius: 6px;
  background: var(--ei-bg-secondary, #f9fafb);
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.mcp-panel__assumption-inline-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  font-size: 12px;
}

.mcp-panel__assumption-inline-row span {
  color: var(--ei-text-secondary, #6b7280);
}

.mcp-panel__assumption-inline-row strong {
  color: var(--ei-text, #111827);
  font-weight: 600;
  text-align: right;
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

.mcp-panel__generate--cancel {
  background: var(--ei-danger, #dc2626);
}

.mcp-panel__generate--cancel:hover {
  background: #b91c1c;
}

.mcp-panel__progress {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 16px 12px;
  padding: 10px 12px;
  background: var(--ei-bg-secondary, #f9fafb);
  border: 1px solid var(--ei-border, #e5e7eb);
  border-radius: 6px;
  font-size: 12px;
  color: var(--ei-text-secondary, #6b7280);
}

.mcp-panel__progress-spinner {
  width: 12px;
  height: 12px;
  border: 2px solid var(--ei-border, #e5e7eb);
  border-top-color: var(--ei-primary, #4f46e5);
  border-radius: 50%;
  animation: mcp-spin 0.8s linear infinite;
}

@keyframes mcp-spin {
  to { transform: rotate(360deg); }
}

.mcp-panel__progress-text {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mcp-panel__progress-meta {
  font-variant-numeric: tabular-nums;
  color: var(--ei-text-quaternary, #9ca3af);
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

.mcp-panel__assumptions {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.mcp-panel__assumption-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  background: var(--ei-bg-secondary, #f9fafb);
  border: 1px solid var(--ei-border, #e5e7eb);
  border-radius: 6px;
}

.mcp-panel__assumption-row span {
  flex: 0 0 auto;
  font-size: 12px;
  color: var(--ei-text-secondary, #6b7280);
}

.mcp-panel__assumption-row strong {
  min-width: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--ei-text, #111827);
  text-align: right;
  overflow-wrap: anywhere;
}

.mcp-panel__assumption-reason {
  margin: 4px 0 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--ei-text-secondary, #6b7280);
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
