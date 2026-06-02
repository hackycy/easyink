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
import { useLodopPrint } from '@/hooks/useLodopPrint'

const emit = defineEmits<{
  close: []
}>()

const lodop = useLodopPrint()

const statusText = computed(() => {
  if (!lodop.enabled.value)
    return '未启用'
  switch (lodop.connectionState.value) {
    case 'connected': return '可用'
    case 'connecting': return '检测中...'
    case 'error': return lodop.lastError.value || '不可用'
    default: return '未检测'
  }
})

const statusColor = computed(() => {
  if (!lodop.enabled.value)
    return 'text-muted-foreground'
  switch (lodop.connectionState.value) {
    case 'connected': return 'text-green-600'
    case 'connecting': return 'text-amber-500'
    case 'error': return 'text-red-500'
    default: return 'text-muted-foreground'
  }
})

function handleToggleEnabled(checked: boolean) {
  lodop.setEnabled(checked)
}

function handleToggleScript(checked: boolean) {
  lodop.updateConfig({ manageScript: checked })
}

function handleScriptUrlChange(value: string | number) {
  lodop.updateConfig({ scriptUrl: String(value).trim() })
}

function handleRuntimeNameChange(value: string | number) {
  lodop.updateConfig({ runtimeName: String(value) })
}

function handleCopiesChange(value: string | number) {
  lodop.updateConfig({ copies: Number(value) })
}

function handleForcePageSizeChange(checked: boolean) {
  lodop.updateConfig({ forcePageSize: checked })
}

function handleDeviceChange(value: AcceptableValue) {
  const printerName = typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint'
    ? String(value)
    : undefined
  lodop.updateConfig({ printerName })
}

async function handleTestAvailability() {
  try {
    const runtime = await lodop.testAvailability()
    const version = runtime.CVERSION
      ? `C-Lodop ${runtime.CVERSION} / Lodop ${runtime.VERSION ?? '-'}`
      : `Lodop ${runtime.VERSION ?? '-'}`
    toast.success(`LODOP 可用：${version}`)
  }
  catch (error) {
    toast.error(error instanceof Error ? error.message : 'LODOP 不可用')
  }
}

async function handleRefreshDevices() {
  try {
    const list = await lodop.refreshDevices()
    if (list.length === 0)
      toast.info('未发现可用的本机打印机')
    else
      toast.success(`发现 ${list.length} 台本机打印机`)
  }
  catch (error) {
    toast.error(error instanceof Error ? error.message : '刷新 LODOP 打印机失败')
  }
}

async function syncPrinterForm() {
  if (!lodop.enabled.value)
    return

  try {
    if (!lodop.isConnected.value)
      await lodop.connect()
    if (lodop.devices.value.length === 0)
      await lodop.refreshDevices()
  }
  catch {
    // Keep the modal editable when LODOP is not available.
  }
}

onMounted(() => {
  void syncPrinterForm()
})
</script>

<template>
  <Dialog :open="true" @update:open="(val) => { if (!val) emit('close') }">
    <DialogContent
      class="max-w-[580px]"
      sr-description="配置 LODOP 脚本加载、运行时名称、本机打印机和默认打印份数"
    >
      <DialogHeader>
        <DialogTitle>LODOP 设置</DialogTitle>
      </DialogHeader>

      <div class="space-y-4 py-2">
        <div class="flex items-center justify-between">
          <Label>启用 LODOP</Label>
          <Switch
            :model-value="lodop.enabled.value"
            @update:model-value="handleToggleEnabled"
          />
        </div>

        <div class="space-y-1.5">
          <Label>LODOP 状态</Label>
          <div class="flex flex-wrap items-center gap-2">
            <span class="min-w-0 break-all text-sm" :class="statusColor">{{ statusText }}</span>
            <Button
              v-if="lodop.enabled.value"
              variant="outline"
              size="xs"
              class="shrink-0"
              :disabled="lodop.isConnecting.value"
              @click="handleTestAvailability"
            >
              {{ lodop.isConnecting.value ? '检测中...' : '测试 LODOP' }}
            </Button>
          </div>
        </div>

        <div class="flex items-start justify-between gap-4">
          <div class="space-y-1">
            <Label>由 SDK 加载脚本</Label>
            <p class="text-xs text-muted-foreground">
              关闭时使用页面中已有的 getLodop、getCLodop 或命名运行时。
            </p>
          </div>
          <Switch
            :model-value="lodop.manageScript.value"
            :disabled="!lodop.enabled.value"
            @update:model-value="handleToggleScript"
          />
        </div>

        <div class="space-y-1.5">
          <Label>C-Lodop 脚本地址</Label>
          <Input
            :model-value="lodop.scriptUrl.value"
            :disabled="!lodop.enabled.value || !lodop.manageScript.value"
            placeholder="http://localhost:8000/CLodopfuncs.js"
            @update:model-value="handleScriptUrlChange"
          />
        </div>

        <div class="space-y-1.5">
          <Label>运行时名称</Label>
          <Input
            :model-value="lodop.runtimeName.value ?? ''"
            :disabled="!lodop.enabled.value"
            placeholder="CLODOPA"
            @update:model-value="handleRuntimeNameChange"
          />
        </div>

        <div class="space-y-1.5">
          <div class="flex items-center justify-between">
            <Label>本机打印机</Label>
            <Button
              v-if="lodop.enabled.value"
              variant="outline"
              size="xs"
              :disabled="!lodop.isConnected.value"
              @click="handleRefreshDevices"
            >
              刷新
            </Button>
          </div>
          <Select
            :model-value="lodop.printerName.value"
            :disabled="!lodop.enabled.value || !lodop.isConnected.value || lodop.devices.value.length === 0"
            @update:model-value="handleDeviceChange"
          >
            <SelectTrigger>
              <SelectValue placeholder="使用默认打印机" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem
                v-for="device in lodop.devices.value"
                :key="device.name"
                :value="device.name"
              >
                {{ device.displayName ?? device.name }}{{ device.isDefault ? ' (默认)' : '' }}
              </SelectItem>
            </SelectContent>
          </Select>
          <p
            v-if="lodop.enabled.value && lodop.isConnected.value && lodop.devices.value.length === 0"
            class="text-xs text-muted-foreground"
          >
            未发现可用的本机打印机，请检查系统打印机状态后点击刷新
          </p>
        </div>

        <div class="space-y-1.5">
          <Label>默认打印份数</Label>
          <Input
            type="number"
            :model-value="lodop.copies.value"
            :min="1"
            :max="99"
            :disabled="!lodop.enabled.value"
            @update:model-value="handleCopiesChange"
          />
        </div>

        <div class="flex items-start justify-between gap-4">
          <div class="space-y-1">
            <Label>强制使用模板纸张尺寸</Label>
            <p class="text-xs text-muted-foreground">
              开启时通过 SET_PRINT_PAGESIZE 传入模板宽高，适合测试连续纸和自定义纸张。
            </p>
          </div>
          <Switch
            :model-value="lodop.forcePageSize.value"
            :disabled="!lodop.enabled.value"
            @update:model-value="handleForcePageSizeChange"
          />
        </div>
      </div>
    </DialogContent>
  </Dialog>
</template>
