<script setup lang="ts">
import type { MCPServerConfig } from '../types'
import { IconClose, IconDelete, IconFilePen, IconPlus } from '@easyink/icons'
import { generateId } from '@easyink/shared'
import { computed, ref } from 'vue'
import { validateServerConfig } from '../server-registry'

const props = defineProps<{
  servers: MCPServerConfig[]
  serverStates: Record<string, 'disconnected' | 'connecting' | 'connected' | 'error'>
  serverErrors: Record<string, string | undefined>
  providerApiKeys: Record<string, string | undefined>
}>()

const emit = defineEmits<{
  close: []
  save: [config: MCPServerConfig]
  remove: [id: string]
  toggle: [id: string, enabled: boolean]
}>()

type Mode = 'list' | 'edit'

const mode = ref<Mode>('list')
const form = ref<Partial<MCPServerConfig>>({ type: 'http', enabled: true })
const errors = ref<string[]>([])

const title = computed(() => mode.value === 'list' ? 'MCP 服务器' : (form.value.id && props.servers.some(s => s.id === form.value.id) ? '编辑服务器' : '新建服务器'))
const providerConfig = computed({
  get() {
    return form.value.providerConfig ?? createDefaultProviderConfig()
  },
  set(value) {
    form.value.providerConfig = value
  },
})

function startCreate() {
  form.value = {
    type: 'http',
    enabled: true,
    id: generateId('server'),
    providerConfig: createDefaultProviderConfig(),
  }
  errors.value = []
  mode.value = 'edit'
}

function startEdit(s: MCPServerConfig) {
  form.value = {
    ...s,
    auth: undefined,
    providerConfig: {
      ...createDefaultProviderConfig(),
      ...s.providerConfig,
      apiKey: s.providerConfig?.apiKey ?? props.providerApiKeys[s.id],
    },
  }
  errors.value = []
  mode.value = 'edit'
}

function cancelEdit() {
  errors.value = []
  mode.value = 'list'
}

function save() {
  const config = normalizeServerConfig(form.value)
  const errs = validateServerConfig(config)
  if (errs.length) {
    errors.value = errs
    return
  }
  emit('save', config as MCPServerConfig)
  mode.value = 'list'
}

function badgeText(id: string): { text: string, kind: 'ok' | 'err' | 'warn' | 'idle' } {
  const state = props.serverStates[id]
  if (state === 'connected')
    return { text: '已连接', kind: 'ok' }
  if (state === 'connecting')
    return { text: '连接中', kind: 'warn' }
  if (state === 'error')
    return { text: '连接失败', kind: 'err' }
  return { text: '未连接', kind: 'idle' }
}

function createDefaultProviderConfig() {
  return {
    useUserProviderConfig: false,
    provider: 'claude' as const,
    apiKey: '',
    rememberApiKey: false,
    model: '',
    baseUrl: '',
  }
}

function normalizeServerConfig(config: Partial<MCPServerConfig>): Partial<MCPServerConfig> {
  const provider = config.providerConfig
    ? {
        ...config.providerConfig,
        apiKey: config.providerConfig.apiKey?.trim(),
        model: config.providerConfig.model?.trim(),
        baseUrl: config.providerConfig.baseUrl?.trim(),
      }
    : undefined

  return {
    ...config,
    id: config.id?.trim(),
    name: config.name?.trim(),
    url: config.url?.trim(),
    command: config.command?.trim(),
    auth: undefined,
    providerConfig: provider,
  }
}
</script>

<template>
  <div class="ai-modal" @click.self="emit('close')">
    <div class="ai-modal__panel">
      <div class="ai-modal__header">
        <h4>{{ title }}</h4>
        <button class="ai-modal__close" @click="emit('close')">
          <IconClose :size="16" />
        </button>
      </div>

      <div v-if="mode === 'list'" class="ai-modal__body">
        <div v-if="servers.length === 0" class="ai-modal__empty">
          暂无服务器，点击下方按钮新建。
        </div>
        <div
          v-for="s in servers"
          :key="s.id"
          class="ai-srv"
        >
          <input
            type="checkbox"
            :checked="s.enabled"
            :title="s.enabled ? '点击禁用' : '点击启用'"
            @change="(e) => emit('toggle', s.id, (e.target as HTMLInputElement).checked)"
          >
          <div class="ai-srv__main">
            <div class="ai-srv__name">
              {{ s.name }}
              <span
                class="ai-srv__badge"
                :class="`ai-srv__badge--${badgeText(s.id).kind}`"
                :title="serverErrors[s.id] || ''"
              >{{ badgeText(s.id).text }}</span>
            </div>
            <div class="ai-srv__meta">
              {{ s.type === 'http' ? s.url : `${s.command} ${(s.args || []).join(' ')}` }}
            </div>
          </div>
          <button class="ai-srv__action" title="编辑" @click="startEdit(s)">
            <IconFilePen :size="14" />
          </button>
          <button
            class="ai-srv__action ai-srv__action--danger"
            title="删除"
            @click="emit('remove', s.id)"
          >
            <IconDelete :size="14" />
          </button>
        </div>

        <button class="ai-modal__add" @click="startCreate">
          <IconPlus :size="14" /> 新建服务器
        </button>
      </div>

      <div v-else class="ai-modal__body">
        <div class="ai-form">
          <div class="ai-form__group">
            <label>名称</label>
            <input v-model="form.name" type="text" placeholder="例如：本地 Claude MCP">
          </div>
          <div class="ai-form__group">
            <label>连接类型</label>
            <select v-model="form.type">
              <option value="http">
                HTTP
              </option>
              <option value="stdio">
                Stdio
              </option>
            </select>
          </div>
          <div v-if="form.type === 'http'" class="ai-form__group">
            <label>服务地址</label>
            <input v-model="form.url" type="url" placeholder="http://localhost:3001/mcp">
          </div>
          <div v-if="form.type === 'http'" class="ai-form__group">
            <label class="ai-form__check">
              <input v-model="providerConfig.useUserProviderConfig" type="checkbox"> 使用我的 Provider 凭证
            </label>
          </div>
          <template v-if="form.type === 'http'">
            <div class="ai-form__row">
              <div class="ai-form__group">
                <label>Provider</label>
                <select v-model="providerConfig.provider" :disabled="!providerConfig.useUserProviderConfig">
                  <option value="claude">
                    Claude
                  </option>
                  <option value="openai">
                    OpenAI Compatible
                  </option>
                </select>
              </div>
              <div class="ai-form__group">
                <label>Model</label>
                <input v-model="providerConfig.model" :disabled="!providerConfig.useUserProviderConfig" type="text" placeholder="provider default">
              </div>
            </div>
            <div class="ai-form__group">
              <label>Provider API Key</label>
              <input v-model="providerConfig.apiKey" :disabled="!providerConfig.useUserProviderConfig" type="password" placeholder="sk-...">
            </div>
            <div class="ai-form__group">
              <label>Base URL</label>
              <input v-model="providerConfig.baseUrl" :disabled="!providerConfig.useUserProviderConfig" type="url" placeholder="https://api.openai.com/v1">
            </div>
            <div class="ai-form__group">
              <label class="ai-form__check">
                <input v-model="providerConfig.rememberApiKey" :disabled="!providerConfig.useUserProviderConfig" type="checkbox"> 记住 key
              </label>
            </div>
          </template>
          <div v-if="form.type === 'stdio'" class="ai-form__group">
            <label>启动命令</label>
            <input v-model="form.command" type="text" placeholder="npx">
          </div>
          <div class="ai-form__group">
            <label class="ai-form__check">
              <input v-model="form.enabled" type="checkbox"> 启用此服务器
            </label>
          </div>

          <div v-if="errors.length" class="ai-form__errors">
            <p v-for="e in errors" :key="e">
              {{ e }}
            </p>
          </div>
        </div>

        <div class="ai-modal__actions">
          <button class="ai-btn ai-btn--secondary" @click="cancelEdit">
            返回
          </button>
          <button class="ai-btn ai-btn--primary" @click="save">
            保存
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ai-modal {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1100;
}

.ai-modal__panel {
  width: 460px;
  max-width: 90vw;
  max-height: 90vh;
  background: var(--ei-bg, #fff);
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.ai-modal__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px;
  border-bottom: 1px solid var(--ei-border, #e5e7eb);
}

.ai-modal__header h4 {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--ei-text, #111827);
}

.ai-modal__close {
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px;
  display: flex;
  color: var(--ei-text-secondary, #6b7280);
  border-radius: 4px;
}

.ai-modal__close:hover {
  background: var(--ei-bg-hover, #f3f4f6);
}

.ai-modal__body {
  padding: 16px 18px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.ai-modal__empty {
  text-align: center;
  color: var(--ei-text-quaternary, #9ca3af);
  font-size: 13px;
  padding: 20px 0;
}

.ai-srv {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  background: var(--ei-bg-secondary, #f9fafb);
  border-radius: 8px;
}

.ai-srv__main {
  flex: 1;
  min-width: 0;
}

.ai-srv__name {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 500;
  color: var(--ei-text, #111827);
}

.ai-srv__meta {
  font-size: 11px;
  color: var(--ei-text-secondary, #6b7280);
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ai-srv__badge {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 4px;
  background: var(--ei-bg-tertiary, #e5e7eb);
  color: var(--ei-text-secondary, #6b7280);
  font-weight: normal;
}

.ai-srv__badge--ok { background: #dcfce7; color: #166534; }
.ai-srv__badge--err { background: #fee2e2; color: #991b1b; }
.ai-srv__badge--warn { background: #fef3c7; color: #92400e; }

.ai-srv__action {
  background: none;
  border: none;
  padding: 6px;
  border-radius: 4px;
  cursor: pointer;
  color: var(--ei-text-secondary, #6b7280);
  display: flex;
}

.ai-srv__action:hover {
  background: var(--ei-bg-hover, #f3f4f6);
  color: var(--ei-primary, #4f46e5);
}

.ai-srv__action--danger:hover {
  color: #dc2626;
}

.ai-modal__add {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px 12px;
  background: none;
  border: 1px dashed var(--ei-border, #d1d5db);
  border-radius: 8px;
  font-size: 13px;
  color: var(--ei-text-secondary, #6b7280);
  cursor: pointer;
}

.ai-modal__add:hover {
  border-color: var(--ei-primary, #4f46e5);
  color: var(--ei-primary, #4f46e5);
}

.ai-form { display: flex; flex-direction: column; gap: 12px; }
.ai-form__group { display: flex; flex-direction: column; gap: 4px; }
.ai-form__row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.ai-form__group label { font-size: 12px; font-weight: 500; color: var(--ei-text, #111827); }
.ai-form__check { flex-direction: row; align-items: center; gap: 6px; display: flex; }

.ai-form__group input,
.ai-form__group select {
  padding: 8px 10px;
  border: 1px solid var(--ei-border, #d1d5db);
  border-radius: 6px;
  font-size: 13px;
  background: var(--ei-bg, #fff);
  color: var(--ei-text, #111827);
}

.ai-form__group input:focus,
.ai-form__group select:focus {
  outline: none;
  border-color: var(--ei-primary, #4f46e5);
  box-shadow: 0 0 0 3px var(--ei-primary-light, rgba(79, 70, 229, 0.1));
}

.ai-form__group input:disabled,
.ai-form__group select:disabled {
  background: var(--ei-bg-secondary, #f9fafb);
  color: var(--ei-text-quaternary, #9ca3af);
  cursor: not-allowed;
}

.ai-form__errors {
  background: #fef2f2;
  border-radius: 6px;
  padding: 10px 12px;
}

.ai-form__errors p { margin: 0; color: #dc2626; font-size: 12px; }
.ai-form__errors p + p { margin-top: 4px; }

.ai-modal__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
}

.ai-btn {
  padding: 7px 14px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid transparent;
}

.ai-btn--secondary {
  background: var(--ei-bg-secondary, #f9fafb);
  border-color: var(--ei-border, #d1d5db);
  color: var(--ei-text, #111827);
}

.ai-btn--primary {
  background: var(--ei-primary, #4f46e5);
  color: #fff;
  border-color: var(--ei-primary, #4f46e5);
}

.ai-btn--primary:hover {
  background: var(--ei-primary-hover, #4338ca);
}
</style>
