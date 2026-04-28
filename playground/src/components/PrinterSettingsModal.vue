<script setup lang="ts">
import type { PrinterConfig, PrinterDevice } from '../hooks/usePrinter'
import { IconClose } from '@easyink/icons'
import { computed, onBeforeUnmount, onMounted, reactive } from 'vue'
import { DEFAULT_PRINTER_COPIES, DEFAULT_PRINTER_HOST, DEFAULT_PRINTER_PAGE_SIZE } from '../hooks/usePrinter'

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
    default:
      return '未知状态'
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
    default:
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
  <a-modal
    :open="true"
    title="打印机设置"
    width="540px"
    @cancel="emit('close')"
    @ok="handleSave"
  >
    <a-form layout="vertical" class="space-y-4">
      <!-- Enable Printer Service -->
      <a-form-item label="启用打印服务">
        <a-switch
          :checked="localConfig.enablePrinterService"
          @change="(checked: boolean) => handleToggleService(checked)"
        />
      </a-form-item>

      <!-- Connection Status -->
      <a-form-item label="连接状态">
        <div class="flex items-center gap-2">
          <span class="text-sm" :class="connectionStatusColor">{{ connectionStatusText }}</span>
          <a-button
            v-if="localConfig.enablePrinterService && !isConnected"
            size="small"
            @click="handleConnect"
          >
            连接
          </a-button>
        </div>
      </a-form-item>

      <!-- Printer Service URL -->
      <a-form-item label="打印服务地址">
        <a-input
          v-model:value="localConfig.printerServiceUrl"
          :disabled="!localConfig.enablePrinterService"
          placeholder="http://localhost:17521"
        />
      </a-form-item>

      <!-- Printer Device -->
      <a-form-item label="打印机">
        <template #extra>
          <a-button
            v-if="localConfig.enablePrinterService"
            size="small"
            :disabled="!isConnected"
            @click="handleRefreshDevices"
          >
            刷新
          </a-button>
        </template>
        <a-select
          v-model:value="localConfig.printerDevice"
          :disabled="!localConfig.enablePrinterService || !isConnected || printerDevices.length === 0"
          :options="printerDevices.map(d => ({ label: `${d.displayName}${d.isDefault ? ' (默认)' : ''}`, value: d.name }))"
          placeholder="请选择打印机"
        />
      </a-form-item>

      <!-- Paper Size -->
      <a-form-item label="纸张宽度 (mm)">
        <a-input-number
          v-model:value="localConfig.printerPaperSize"
          :min="1"
          :disabled="!localConfig.enablePrinterService"
          class="w-full"
        />
      </a-form-item>

      <!-- Print Copies -->
      <a-form-item label="打印份数">
        <a-input-number
          v-model:value="localConfig.printCopies"
          :min="1"
          :max="99"
          :disabled="!localConfig.enablePrinterService"
          class="w-full"
        />
      </a-form-item>
    </a-form>

    <template #footer>
      <a-button @click="emit('close')">
        取消
      </a-button>
      <a-button type="primary" @click="handleSave">
        保存
      </a-button>
    </template>
  </a-modal>
</template>
