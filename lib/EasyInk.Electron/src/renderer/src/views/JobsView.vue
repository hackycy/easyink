<script setup lang="ts">
import UiBadge from '../components/ui/Badge.vue'
import UiButton from '../components/ui/Button.vue'
import { useEasyInkStore } from '../stores/easyink'

const store = useEasyInkStore()
</script>

<template>
  <section class="content-band">
    <div class="section-title">
      <h2>任务</h2>
      <UiButton variant="secondary" @click="store.refreshJobs">刷新</UiButton>
    </div>
    <div class="table">
      <div class="table-row table-head">
        <span>Job ID</span>
        <span>打印机</span>
        <span>状态</span>
        <span>创建时间</span>
      </div>
      <div v-for="job in store.jobs" :key="job.jobId" class="table-row">
        <span class="mono">{{ job.jobId }}</span>
        <span>{{ job.printerName }}</span>
        <UiBadge
          :tone="job.status === 'Completed' ? 'good' : job.status === 'Failed' ? 'bad' : 'warn'"
          >{{ job.status }}</UiBadge
        >
        <span>{{ new Date(job.createdAt).toLocaleString() }}</span>
      </div>
      <div v-if="store.jobs.length === 0" class="empty-state">暂无任务</div>
    </div>
  </section>
</template>
