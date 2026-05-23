<script setup lang="ts">
import { computed, ref } from 'vue'
import { RefreshCw } from 'lucide-vue-next'
import UiBadge from '../components/ui/Badge.vue'
import UiButton from '../components/ui/Button.vue'
import { useEasyInkStore } from '../stores/easyink'

const store = useEasyInkStore()
const selectedPrinterName = ref('')

const selectedPrinter = computed(
  () =>
    store.printers.find((printer) => printer.name === selectedPrinterName.value) ??
    store.printers[0]
)

function statusTone(statusCode: string): 'good' | 'warn' | 'bad' {
  if (statusCode === 'READY') return 'good'
  if (statusCode === 'UNKNOWN') return 'warn'
  return 'bad'
}

function printerStatusMessage(statusCode: string): string {
  if (statusCode === 'READY') return '打印机就绪'
  if (statusCode === 'PRINTER_OFFLINE') return '打印机离线'
  if (statusCode === 'PAPER_JAM') return '打印机卡纸'
  if (statusCode === 'PAPER_OUT') return '打印机缺纸'
  if (statusCode === 'PRINTER_STOPPED') return '打印机已停止'
  return '打印机状态异常'
}
</script>

<template>
  <section class="content-band">
    <div class="section-title">
      <h2>打印机</h2>
      <UiButton variant="secondary" @click="store.refreshAll">
        <RefreshCw :size="16" />
        刷新
      </UiButton>
    </div>

    <div class="table table--printers-page">
      <div class="table-row table-head">
        <span>名称</span>
        <span>默认</span>
        <span>在线</span>
        <span>状态消息</span>
        <span>系统状态</span>
      </div>
      <button
        v-for="printer in store.printers"
        :key="printer.name"
        type="button"
        class="table-row table-button-row"
        :class="{ active: selectedPrinter?.name === printer.name }"
        @click="selectedPrinterName = printer.name"
      >
        <span>
          <strong>{{ printer.displayName || printer.name }}</strong>
          <small>{{ printer.name }}</small>
        </span>
        <UiBadge :tone="printer.isDefault ? 'good' : 'neutral'">{{
          printer.isDefault ? '默认' : '否'
        }}</UiBadge>
        <UiBadge :tone="statusTone(printer.statusCode)">{{ printer.statusCode }}</UiBadge>
        <span>{{ printerStatusMessage(printer.statusCode) }}</span>
        <span>{{ printer.status ?? '-' }}</span>
      </button>
      <div v-if="store.printers.length === 0" class="empty-state">暂无打印机</div>
    </div>
  </section>

  <section v-if="selectedPrinter" class="content-band">
    <div class="section-title">
      <h2>设备信息</h2>
      <UiBadge :tone="statusTone(selectedPrinter.statusCode)">{{
        selectedPrinter.statusCode
      }}</UiBadge>
    </div>
    <div class="detail-grid">
      <div class="info-row">
        <span>显示名称</span>
        <strong>{{ selectedPrinter.displayName || selectedPrinter.name }}</strong>
      </div>
      <div class="info-row">
        <span>设备名称</span>
        <strong>{{ selectedPrinter.name }}</strong>
      </div>
      <div class="info-row">
        <span>描述</span>
        <strong>{{ selectedPrinter.description || '-' }}</strong>
      </div>
      <div class="info-row">
        <span>是否默认</span>
        <strong>{{ selectedPrinter.isDefault ? '是' : '否' }}</strong>
      </div>
      <div class="info-row">
        <span>是否在线</span>
        <strong>{{ selectedPrinter.statusCode === 'READY' ? '是' : '否' }}</strong>
      </div>
      <div class="info-row">
        <span>是否有纸</span>
        <strong>{{ selectedPrinter.statusCode === 'PAPER_OUT' ? '缺纸' : '未报告缺纸' }}</strong>
      </div>
    </div>
    <pre class="json-preview">{{ JSON.stringify(selectedPrinter.options ?? {}, null, 2) }}</pre>
  </section>
</template>
