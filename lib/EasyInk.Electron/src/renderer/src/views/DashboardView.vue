<script setup lang="ts">
import { computed } from 'vue'
import UiBadge from '../components/ui/Badge.vue'
import { useEasyInkStore } from '../stores/easyink'

const store = useEasyInkStore()
const readyPrinters = computed(
  () => store.printers.filter((printer) => printer.statusCode === 'READY').length
)
</script>

<template>
  <section class="metric-grid">
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

  <section class="content-band">
    <div class="section-title">
      <h2>打印机</h2>
    </div>
    <div class="table">
      <div class="table-row table-head">
        <span>名称</span>
        <span>状态</span>
        <span>默认</span>
      </div>
      <div v-for="printer in store.printers" :key="printer.name" class="table-row">
        <span>{{ printer.displayName || printer.name }}</span>
        <UiBadge :tone="printer.statusCode === 'READY' ? 'good' : 'bad'">{{
          printer.statusCode
        }}</UiBadge>
        <span>{{ printer.isDefault ? '是' : '否' }}</span>
      </div>
      <div v-if="store.printers.length === 0" class="empty-state">暂无打印机</div>
    </div>
  </section>
</template>
