<script setup lang="ts">
import { reactive } from 'vue'
import { Download, RefreshCw, Search } from 'lucide-vue-next'
import UiBadge from '../components/ui/Badge.vue'
import UiButton from '../components/ui/Button.vue'
import { defaultLogQuery, useEasyInkStore } from '../stores/easyink'
import type { LogQuery } from '../types/easyink'

const store = useEasyInkStore()
const defaults = defaultLogQuery()
const filters = reactive({
  startTime: toDateTimeLocal(defaults.startTime),
  endTime: toDateTimeLocal(defaults.endTime),
  printerName: '',
  userId: '',
  status: '',
  limit: 100
})

function buildQuery(): LogQuery {
  return {
    startTime: fromDateTimeLocal(filters.startTime),
    endTime: fromDateTimeLocal(filters.endTime),
    printerName: filters.printerName || undefined,
    userId: filters.userId || undefined,
    status: filters.status || undefined,
    limit: filters.limit
  }
}

async function search(): Promise<void> {
  await store.refreshLogs(buildQuery())
}

async function exportCsv(): Promise<void> {
  const { csv } = await store.exportLogsCsv({ ...buildQuery(), limit: 500 })
  const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `easyink-audit-${new Date().toISOString().slice(0, 10)}.csv`
  link.click()
  URL.revokeObjectURL(url)
}

function toDateTimeLocal(value?: string): string {
  if (!value) return ''
  const date = new Date(value)
  const offset = date.getTimezoneOffset() * 60000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

function fromDateTimeLocal(value: string): string | undefined {
  return value ? new Date(value).toISOString() : undefined
}
</script>

<template>
  <section class="content-band">
    <div class="section-title">
      <h2>日志</h2>
      <div class="topbar-actions">
        <UiButton variant="secondary" @click="search">
          <Search :size="16" />
          查询
        </UiButton>
        <UiButton variant="secondary" @click="store.refreshLogs(buildQuery())">
          <RefreshCw :size="16" />
          刷新
        </UiButton>
        <UiButton @click="exportCsv">
          <Download :size="16" />
          CSV
        </UiButton>
      </div>
    </div>

    <div class="filter-grid">
      <label class="field">
        <span>开始时间</span>
        <input v-model="filters.startTime" type="datetime-local" />
      </label>
      <label class="field">
        <span>结束时间</span>
        <input v-model="filters.endTime" type="datetime-local" />
      </label>
      <label class="field">
        <span>打印机</span>
        <select v-model="filters.printerName">
          <option value="">全部打印机</option>
          <option v-for="printer in store.printers" :key="printer.name" :value="printer.name">
            {{ printer.displayName || printer.name }}
          </option>
        </select>
      </label>
      <label class="field">
        <span>用户</span>
        <input v-model="filters.userId" placeholder="userId" />
      </label>
      <label class="field">
        <span>状态</span>
        <select v-model="filters.status">
          <option value="">全部状态</option>
          <option value="Completed">Completed</option>
          <option value="Failed">Failed</option>
        </select>
      </label>
      <label class="field">
        <span>数量</span>
        <input v-model.number="filters.limit" type="number" min="1" max="500" />
      </label>
    </div>

    <div class="table table--logs">
      <div class="table-row table-head">
        <span>时间</span>
        <span>打印机</span>
        <span>状态</span>
        <span>用户</span>
        <span>标签类型</span>
        <span>JobId</span>
        <span>错误</span>
      </div>
      <div v-for="log in store.logs" :key="log.id" class="table-row">
        <span>{{ new Date(log.timestamp ?? log.createdAt).toLocaleString() }}</span>
        <span>{{ log.printerName || '-' }}</span>
        <UiBadge :tone="log.success ? 'good' : 'bad'">{{ log.status }}</UiBadge>
        <span>{{ log.userId ?? '-' }}</span>
        <span>{{ log.labelType ?? log.sourceType ?? '-' }}</span>
        <span class="mono">{{ log.jobId ?? '-' }}</span>
        <span class="mono">{{ log.errorMessage ?? '-' }}</span>
      </div>
      <div v-if="store.logs.length === 0" class="empty-state">暂无审计记录</div>
    </div>
  </section>
</template>
