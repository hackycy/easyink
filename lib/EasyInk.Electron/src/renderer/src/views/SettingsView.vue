<script setup lang="ts">
import { reactive, ref, watch } from 'vue'
import { Save } from 'lucide-vue-next'
import UiBadge from '../components/ui/Badge.vue'
import UiButton from '../components/ui/Button.vue'
import { useEasyInkStore } from '../stores/easyink'

const store = useEasyInkStore()
const saved = ref(false)
const form = reactive({
  httpPort: 18081,
  startHttpServer: true,
  autoStart: false,
  minimizeToTray: true,
  startMinimized: false,
  trustAllOrigins: false,
  apiKey: '',
  language: '' as '' | 'en-US',
  dbPath: '',
  crashLogDir: '',
  fileLogDir: '',
  printDebugLoggingEnabled: false,
  printDebugArtifactsDir: '',
  auditLogRetentionDays: 90,
  fileLogRetentionDays: 7,
  printDebugArtifactRetentionCount: 10,
  maxQueueSize: 100,
  printTimeoutSeconds: 60,
  maxConcurrentRequests: 50,
  maxWebSocketConnections: 100
})

watch(
  () => store.config,
  (config) => {
    if (!config) return
    Object.assign(form, {
      httpPort: config.httpPort,
      startHttpServer: config.startHttpServer,
      autoStart: config.autoStart,
      minimizeToTray: config.minimizeToTray,
      startMinimized: config.startMinimized,
      trustAllOrigins: config.trustAllOrigins,
      apiKey: config.apiKey ?? '',
      language: config.language,
      dbPath: config.dbPath ?? config.resolvedDbPath ?? '',
      crashLogDir: config.crashLogDir ?? config.resolvedCrashLogDir ?? '',
      fileLogDir: config.fileLogDir ?? config.resolvedFileLogDir ?? '',
      printDebugLoggingEnabled: config.printDebugLoggingEnabled,
      printDebugArtifactsDir:
        config.printDebugArtifactsDir ?? config.resolvedPrintDebugArtifactsDir ?? '',
      auditLogRetentionDays: config.auditLogRetentionDays,
      fileLogRetentionDays: config.fileLogRetentionDays,
      printDebugArtifactRetentionCount: config.printDebugArtifactRetentionCount,
      maxQueueSize: config.maxQueueSize,
      printTimeoutSeconds: config.printTimeoutSeconds,
      maxConcurrentRequests: config.maxConcurrentRequests,
      maxWebSocketConnections: config.maxWebSocketConnections
    })
  },
  { immediate: true }
)

async function save(): Promise<void> {
  if (!store.config) return
  await store.saveConfig({
    ...store.config,
    httpPort: form.httpPort,
    startHttpServer: form.startHttpServer,
    autoStart: form.autoStart,
    minimizeToTray: form.minimizeToTray,
    startMinimized: form.startMinimized,
    trustAllOrigins: form.trustAllOrigins,
    apiKey: form.apiKey.trim() || undefined,
    language: form.language,
    dbPath: form.dbPath.trim() || undefined,
    crashLogDir: form.crashLogDir.trim() || undefined,
    fileLogDir: form.fileLogDir.trim() || undefined,
    printDebugLoggingEnabled: form.printDebugLoggingEnabled,
    printDebugArtifactsDir: form.printDebugArtifactsDir.trim() || undefined,
    auditLogRetentionDays: form.auditLogRetentionDays,
    fileLogRetentionDays: form.fileLogRetentionDays,
    printDebugArtifactRetentionCount: form.printDebugArtifactRetentionCount,
    maxQueueSize: form.maxQueueSize,
    printTimeoutSeconds: form.printTimeoutSeconds,
    maxConcurrentRequests: form.maxConcurrentRequests,
    maxWebSocketConnections: form.maxWebSocketConnections
  })
  saved.value = true
}
</script>

<template>
  <section class="content-band">
    <div class="section-title">
      <h2>设置</h2>
      <div class="topbar-actions">
        <UiBadge v-if="saved" tone="warn">重启后生效</UiBadge>
        <UiButton :disabled="!store.config" @click="save">
          <Save :size="16" />
          保存
        </UiButton>
      </div>
    </div>

    <div class="settings-layout">
      <section class="settings-section">
        <h3>服务</h3>
        <div class="form-grid form-grid--two">
          <label class="field">
            <span>HTTP 端口</span>
            <input v-model.number="form.httpPort" type="number" min="1024" max="65535" />
          </label>
          <label class="field">
            <span>语言</span>
            <select v-model="form.language">
              <option value="">简体中文</option>
              <option value="en-US">English</option>
            </select>
          </label>
          <label class="toggle-field"
            ><input v-model="form.startHttpServer" type="checkbox" /> HTTP</label
          >
          <label class="toggle-field"
            ><input v-model="form.autoStart" type="checkbox" /> 自启动</label
          >
          <label class="toggle-field"
            ><input v-model="form.minimizeToTray" type="checkbox" /> 最小化到托盘</label
          >
          <label class="toggle-field"
            ><input v-model="form.startMinimized" type="checkbox" /> 启动最小化</label
          >
          <label class="toggle-field"
            ><input v-model="form.trustAllOrigins" type="checkbox" /> CORS</label
          >
        </div>
        <label class="field">
          <span>API Key</span>
          <input v-model="form.apiKey" type="password" autocomplete="off" />
        </label>
      </section>

      <section class="settings-section">
        <h3>存储与日志</h3>
        <label class="field">
          <span>SQLite 路径</span>
          <input v-model="form.dbPath" />
        </label>
        <label class="field">
          <span>崩溃日志</span>
          <input v-model="form.crashLogDir" />
        </label>
        <label class="field">
          <span>调试日志</span>
          <input v-model="form.fileLogDir" />
        </label>
        <label class="field">
          <span>调试附件</span>
          <input v-model="form.printDebugArtifactsDir" />
        </label>
        <div class="form-grid form-grid--four">
          <label class="toggle-field">
            <input v-model="form.printDebugLoggingEnabled" type="checkbox" />
            调试日志
          </label>
          <label class="field">
            <span>审计保留天数</span>
            <input v-model.number="form.auditLogRetentionDays" type="number" min="1" />
          </label>
          <label class="field">
            <span>文件日志保留天数</span>
            <input v-model.number="form.fileLogRetentionDays" type="number" min="1" />
          </label>
          <label class="field">
            <span>调试附件数量</span>
            <input v-model.number="form.printDebugArtifactRetentionCount" type="number" min="1" />
          </label>
        </div>
      </section>

      <section class="settings-section">
        <h3>容量</h3>
        <div class="form-grid form-grid--four">
          <label class="field">
            <span>队列上限</span>
            <input v-model.number="form.maxQueueSize" type="number" min="10" />
          </label>
          <label class="field">
            <span>打印超时秒</span>
            <input v-model.number="form.printTimeoutSeconds" type="number" min="5" max="600" />
          </label>
          <label class="field">
            <span>HTTP 并发</span>
            <input v-model.number="form.maxConcurrentRequests" type="number" min="5" />
          </label>
          <label class="field">
            <span>WS 连接上限</span>
            <input v-model.number="form.maxWebSocketConnections" type="number" min="10" />
          </label>
        </div>
      </section>
    </div>
  </section>
</template>
