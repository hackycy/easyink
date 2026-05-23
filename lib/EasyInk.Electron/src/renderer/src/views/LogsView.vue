<script setup lang="ts">
import UiBadge from '../components/ui/Badge.vue'
import UiButton from '../components/ui/Button.vue'
import { useEasyInkStore } from '../stores/easyink'

const store = useEasyInkStore()
</script>

<template>
  <section class="content-band">
    <div class="section-title">
      <h2>审计</h2>
      <UiButton variant="secondary" @click="store.refreshLogs">刷新</UiButton>
    </div>
    <div class="table">
      <div class="table-row table-head">
        <span>时间</span>
        <span>命令</span>
        <span>来源</span>
        <span>状态</span>
      </div>
      <div v-for="log in store.logs" :key="log.id" class="table-row">
        <span>{{ new Date(log.timestamp ?? log.createdAt).toLocaleString() }}</span>
        <span>{{ log.command ?? '-' }}</span>
        <span>{{ log.sourceType ?? '-' }}</span>
        <UiBadge :tone="log.success ? 'good' : 'bad'">{{ log.status }}</UiBadge>
      </div>
      <div v-if="store.logs.length === 0" class="empty-state">暂无审计记录</div>
    </div>
  </section>
</template>
