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
import { usePrinter } from '../hooks/useHiPrint'

const emit = defineEmits<{
  close: []
}>()

const hiPrint = usePrinter()

const statusText = computed(() => {
  if (!hiPrint.enabled.value)
    return '未启用'
  switch (hiPrint.connectionState.value) {
    case 'connected': return '已连接'
    case 'connecting': return '连接中...'
    case 'error': return hiPrint.lastError.value || '连接失败'
    default: return '未连接'
  }
})

const statusColor = computed(() => {
  if (!hiPrint.enabled.value)
    return 'text-muted-foreground'
  switch (hiPrint.connectionState.value) {
    case 'connected': return 'text-green-600'
    case 'connecting': return 'text-amber-500'
    case 'error': return 'text-red-500'
    default: return 'text-red-500'
  }
})

function handleToggleService(checked: boolean) {
  hiPrint.setEnabled(checked)
}

async function handleConnect() {
  try {
    await hiPrint.connect()
    toast.success('已连接到 HiPrint 客户端')
  }
  catch (e) {
    toast.error(e instanceof Error ? e.message : '连接 HiPrint 失败')
  }
}

async function handleRefreshDevices() {
  try {
    const list = await hiPrint.refreshDevices()
    if (list.length === 0)
      toast.info('未发现可用的本机打印机')
    else
      toast.success(`发现 ${list.length} 台本机打印机`)
  }
  catch (e) {
    toast.error(e instanceof Error ? e.message : '刷新 HiPrint 打印机失败')
  }
}

function handleUrlChange(value: string | number) {
  hiPrint.updateConfig({ printerServiceUrl: String(value) })
}

function handleCopiesChange(value: string | number) {
  const v = Number(value)
  hiPrint.updateConfig({ printCopies: Number.isFinite(v) && v >= 1 ? Math.min(99, Math.trunc(v)) : 1 })
}

function handleDeviceChange(value: AcceptableValue) {
  const printerDevice = typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint'
    ? String(value)
    : undefined

  hiPrint.updateConfig({ printerDevice })
}

function handleToggleForcePageSize(checked: boolean) {
  hiPrint.setForcePageSize(checked)
}

async function syncPrinterForm() {
  if (!hiPrint.enabled.value)
    return

  try {
    if (!hiPrint.isConnected.value)
      await hiPrint.connect()

    if (hiPrint.devices.value.length === 0)
      await hiPrint.refreshDevices()
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
      sr-description="配置 HiPrint 客户端地址、本机打印机和默认打印份数"
    >
      <DialogHeader>
        <DialogTitle>HiPrint 设置</DialogTitle>
      </DialogHeader>

      <div class="space-y-4 py-2">
        <!-- Enable -->
        <div class="flex items-center justify-between">
          <Label>启用 HiPrint</Label>
          <Switch
            :model-value="hiPrint.enabled.value"
            @update:model-value="handleToggleService"
          />
        </div>

        <!-- Status -->
        <div class="space-y-1.5">
          <Label>HiPrint 状态</Label>
          <div class="flex items-center gap-2">
            <span class="text-sm" :class="statusColor">{{ statusText }}</span>
            <Button
              v-if="hiPrint.enabled.value && hiPrint.connectionState.value !== 'connected'"
              variant="outline"
              size="xs"
              :disabled="hiPrint.isConnecting.value"
              @click="handleConnect"
            >
              {{ hiPrint.isConnecting.value ? '连接中...' : '连接 HiPrint' }}
            </Button>
          </div>
        </div>

        <!-- Service URL -->
        <div class="space-y-1.5">
          <Label>HiPrint 地址</Label>
          <Input
            :model-value="hiPrint.serviceUrl.value"
            :disabled="!hiPrint.enabled.value"
            placeholder="http://localhost:17521"
            @update:model-value="handleUrlChange"
          />
        </div>

        <!-- Device -->
        <div class="space-y-1.5">
          <div class="flex items-center justify-between">
            <Label>本机打印机</Label>
            <Button
              v-if="hiPrint.enabled.value"
              variant="outline"
              size="xs"
              :disabled="!hiPrint.isConnected.value"
              @click="handleRefreshDevices"
            >
              刷新
            </Button>
          </div>
          <Select
            :model-value="hiPrint.printerDevice.value"
            :disabled="!hiPrint.enabled.value || !hiPrint.isConnected.value || hiPrint.devices.value.length === 0"
            @update:model-value="handleDeviceChange"
          >
            <SelectTrigger>
              <SelectValue placeholder="请选择打印机" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem
                v-for="d in hiPrint.devices.value"
                :key="d.name"
                :value="d.name"
              >
                {{ d.displayName }}{{ d.isDefault ? ' (默认)' : '' }}
              </SelectItem>
            </SelectContent>
          </Select>
          <p
            v-if="hiPrint.enabled.value && hiPrint.isConnected.value && hiPrint.devices.value.length === 0"
            class="text-xs text-muted-foreground"
          >
            未发现可用的本机打印机，请检查系统打印机状态后点击刷新
          </p>
        </div>

        <!-- Copies -->
        <div class="space-y-1.5">
          <Label>默认打印份数</Label>
          <Input
            type="number"
            :model-value="hiPrint.copies.value"
            :min="1"
            :max="99"
            :disabled="!hiPrint.enabled.value"
            @update:model-value="handleCopiesChange"
          />
        </div>

        <!-- Force pageSize -->
        <div class="space-y-1.5">
          <div class="flex items-center justify-between">
            <Label>强制使用模板纸张尺寸</Label>
            <Switch
              :model-value="hiPrint.forcePageSize.value"
              :disabled="!hiPrint.enabled.value"
              @update:model-value="handleToggleForcePageSize"
            />
          </div>
          <p class="text-xs text-muted-foreground">
            默认关闭：由 HiPrint 和打印机驱动协商当前介质，小票机、连续纸、普通打印机通常应保持关闭。
            如果某些自定义纸张驱动会回退到 A4 缩印，再在这里全局开启显式尺寸。
          </p>
        </div>
      </div>
    </DialogContent>
  </Dialog>
</template>
