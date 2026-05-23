<script setup lang="ts">
import { computed } from 'vue'
import { RefreshCw } from 'lucide-vue-next'
import UiBadge from '../components/ui/Badge.vue'
import UiButton from '../components/ui/Button.vue'
import { useEasyInkStore } from '../stores/easyink'

const store = useEasyInkStore()
const readyPrinters = computed(
  () => store.printers.filter((printer) => printer.statusCode === 'READY').length
)
const queue = computed(() => store.status?.queue)
const statusRows = computed(() => [
  ['服务地址', (store.status?.serviceAddress ?? []).join('  ') || '-'],
  ['设备编号', store.status?.deviceNumber ?? '-'],
  ['版本号', store.status?.appVersion ?? '-'],
  ['MAC 地址', (store.status?.macAddresses ?? []).join(' / ') || '未检测到']
])
</script>

<template>
  <section class="metric-grid">
    <div class="metric-panel">
      <span>服务状态</span>
      <strong>{{ store.status?.serviceRunning ? '运行中' : '已停止' }}</strong>
      <p>HTTP {{ store.status?.httpPort ?? '-' }}</p>
    </div>
    <div class="metric-panel">
      <span>WebSocket</span>
      <strong>{{ store.status?.connections ?? 0 }}</strong>
      <p>{{ store.status?.webSocket ? '监听中' : '未启用' }}</p>
    </div>
    <div class="metric-panel">
      <span>队列</span>
      <strong>{{ store.status?.queueStatus === 'Busy' ? '忙碌' : '空闲' }}</strong>
      <p>
        {{ queue?.queued ?? 0 }} 等待 / {{ queue?.printing ?? 0 }} 打印中 / 上限
        {{ queue?.maxQueueSize ?? '-' }}
      </p>
    </div>
    <div class="metric-panel">
      <span>打印机</span>
      <strong>{{ store.printers.length }}</strong>
      <p>{{ readyPrinters }} 台就绪</p>
    </div>
    <div class="metric-panel">
      <span>任务</span>
      <strong>{{ store.jobs.length }}</strong>
      <p>队列保留最近 1 小时完成记录</p>
    </div>
    <div class="metric-panel">
      <span>审计</span>
      <strong>{{ store.logs.length }}</strong>
      <p>SQLite 持久化，按保留周期自动清理</p>
    </div>
  </section>

  <section v-if="store.status?.startupError" class="content-band alert-band">
    <div class="section-title">
      <h2>启动错误</h2>
      <UiBadge tone="bad">需要处理</UiBadge>
    </div>
    <p>{{ store.status.startupError }}</p>
  </section>

  <section class="content-band">
    <div class="section-title">
      <h2>设备信息</h2>
      <UiButton variant="secondary" @click="store.refreshStatus">
        <RefreshCw :size="16" />
        刷新状态
      </UiButton>
    </div>
    <div class="info-grid">
      <div v-for="[label, value] in statusRows" :key="label" class="info-row">
        <span>{{ label }}</span>
        <strong>{{ value }}</strong>
      </div>
    </div>
  </section>

  <section class="content-band">
    <div class="section-title">
      <h2>打印机概览</h2>
    </div>
    <div class="table table--printers">
      <div class="table-row table-head">
        <span>名称</span>
        <span>状态</span>
        <span>默认</span>
        <span>系统状态</span>
      </div>
      <div v-for="printer in store.printers" :key="printer.name" class="table-row">
        <span>{{ printer.displayName || printer.name }}</span>
        <UiBadge :tone="printer.statusCode === 'READY' ? 'good' : 'bad'">{{
          printer.statusCode
        }}</UiBadge>
        <span>{{ printer.isDefault ? '是' : '否' }}</span>
        <span>{{ printer.status ?? '-' }}</span>
      </div>
      <div v-if="store.printers.length === 0" class="empty-state">暂无打印机</div>
    </div>
  </section>
</template>
