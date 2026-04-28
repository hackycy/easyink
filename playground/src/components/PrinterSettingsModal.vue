<script setup lang="ts">
import type { AcceptableValue } from 'reka-ui'
import { computed } from 'vue'
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

function handleUrlInput(e: Event) {
  printer.updateConfig({ printerServiceUrl: (e.target as HTMLInputElement).value })
}

function handlePaperSizeInput(e: Event) {
  const v = Number((e.target as HTMLInputElement).value)
  printer.updateConfig({ printerPaperSize: Number.isFinite(v) && v > 0 ? v : 1 })
}

function handleCopiesInput(e: Event) {
  const v = Number((e.target as HTMLInputElement).value)
  printer.updateConfig({ printCopies: Number.isFinite(v) && v >= 1 ? v : 1 })
}

function handleDeviceChange(val: AcceptableValue) {
  const printerDevice = typeof val === 'string' || typeof val === 'number' || typeof val === 'bigint'
    ? String(val)
    : undefined

  printer.updateConfig({ printerDevice })
}
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
            :value="printer.serviceUrl.value"
            :disabled="!printer.enabled.value"
            placeholder="http://localhost:17521"
            @input="handleUrlInput"
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
            :model-value="printer.printerDevice.value ?? ''"
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

        <!-- Paper Size -->
        <div class="space-y-1.5">
          <Label>纸张宽度 (mm)</Label>
          <Input
            type="number"
            :value="printer.paperSize.value"
            :min="1"
            :disabled="!printer.enabled.value"
            @input="handlePaperSizeInput"
          />
        </div>

        <!-- Copies -->
        <div class="space-y-1.5">
          <Label>打印份数</Label>
          <Input
            type="number"
            :value="printer.copies.value"
            :min="1"
            :max="99"
            :disabled="!printer.enabled.value"
            @input="handleCopiesInput"
          />
        </div>
      </div>
    </DialogContent>
  </Dialog>
</template>
