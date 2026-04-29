<script setup lang="ts">
import type { AcceptableValue } from 'reka-ui'
import { computed, onMounted } from 'vue'
import { toast } from 'vue-sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { usePrinter } from '../hooks/usePrinter'

const emit = defineEmits<{
  close: []
}>()

const printer = usePrinter()

const statusText = computed(() => {
  if (!printer.enabled.value)
    return '未启用'
  switch (printer.connectionState.value) {
    case 'connected': return '已连接'
    case 'connecting': return '连接中…'
    case 'error': return printer.lastError.value || '连接失败'
    default: return '未连接'
  }
})

const statusColor = computed(() => {
  if (!printer.enabled.value)
    return 'text-muted-foreground'
  switch (printer.connectionState.value) {
    case 'connected': return 'text-green-600'
    case 'connecting': return 'text-amber-500'
    case 'error': return 'text-red-500'
    default: return 'text-red-500'
  }
})

function handleToggleService(checked: boolean) {
  printer.setEnabled(checked)
}

async function handleConnect() {
  try {
    await printer.connect()
    toast.success('已连接到打印服务')
  }
  catch (e) {
    toast.error(e instanceof Error ? e.message : '连接失败')
  }
}

async function handleRefreshDevices() {
  try {
    const list = await printer.refreshDevices()
    if (list.length === 0)
      toast.info('未发现可用打印机')
    else
      toast.success(`发现 ${list.length} 台打印机`)
  }
  catch (e) {
    toast.error(e instanceof Error ? e.message : '刷新失败')
  }
}

function handleUrlChange(value: string | number) {
  printer.updateConfig({ printerServiceUrl: String(value) })
}

function handleCopiesChange(value: string | number) {
  const v = Number(value)
  printer.updateConfig({ printCopies: Number.isFinite(v) && v >= 1 ? Math.min(99, Math.trunc(v)) : 1 })
}

function handleDeviceChange(value: AcceptableValue) {
  const printerDevice = typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint'
    ? String(value)
    : undefined

  printer.updateConfig({ printerDevice })
}

const forcePageSize = computed(() =>
  printer.isForcePageSize(printer.printerDevice.value),
)

function handleToggleForcePageSize(checked: boolean) {
  const device = printer.printerDevice.value
  if (!device)
    return
  printer.setForcePageSize(device, checked)
}

async function syncPrinterForm() {
  if (!printer.enabled.value)
    return

  try {
    if (!printer.isConnected.value)
      await printer.connect()

    if (printer.devices.value.length === 0)
      await printer.refreshDevices()
  }
  catch {
    // Keep the modal usable even if service discovery fails on open.
  }
}

onMounted(() => {
  void syncPrinterForm()
})
</script>

<template>
  <Dialog :open="true" @update:open="(val) => { if (!val) emit('close') }">
    <DialogContent
      class="max-w-[560px]"
      sr-description="配置 HiPrint 打印服务连接、打印机、纸张和份数"
    >
      <DialogHeader>
        <DialogTitle>打印机设置</DialogTitle>
      </DialogHeader>

      <div class="space-y-4 py-2">
        <!-- Enable -->
        <div class="flex items-center justify-between">
          <Label>启用打印服务</Label>
          <Switch
            :model-value="printer.enabled.value"
            @update:model-value="handleToggleService"
          />
        </div>

        <!-- Status -->
        <div class="space-y-1.5">
          <Label>连接状态</Label>
          <div class="flex items-center gap-2">
            <span class="text-sm" :class="statusColor">{{ statusText }}</span>
            <Button
              v-if="printer.enabled.value && printer.connectionState.value !== 'connected'"
              variant="outline"
              size="xs"
              :disabled="printer.isConnecting.value"
              @click="handleConnect"
            >
              {{ printer.isConnecting.value ? '连接中…' : '连接' }}
            </Button>
          </div>
        </div>

        <!-- Service URL -->
        <div class="space-y-1.5">
          <Label>打印服务地址</Label>
          <Input
            :model-value="printer.serviceUrl.value"
            :disabled="!printer.enabled.value"
            placeholder="http://localhost:17521"
            @update:model-value="handleUrlChange"
          />
        </div>

        <!-- Device -->
        <div class="space-y-1.5">
          <div class="flex items-center justify-between">
            <Label>打印机</Label>
            <Button
              v-if="printer.enabled.value"
              variant="outline"
              size="xs"
              :disabled="!printer.isConnected.value"
              @click="handleRefreshDevices"
            >
              刷新
            </Button>
          </div>
          <Select
            :model-value="printer.printerDevice.value"
            :disabled="!printer.enabled.value || !printer.isConnected.value || printer.devices.value.length === 0"
            @update:model-value="handleDeviceChange"
          >
            <SelectTrigger>
              <SelectValue placeholder="请选择打印机" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem
                v-for="d in printer.devices.value"
                :key="d.name"
                :value="d.name"
              >
                {{ d.displayName }}{{ d.isDefault ? ' (默认)' : '' }}
              </SelectItem>
            </SelectContent>
          </Select>
          <p
            v-if="printer.enabled.value && printer.isConnected.value && printer.devices.value.length === 0"
            class="text-xs text-muted-foreground"
          >
            未发现打印机，请检查打印机是否在线后点击刷新
          </p>
        </div>

        <!-- Copies -->
        <div class="space-y-1.5">
          <Label>打印份数</Label>
          <Input
            type="number"
            :model-value="printer.copies.value"
            :min="1"
            :max="99"
            :disabled="!printer.enabled.value"
            @update:model-value="handleCopiesChange"
          />
        </div>

        <!-- Force pageSize (per device) -->
        <div class="space-y-1.5">
          <div class="flex items-center justify-between">
            <Label>强制使用模板纸张尺寸</Label>
            <Switch
              :model-value="forcePageSize"
              :disabled="!printer.enabled.value || !printer.printerDevice.value"
              @update:model-value="handleToggleForcePageSize"
            />
          </div>
          <p class="text-xs text-muted-foreground">
            默认关闭: 由打印机驱动选择当前介质 (小票机、连续纸、普通打印机需要保持关闭,
            与浏览器打印一致)。 DELI 等标签机驱动会回退到 A4 缩印, 请为该设备开启。
          </p>
        </div>
      </div>
    </DialogContent>
  </Dialog>
</template>
