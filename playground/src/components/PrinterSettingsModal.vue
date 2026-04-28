<script setup lang="ts">
import type { PrinterConfig, PrinterDevice } from '../hooks/usePrinter'
import { DEFAULT_PRINTER_COPIES, DEFAULT_PRINTER_HOST, DEFAULT_PRINTER_PAGE_SIZE } from '../hooks/usePrinter'
import { computed, onBeforeUnmount, onMounted, reactive } from 'vue'

const props = defineProps<{
  config: PrinterConfig
  isConnected: boolean
  printerDevices: PrinterDevice[]
}>()

const emit = defineEmits<{
  save: [config: PrinterConfig]
  connect: []
  disconnect: []
  refreshDevices: []
  close: []
}>()

const localConfig = reactive<PrinterConfig>({
  enablePrinterService: props.config.enablePrinterService,
  printerDevice: props.config.printerDevice,
  printerPaperSize: props.config.printerPaperSize ?? DEFAULT_PRINTER_PAGE_SIZE,
  printCopies: props.config.printCopies ?? DEFAULT_PRINTER_COPIES,
  printerServiceUrl: props.config.printerServiceUrl ?? DEFAULT_PRINTER_HOST,
})

const connectionStatus = computed(() => {
  if (!localConfig.enablePrinterService)
    return 'disabled'
  return props.isConnected ? 'connected' : 'disconnected'
})

const connectionStatusText = computed(() => {
  switch (connectionStatus.value) {
    case 'connected':
      return '已连接'
    case 'disconnected':
      return '未连接'
    case 'disabled':
      return '未启用'
  }
})

const connectionStatusColor = computed(() => {
  switch (connectionStatus.value) {
    case 'connected':
      return 'text-green-600'
    case 'disconnected':
      return 'text-red-600'
    case 'disabled':
      return 'text-gray-400'
  }
})

function handleToggleService(enabled: boolean) {
  localConfig.enablePrinterService = enabled
  if (enabled && !props.isConnected) {
    emit('connect')
  }
  else if (!enabled && props.isConnected) {
    emit('disconnect')
  }
}

function handleConnect() {
  emit('connect')
}

function handleRefreshDevices() {
  emit('refreshDevices')
}

function handleSave() {
  emit('save', { ...localConfig })
}

function handleKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    emit('close')
  }
}

onMounted(() => {
  document.addEventListener('keydown', handleKeyDown)
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', handleKeyDown)
})
</script>

<template>
  <div class="fixed inset-0 z-[10000] flex items-center justify-center bg-black/50" @click.self="emit('close')">
    <div class="w-full max-w-lg bg-white rounded-lg shadow-xl">
      <div class="flex items-center justify-between px-4 py-3 border-b border-border">
        <h2 class="text-base font-semibold text-text-primary">
          打印机设置
        </h2>
        <button
          class="w-6 h-6 flex items-center justify-center text-text-quaternary hover:text-text-secondary"
          @click="emit('close')"
        >
          &times;
        </button>
      </div>

      <div class="px-4 py-4 space-y-4 max-h-[70vh] overflow-y-auto">
        <!-- Enable Printer Service -->
        <div class="flex items-center justify-between">
          <label class="text-sm font-medium text-text-secondary">启用打印服务</label>
          <label class="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              class="sr-only peer"
              :checked="localConfig.enablePrinterService"
              @change="(e) => handleToggleService((e.target as HTMLInputElement).checked)"
            >
            <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary" />
          </label>
        </div>

        <!-- Connection Status -->
        <div class="flex items-center justify-between">
          <label class="text-sm font-medium text-text-secondary">连接状态</label>
          <div class="flex items-center gap-2">
            <span class="text-sm" :class="connectionStatusColor">{{ connectionStatusText }}</span>
            <button
              v-if="localConfig.enablePrinterService && !isConnected"
              class="px-2 py-1 text-xs border border-border rounded bg-white hover:bg-bg-tertiary"
              @click="handleConnect"
            >
              连接
            </button>
          </div>
        </div>

        <!-- Printer Service URL -->
        <div class="space-y-1.5">
          <label class="text-sm font-medium text-text-secondary">打印服务地址</label>
          <input
            v-model="localConfig.printerServiceUrl"
            type="text"
            class="w-full px-3 py-2 text-sm border border-border rounded focus:outline-none focus:border-primary"
            :disabled="!localConfig.enablePrinterService"
            placeholder="http://localhost:17521"
          >
        </div>

        <!-- Printer Device -->
        <div class="space-y-1.5">
          <div class="flex items-center justify-between">
            <label class="text-sm font-medium text-text-secondary">打印机</label>
            <button
              v-if="localConfig.enablePrinterService"
              class="px-2 py-1 text-xs border border-border rounded bg-white hover:bg-bg-tertiary"
              :disabled="!isConnected"
              @click="handleRefreshDevices"
            >
              刷新
            </button>
          </div>
          <select
            v-model="localConfig.printerDevice"
            class="w-full px-3 py-2 text-sm border border-border rounded focus:outline-none focus:border-primary"
            :disabled="!localConfig.enablePrinterService || !isConnected || printerDevices.length === 0"
          >
            <option v-if="printerDevices.length === 0" :value="undefined">
              {{ isConnected ? '无可用打印机' : '请先连接打印服务' }}
            </option>
            <option
              v-for="device in printerDevices"
              :key="device.name"
              :value="device.name"
            >
              {{ device.displayName }}{{ device.isDefault ? ' (默认)' : '' }}
            </option>
          </select>
        </div>

        <!-- Paper Size -->
        <div class="space-y-1.5">
          <label class="text-sm font-medium text-text-secondary">纸张宽度 (mm)</label>
          <input
            v-model.number="localConfig.printerPaperSize"
            type="number"
            min="1"
            class="w-full px-3 py-2 text-sm border border-border rounded focus:outline-none focus:border-primary"
            :disabled="!localConfig.enablePrinterService"
          >
        </div>

        <!-- Print Copies -->
        <div class="space-y-1.5">
          <label class="text-sm font-medium text-text-secondary">打印份数</label>
          <input
            v-model.number="localConfig.printCopies"
            type="number"
            min="1"
            max="99"
            class="w-full px-3 py-2 text-sm border border-border rounded focus:outline-none focus:border-primary"
            :disabled="!localConfig.enablePrinterService"
          >
        </div>
      </div>

      <div class="flex items-center justify-end gap-2 px-4 py-3 border-t border-border">
        <button
          class="px-4 py-2 text-sm border border-border rounded bg-white hover:bg-bg-tertiary"
          @click="emit('close')"
        >
          取消
        </button>
        <button
          class="px-4 py-2 text-sm border border-primary rounded bg-primary text-white hover:bg-primary-hover"
          @click="handleSave"
        >
          保存
        </button>
      </div>
    </div>
  </div>
</template>
