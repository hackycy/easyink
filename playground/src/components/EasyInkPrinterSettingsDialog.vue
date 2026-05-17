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
import { useEasyInkPrint } from '@/hooks/useEasyInkPrint'

const emit = defineEmits<{
  close: []
}>()

const printService = useEasyInkPrint()

const statusText = computed(() => {
  if (!printService.enabled.value)
    return '未启用'
  switch (printService.connectionState.value) {
    case 'connected': return '已连接'
    case 'connecting': return '连接中...'
    case 'error': return printService.lastError.value || '连接失败'
    default: return '未连接'
  }
})

const statusColor = computed(() => {
  if (!printService.enabled.value)
    return 'text-muted-foreground'
  switch (printService.connectionState.value) {
    case 'connected': return 'text-green-600'
    case 'connecting': return 'text-amber-500'
    case 'error': return 'text-red-500'
    default: return 'text-red-500'
  }
})

const activeJobs = computed(() => {
  return Array.from(printService.jobs.values()).filter(
    j => j.status === 'queued' || j.status === 'printing',
  )
})

function handleToggleService(checked: boolean) {
  printService.setEnabled(checked)
}

async function handleConnect() {
  try {
    await printService.connect()
    toast.success('已连接到 EasyInk Printer 服务')
  }
  catch (e) {
    toast.error(e instanceof Error ? e.message : '连接 EasyInk Printer 服务失败')
  }
}

async function handleRefreshDevices() {
  try {
    const list = await printService.refreshDevices()
    if (list.length === 0)
      toast.info('服务未返回可用打印机')
    else
      toast.success(`服务返回 ${list.length} 台打印机`)
  }
  catch (e) {
    toast.error(e instanceof Error ? e.message : '刷新 EasyInk Printer 打印机失败')
  }
}

function handleUrlChange(value: string | number) {
  printService.updateConfig({ serviceUrl: String(value) })
}

function handleApiKeyChange(value: string | number) {
  printService.updateConfig({ apiKey: String(value) || undefined })
}

function handleCopiesChange(value: string | number) {
  const v = Number(value)
  printService.updateConfig({ copies: Number.isFinite(v) && v >= 1 ? Math.min(99, Math.trunc(v)) : 1 })
}

function handleForcePageSizeChange(checked: boolean) {
  printService.updateConfig({ forcePageSize: checked })
}

function handleAuditUserIdChange(value: string | number) {
  printService.updateConfig({
    userData: {
      ...printService.config.userData,
      userId: String(value),
    },
  })
}

function handleAuditLabelTypeChange(value: string | number) {
  printService.updateConfig({
    userData: {
      ...printService.config.userData,
      labelType: String(value),
    },
  })
}

function handleDeviceChange(value: AcceptableValue) {
  const printerName = typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint'
    ? String(value)
    : undefined
  printService.updateConfig({ printerName })
}

async function syncPrinterForm() {
  if (!printService.enabled.value)
    return
  try {
    await printService.refreshDevices()
  }
  catch (e) {
    toast.error(e instanceof Error ? e.message : '连接 EasyInk Printer 服务失败')
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
      sr-description="配置 EasyInk Printer 服务地址、目标打印机、默认打印份数和审计演示字段"
    >
      <DialogHeader>
        <DialogTitle>EasyInk Printer 设置</DialogTitle>
      </DialogHeader>

      <div class="space-y-4 py-2">
        <!-- Enable -->
        <div class="flex items-center justify-between">
          <Label>启用 EasyInk Printer</Label>
          <Switch
            :model-value="printService.enabled.value"
            @update:model-value="handleToggleService"
          />
        </div>

        <!-- Status -->
        <div class="space-y-1.5">
          <Label>服务状态</Label>
          <div class="flex items-center gap-2">
            <span class="text-sm" :class="statusColor">{{ statusText }}</span>
            <Button
              v-if="printService.enabled.value && printService.connectionState.value !== 'connected'"
              variant="outline"
              size="xs"
              :disabled="printService.isConnecting.value"
              @click="handleConnect"
            >
              {{ printService.isConnecting.value ? '连接中...' : '连接服务' }}
            </Button>
          </div>
        </div>

        <!-- Service URL -->
        <div class="space-y-1.5">
          <Label>EasyInk Printer 地址</Label>
          <Input
            :model-value="printService.serviceUrl.value"
            :disabled="!printService.enabled.value"
            placeholder="http://localhost:18080"
            @update:model-value="handleUrlChange"
          />
        </div>

        <!-- API Key -->
        <div class="space-y-1.5">
          <Label>服务 API Key（可选）</Label>
          <Input
            :model-value="printService.config.apiKey ?? ''"
            :disabled="!printService.enabled.value"
            placeholder="留空则不验证"
            @update:model-value="handleApiKeyChange"
          />
        </div>

        <!-- Device -->
        <div class="space-y-1.5">
          <div class="flex items-center justify-between">
            <Label>目标打印机</Label>
            <Button
              v-if="printService.enabled.value"
              variant="outline"
              size="xs"
              @click="handleRefreshDevices"
            >
              刷新
            </Button>
          </div>
          <Select
            :model-value="printService.printerName.value"
            :disabled="!printService.enabled.value || printService.devices.value.length === 0"
            @update:model-value="handleDeviceChange"
          >
            <SelectTrigger>
              <SelectValue placeholder="请选择打印机" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem
                v-for="d in printService.devices.value"
                :key="d.name"
                :value="d.name"
              >
                {{ d.name }}{{ d.isDefault ? ' (默认)' : '' }}
              </SelectItem>
            </SelectContent>
          </Select>
          <p
            v-if="printService.enabled.value && printService.isConnected.value && printService.devices.value.length === 0"
            class="text-xs text-muted-foreground"
          >
            服务已连接，但未返回打印机，请检查服务端可见的打印机后点击刷新
          </p>
        </div>

        <!-- Copies -->
        <div class="space-y-1.5">
          <Label>默认打印份数</Label>
          <Input
            type="number"
            :model-value="printService.copies.value"
            :min="1"
            :max="99"
            :disabled="!printService.enabled.value"
            @update:model-value="handleCopiesChange"
          />
        </div>

        <div class="flex items-start justify-between gap-4">
          <div class="space-y-1">
            <Label>强制传纸张尺寸</Label>
            <p class="text-xs text-muted-foreground">
              关闭时不传 paperSize，由打印机驱动按当前介质决定；仅在标签机必须显式指定尺寸时开启。
            </p>
          </div>
          <Switch
            :model-value="printService.forcePageSize.value"
            :disabled="!printService.enabled.value"
            @update:model-value="handleForcePageSizeChange"
          />
        </div>

        <div class="space-y-3 rounded-lg border border-dashed border-border/80 bg-muted/30 p-3">
          <div class="space-y-1">
            <Label>审计演示</Label>
            <p class="text-xs text-muted-foreground">
              这里的 UserId 和 LabelType 会随打印请求一起发送，打印后可在 EasyInk Printer 审计日志中看到对应两列。留空则不发送。
            </p>
          </div>
          <div class="grid gap-3 sm:grid-cols-2">
            <div class="space-y-1.5">
              <Label>UserId</Label>
              <Input
                :model-value="printService.config.userData?.userId ?? ''"
                :disabled="!printService.enabled.value"
                placeholder="demo-user-001"
                @update:model-value="handleAuditUserIdChange"
              />
            </div>
            <div class="space-y-1.5">
              <Label>LabelType</Label>
              <Input
                :model-value="printService.config.userData?.labelType ?? ''"
                :disabled="!printService.enabled.value"
                placeholder="shipping-label"
                @update:model-value="handleAuditLabelTypeChange"
              />
            </div>
          </div>
        </div>

        <!-- Active jobs -->
        <div v-if="activeJobs.length > 0" class="space-y-1.5">
          <Label>EasyInk Printer 任务</Label>
          <div class="space-y-1 text-xs">
            <div
              v-for="job in activeJobs"
              :key="job.jobId"
              class="flex items-center justify-between text-muted-foreground"
            >
              <span class="truncate max-w-[200px]">{{ job.jobId }}</span>
              <span>{{ job.status }}</span>
            </div>
          </div>
        </div>
      </div>
    </DialogContent>
  </Dialog>
</template>
