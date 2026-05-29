<script setup lang="ts">
import type { DesignerStore } from '@easyink/designer'
import type { AIGenerationPlan } from '@easyink/shared'
import type { MCPServerConfig, SessionMessage } from '../types'
import { AI_NAMESPACE } from '@easyink/datasource'
import { IconClose, IconDelete, IconManager, IconSparkles } from '@easyink/icons'
import { DataSourceAligner, getDomainProfile, SchemaValidator } from '@easyink/schema-tools'
import { generateId } from '@easyink/shared'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from 'vue'
import { MCPClient } from '../mcp-client'
import { ServerRegistry } from '../server-registry'
import { clearSession, loadSession, saveSession } from '../session-storage'
import ChatInput from './ChatInput.vue'
import MessageBubble from './MessageBubble.vue'
import SchemaJsonModal from './SchemaJsonModal.vue'
import ServerManagerModal from './ServerManagerModal.vue'

const props = defineProps<{
  store: DesignerStore
  open: boolean
  knownMaterialTypes?: Set<string>
}>()

const emit = defineEmits<{
  'update:open': [open: boolean]
}>()

// ─── state ───────────────────────────────────────────────────────────────
const SESSION_STORAGE_KEY = 'easyink:ai:session'

const mcpClient = new MCPClient()
const serverRegistry = new ServerRegistry()

const prompt = ref('')
const isGenerating = ref(false)
const sessionMessages = ref<SessionMessage[]>(loadSession({ key: SESSION_STORAGE_KEY }))
const showServerManager = ref(false)
const lastGenerationPlan = ref<AIGenerationPlan | null>(null)
const selectedServerId = ref<string | null>(null)
const jsonModal = ref<{ title: string, data: unknown } | null>(null)
const scrollerRef = useTemplateRef<HTMLDivElement>('scrollerRef')

let activeAbort: AbortController | undefined
/** Id of the assistant message currently streaming. */
let streamingId: string | null = null

const servers = ref<MCPServerConfig[]>(serverRegistry.getServers())
const serverStates = ref<Record<string, 'disconnected' | 'connecting' | 'connected' | 'error'>>({})
const serverErrors = ref<Record<string, string | undefined>>({})
const providerApiKeys = ref<Record<string, string | undefined>>({})

// ─── computed ────────────────────────────────────────────────────────────
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
const hasServers = computed(() => servers.value.length > 0)
const streamingMessage = computed(() =>
  streamingId ? sessionMessages.value.find(m => m.id === streamingId) : undefined,
)

// ─── persistence ─────────────────────────────────────────────────────────
watch(sessionMessages, (msgs) => {
  // Strip transient progressLog before persisting.
  const clean = msgs
    .filter(m => !(m.id === streamingId))
    .map(m => ({ ...m, progressLog: undefined }))
  saveSession(clean, { key: SESSION_STORAGE_KEY })
}, { deep: true })

// ─── helpers ─────────────────────────────────────────────────────────────
function refreshServers() {
  servers.value = serverRegistry.getServers()
}

function scrollToBottom() {
  void nextTick(() => {
    const el = scrollerRef.value
    if (el)
      el.scrollTop = el.scrollHeight
  })
}

function appendProgress(message: string) {
  if (!streamingId)
    return
  const msg = sessionMessages.value.find(m => m.id === streamingId)
  if (!msg)
    return
  if (!msg.progressLog)
    msg.progressLog = []
  msg.progressLog.push(message)
  // Render in the bubble as a running thinking transcript.
  msg.content = msg.progressLog.slice(-6).join('\n')
  scrollToBottom()
}

async function ensureConnected(serverId: string): Promise<void> {
  const status = mcpClient.getServerStatus(serverId)
  if (status?.state === 'connected')
    return
  const config = serverRegistry.getServer(serverId)
  if (!config)
    throw new Error(`服务器配置不存在: ${serverId}`)
  if (!config.enabled)
    throw new Error(`服务器已禁用: ${config.name}`)
  const runtimeConfig = withRuntimeProviderApiKey(config)

  serverStates.value = { ...serverStates.value, [serverId]: 'connecting' }
  serverErrors.value = { ...serverErrors.value, [serverId]: undefined }
  try {
    await mcpClient.connect(runtimeConfig)
    serverStates.value = { ...serverStates.value, [serverId]: 'connected' }
  }
  catch (err) {
    const message = err instanceof Error ? err.message : 'Connection failed'
    serverStates.value = { ...serverStates.value, [serverId]: 'error' }
    serverErrors.value = { ...serverErrors.value, [serverId]: message }
    throw new Error(`连接 MCP 服务器失败 (${config.name}): ${message}`)
  }
}

function formatDomain(domain: AIGenerationPlan['domain']): string {
  return getDomainProfile(domain).label
}

// ─── server management ──────────────────────────────────────────────────
async function handleToggleEnabled(id: string, enabled: boolean) {
  serverRegistry.setEnabled(id, enabled)
  refreshServers()
  if (!enabled) {
    try {
      await mcpClient.disconnect(id)
    }
    catch {}
    serverStates.value = { ...serverStates.value, [id]: 'disconnected' }
  }
}

function handleSaveServer(config: MCPServerConfig) {
  const persistable = toPersistableServerConfig(config)
  serverRegistry.addServer(persistable)
  // Drop any existing connection so next generate reconnects with new config.
  mcpClient.disconnect(config.id).catch(() => {})
  serverStates.value = { ...serverStates.value, [config.id]: 'disconnected' }
  refreshServers()
  selectedServerId.value = config.id
}

function handleRemoveServer(id: string) {
  serverRegistry.removeServer(id)
  const nextProviderApiKeys = { ...providerApiKeys.value }
  delete nextProviderApiKeys[id]
  providerApiKeys.value = nextProviderApiKeys
  mcpClient.disconnect(id).catch(() => {})
  serverStates.value = { ...serverStates.value, [id]: 'disconnected' }
  refreshServers()
  if (selectedServerId.value === id)
    selectedServerId.value = enabledServers.value[0]?.id ?? null
}

function withRuntimeProviderApiKey(config: MCPServerConfig): MCPServerConfig {
  const providerConfig = config.providerConfig
  if (!providerConfig?.useUserProviderConfig || providerConfig.apiKey)
    return config
  const apiKey = providerApiKeys.value[config.id]
  if (!apiKey)
    return config
  return {
    ...config,
    providerConfig: {
      ...providerConfig,
      apiKey,
    },
  }
}

function toPersistableServerConfig(config: MCPServerConfig): MCPServerConfig {
  const providerConfig = config.providerConfig
  const next: MCPServerConfig = {
    ...config,
    auth: undefined,
    providerConfig: providerConfig ? { ...providerConfig } : undefined,
  }

  if (!next.providerConfig?.useUserProviderConfig) {
    const nextProviderApiKeys = { ...providerApiKeys.value }
    delete nextProviderApiKeys[config.id]
    providerApiKeys.value = nextProviderApiKeys
    return next
  }

  const apiKey = next.providerConfig.apiKey?.trim()
  if (apiKey && !next.providerConfig.rememberApiKey) {
    providerApiKeys.value = { ...providerApiKeys.value, [config.id]: apiKey }
    next.providerConfig.apiKey = undefined
  }
  else if (apiKey) {
    providerApiKeys.value = { ...providerApiKeys.value, [config.id]: apiKey }
    next.providerConfig.apiKey = apiKey
  }

  return next
}

// ─── generate ────────────────────────────────────────────────────────────
async function runGenerate(reusePrompt?: string) {
  const text = (reusePrompt ?? prompt.value).trim()
  if (!text)
    return
  if (!selectedServerId.value)
    return

  isGenerating.value = true
  activeAbort = new AbortController()

  // 1. Push user message
  sessionMessages.value.push({
    id: generateId('msg'),
    role: 'user',
    content: text,
    timestamp: Date.now(),
    schemaSnapshot: props.store.schema,
  })

  // 2. Create streaming assistant placeholder
  const assistantId = generateId('msg')
  streamingId = assistantId
  sessionMessages.value.push({
    id: assistantId,
    role: 'assistant',
    content: '',
    timestamp: Date.now(),
    progressLog: [],
    sourcePrompt: text,
  })
  scrollToBottom()

  try {
    appendProgress('连接 MCP 服务器...')
    await ensureConnected(selectedServerId.value)

    appendProgress('提交需求，等待模型生成 schema...')
    const result = await mcpClient.generate({
      serverId: selectedServerId.value,
      prompt: text,
      currentSchema: props.store.schema,
      context: { sessionHistory: sessionMessages.value },
      signal: activeAbort.signal,
      onProgress: (p) => {
        if (p.message)
          appendProgress(p.message)
      },
    })

    const assumptions = result.metadata?.assumptions as AIGenerationPlan | undefined
    if (assumptions)
      lastGenerationPlan.value = assumptions

    appendProgress('校验生成结果...')
    const validator = new SchemaValidator({
      strictMode: true,
      allowedMaterialTypes: props.knownMaterialTypes,
    })
    const validation = validator.validate(result.schema)
    if (!validation.valid) {
      const errors = validation.errors.map(e => e.message).join(', ')
      throw new Error(`Schema validation failed: ${errors}`)
    }
    let finalSchema = result.schema
    if (validation.autoFixed.length > 0)
      finalSchema = validator.autoFix(result.schema).fixed

    appendProgress('对齐数据源字段...')
    const aligner = new DataSourceAligner()
    const alignment = aligner.align(finalSchema, result.dataSource)

    const sampleData = result.metadata?.sampleData as Record<string, unknown> | undefined

    // Register provider so the data source panel resolves AI fields.
    props.store.dataSourceRegistry.registerProviderFactory({
      id: alignment.dataSource.id,
      namespace: AI_NAMESPACE,
      resolve: async () => alignment.dataSource,
    })

    // Apply schema, then push AI metadata + sampleData via extension so the
    // host (e.g. playground) can drive the preview with realistic values.
    const versionId = generateId('ver')
    props.store.setSchema(alignment.schema)

    const existing = (props.store.getExtension('ai') ?? {}) as {
      dataSources?: Array<{ id: string, name: string, tag?: string, fields: unknown, meta?: Record<string, unknown> }>
      providerFactories?: Array<{ id: string, namespace: string }>
      currentVersionId?: string
      latestSampleData?: Record<string, unknown>
      latestSampleDataAt?: number
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
      latestSampleData: sampleData,
      latestSampleDataAt: sampleData ? Date.now() : existing.latestSampleDataAt,
    })

    // Finalize streaming message.
    const assistantMsg = sessionMessages.value.find(m => m.id === assistantId)
    if (assistantMsg) {
      const domain = assumptions?.domain ?? 'generic'
      assistantMsg.content = `已生成「${formatDomain(domain)}」模板${sampleData ? '，并应用示例数据。' : '。'}`
      assistantMsg.toolsUsed = result.toolsUsed
      assistantMsg.schemaSnapshot = alignment.schema
      assistantMsg.dataSourceSnapshot = alignment.dataSource
      assistantMsg.sampleDataSnapshot = sampleData
      assistantMsg.assumptions = result.metadata?.assumptions as Record<string, unknown> | undefined
      assistantMsg.progressLog = undefined
    }

    if (!reusePrompt)
      prompt.value = ''
  }
  catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    const assistantMsg = sessionMessages.value.find(m => m.id === assistantId)
    if (assistantMsg) {
      assistantMsg.content = ''
      assistantMsg.error = message
      assistantMsg.progressLog = undefined
    }
  }
  finally {
    isGenerating.value = false
    streamingId = null
    activeAbort = undefined
    scrollToBottom()
  }
}

function handleSubmit() {
  if (!canGenerate.value)
    return
  void runGenerate()
}

function handleCancel() {
  activeAbort?.abort()
}

function handleClearHistory() {
  if (selectedServerId.value)
    mcpClient.clearSession(selectedServerId.value)
  sessionMessages.value = []
  clearSession({ key: SESSION_STORAGE_KEY })
}

function handleRegenerate(msg: SessionMessage) {
  if (isGenerating.value || !msg.sourcePrompt)
    return
  void runGenerate(msg.sourcePrompt)
}

function handleRestore(msg: SessionMessage) {
  if (!msg.schemaSnapshot)
    return
  // Silent replace: setSchema clears command stack so this isn't a Undo entry.
  props.store.setSchema(msg.schemaSnapshot)

  if (msg.dataSourceSnapshot) {
    const ds = msg.dataSourceSnapshot
    props.store.dataSourceRegistry.registerProviderFactory({
      id: ds.id,
      namespace: AI_NAMESPACE,
      resolve: async () => ds,
    })
  }

  if (msg.sampleDataSnapshot) {
    const existing = (props.store.getExtension('ai') ?? {}) as Record<string, unknown>
    props.store.setExtension('ai', {
      ...existing,
      latestSampleData: msg.sampleDataSnapshot,
      latestSampleDataAt: Date.now(),
    })
  }
}

function handleViewSchema(msg: SessionMessage) {
  if (!msg.schemaSnapshot)
    return
  jsonModal.value = {
    title: `Schema · ${new Date(msg.timestamp).toLocaleString()}`,
    data: {
      schema: msg.schemaSnapshot,
      dataSource: msg.dataSourceSnapshot,
      sampleData: msg.sampleDataSnapshot,
      assumptions: msg.assumptions,
    },
  }
}

// ─── lifecycle ───────────────────────────────────────────────────────────
onMounted(() => {
  if (enabledServers.value.length > 0 && !selectedServerId.value)
    selectedServerId.value = enabledServers.value[0]!.id
  scrollToBottom()
})

onBeforeUnmount(() => {
  activeAbort?.abort()
})

watch(() => props.open, (open) => {
  if (open)
    scrollToBottom()
})
</script>

<template>
  <div v-if="open" class="ai-panel">
    <!-- Header -->
    <div class="ai-panel__header">
      <div class="ai-panel__title">
        <IconSparkles :size="16" />
        <span>{{ props.store.t('designer.ai.title') }}</span>
      </div>
      <div class="ai-panel__head-actions">
        <select
          v-if="hasServers"
          v-model="selectedServerId"
          class="ai-panel__server-select"
          :title="selectedServer?.url || selectedServer?.command || ''"
        >
          <option
            v-for="s in servers"
            :key="s.id"
            :value="s.id"
            :disabled="!s.enabled"
          >
            {{ s.name }}{{ !s.enabled ? '（已禁用）' : '' }}
          </option>
        </select>
        <button
          class="ai-panel__icon-btn"
          title="管理 MCP 服务器"
          @click="showServerManager = true"
        >
          <IconManager :size="16" />
        </button>
        <button
          class="ai-panel__icon-btn"
          title="清空对话"
          @click="handleClearHistory"
        >
          <IconDelete :size="16" />
        </button>
        <button
          class="ai-panel__icon-btn"
          title="关闭"
          @click="emit('update:open', false)"
        >
          <IconClose :size="16" />
        </button>
      </div>
    </div>

    <!-- Conversation -->
    <div ref="scrollerRef" class="ai-panel__scroller">
      <div
        v-if="sessionMessages.length === 0"
        class="ai-panel__empty"
      >
        <IconSparkles :size="28" />
        <p>用一句话描述你想生成的模板</p>
        <p class="ai-panel__empty-hint">
          示例：生成一个销售发票模板，包含公司信息、商品明细和总金额
        </p>
      </div>

      <MessageBubble
        v-for="msg in sessionMessages"
        :key="msg.id"
        :message="msg"
        :streaming="msg.id === streamingMessage?.id"
        :can-restore="msg.role === 'assistant' && !!msg.schemaSnapshot && msg.id !== streamingMessage?.id"
        :can-regenerate="msg.role === 'assistant' && !!msg.sourcePrompt && !isGenerating"
        @copy="() => {}"
        @view-schema="handleViewSchema"
        @restore="handleRestore"
        @regenerate="handleRegenerate"
      />
    </div>

    <!-- Footer Input -->
    <div class="ai-panel__footer">
      <div
        v-if="!hasServers"
        class="ai-panel__hint"
      >
        请先<button class="ai-panel__hint-link" @click="showServerManager = true">
          配置 MCP 服务器
        </button>。
      </div>
      <div
        v-else-if="!selectedServer?.enabled"
        class="ai-panel__hint ai-panel__hint--warn"
      >
        当前服务器已禁用。
      </div>
      <ChatInput
        v-model="prompt"
        :disabled="!hasServers || !selectedServer?.enabled"
        :is-generating="isGenerating"
        @submit="handleSubmit"
        @cancel="handleCancel"
      />
    </div>

    <!-- Modals -->
    <ServerManagerModal
      v-if="showServerManager"
      :servers="servers"
      :server-states="serverStates"
      :server-errors="serverErrors"
      :provider-api-keys="providerApiKeys"
      @close="showServerManager = false"
      @save="handleSaveServer"
      @remove="handleRemoveServer"
      @toggle="handleToggleEnabled"
    />
    <SchemaJsonModal
      v-if="jsonModal"
      :title="jsonModal.title"
      :data="jsonModal.data"
      @close="jsonModal = null"
    />
  </div>
</template>

<style scoped lang="scss">
.ai-panel {
  position: fixed;
  top: 0;
  right: 0;
  width: 420px;
  height: 100vh;
  background: var(--ei-bg, #fff);
  border-left: 1px solid var(--ei-border, #e5e7eb);
  display: flex;
  flex-direction: column;
  z-index: 1000;
  box-shadow: -4px 0 16px rgba(0, 0, 0, 0.1);

  &__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 10px 12px;
    border-bottom: 1px solid var(--ei-border, #e5e7eb);
    flex-shrink: 0;
  }

  &__title {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 14px;
    font-weight: 600;
    color: var(--ei-text, #111827);
  }

  &__head-actions {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  &__server-select {
    font-size: 12px;
    padding: 4px 8px;
    border: 1px solid var(--ei-border, #d1d5db);
    border-radius: 6px;
    background: var(--ei-bg, #fff);
    color: var(--ei-text, #111827);
    max-width: 160px;

    &:focus {
      outline: none;
      border-color: var(--ei-primary, #4f46e5);
    }
  }

  &__icon-btn {
    background: none;
    border: none;
    padding: 6px;
    border-radius: 6px;
    cursor: pointer;
    color: var(--ei-text-secondary, #6b7280);
    display: flex;
    align-items: center;
    justify-content: center;

    &:hover {
      background: var(--ei-bg-hover, #f3f4f6);
      color: var(--ei-primary, #4f46e5);
    }
  }

  &__scroller {
    flex: 1;
    overflow-y: auto;
    padding: 16px 12px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  &__empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    height: 100%;
    color: var(--ei-text-secondary, #6b7280);
    text-align: center;
    padding: 0 24px;

    p {
      margin: 0;
      font-size: 13px;
    }

    &-hint {
      font-size: 12px !important;
      color: var(--ei-text-quaternary, #9ca3af);
    }
  }

  &__footer {
    padding: 10px 12px 12px;
    border-top: 1px solid var(--ei-border, #e5e7eb);
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  &__hint {
    font-size: 12px;
    color: var(--ei-text-secondary, #6b7280);

    &--warn {
      color: #b45309;
    }

    &-link {
      background: none;
      border: none;
      padding: 0 4px;
      color: var(--ei-primary, #4f46e5);
      cursor: pointer;
      font: inherit;
      text-decoration: underline;
    }
  }
}
</style>
