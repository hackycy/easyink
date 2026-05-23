<script setup lang="ts">
import { onMounted } from 'vue'
import { RouterLink, RouterView } from 'vue-router'
import {
  Activity,
  FileText,
  ListChecks,
  Printer,
  RefreshCw,
  ScrollText,
  Settings
} from 'lucide-vue-next'
import UiButton from './components/ui/Button.vue'
import UiBadge from './components/ui/Badge.vue'
import { useEasyInkStore } from './stores/easyink'

const store = useEasyInkStore()

onMounted(() => {
  void store.refreshAll()
})
</script>

<template>
  <div class="app-shell">
    <aside class="sidebar">
      <div class="brand">
        <div class="brand-mark">
          <Printer :size="22" />
        </div>
        <div>
          <strong>EasyInk Printer</strong>
          <span>Chromium 打印服务</span>
        </div>
      </div>

      <nav class="nav-list">
        <RouterLink to="/" class="nav-item">
          <Activity :size="18" />
          <span>仪表盘</span>
        </RouterLink>
        <RouterLink to="/print" class="nav-item">
          <FileText :size="18" />
          <span>HTML 直打</span>
        </RouterLink>
        <RouterLink to="/printers" class="nav-item">
          <Printer :size="18" />
          <span>打印机</span>
        </RouterLink>
        <RouterLink to="/jobs" class="nav-item">
          <ListChecks :size="18" />
          <span>任务</span>
        </RouterLink>
        <RouterLink to="/logs" class="nav-item">
          <ScrollText :size="18" />
          <span>日志</span>
        </RouterLink>
        <RouterLink to="/settings" class="nav-item">
          <Settings :size="18" />
          <span>设置</span>
        </RouterLink>
      </nav>
    </aside>

    <main class="workspace">
      <header class="topbar">
        <div>
          <h1>本地打印服务</h1>
          <p>
            HTTP
            {{
              store.status?.serviceRunning && store.status?.httpPort
                ? `127.0.0.1:${store.status.httpPort}`
                : '未启动'
            }}
          </p>
        </div>
        <div class="topbar-actions">
          <UiBadge :tone="store.status?.htmlPrint ? 'good' : 'warn'">HTML</UiBadge>
          <UiBadge :tone="store.status?.viewerPrint ? 'good' : 'warn'">Viewer</UiBadge>
          <UiBadge :tone="store.status?.webSocket ? 'good' : 'warn'">WS</UiBadge>
          <UiBadge :tone="store.status?.chromiumPrint ? 'good' : 'warn'">Chromium</UiBadge>
          <UiButton
            variant="secondary"
            size="icon"
            :disabled="store.loading"
            @click="store.refreshAll"
          >
            <RefreshCw :size="17" />
          </UiButton>
        </div>
      </header>

      <RouterView />
    </main>
  </div>
</template>
