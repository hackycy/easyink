<script setup lang="ts">
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
import { Switch } from '@/components/ui/switch'
import { useRenderApiService } from '@/hooks/useRenderApiService'

const emit = defineEmits<{
  close: []
}>()

const renderApi = useRenderApiService()

const statusText = computed(() => {
  if (!renderApi.enabled.value)
    return '未启用'
  switch (renderApi.connectionState.value) {
    case 'connected': return '已连接'
    case 'checking': return '检查中...'
    case 'error': return renderApi.lastError.value || '连接失败'
    default: return '未连接'
  }
})

const statusColor = computed(() => {
  if (!renderApi.enabled.value)
    return 'text-muted-foreground'
  switch (renderApi.connectionState.value) {
    case 'connected': return 'text-green-600'
    case 'checking': return 'text-amber-500'
    case 'error': return 'text-red-500'
    default: return 'text-red-500'
  }
})

function handleToggleService(checked: boolean) {
  renderApi.setEnabled(checked)
}

async function handleCheckHealth() {
  try {
    await renderApi.checkHealth()
    toast.success('Render API 服务可用')
  }
  catch (error) {
    toast.error(error instanceof Error ? error.message : '连接 Render API 服务失败')
  }
}

function handleUrlChange(value: string | number) {
  renderApi.updateConfig({ serviceUrl: String(value) })
}

function handleRequestTimeoutChange(value: string | number) {
  const parsed = Number(value)
  renderApi.updateConfig({ requestTimeoutMs: Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : undefined })
}

function handleBrowserKindChange(value: string | number) {
  renderApi.updateConfig({ browserKind: String(value).trim() || undefined })
}

function handleBrowserPathChange(value: string | number) {
  renderApi.updateConfig({ browserPath: String(value).trim() || undefined })
}

function handleIncludeDiagnosticsChange(checked: boolean) {
  renderApi.updateConfig({ includeDiagnostics: checked })
}

function handleNoDaemonChange(checked: boolean) {
  renderApi.updateConfig({ noDaemon: checked })
}

function handleDisableSandboxChange(checked: boolean) {
  renderApi.updateConfig({ disableSandbox: checked })
}

onMounted(() => {
  if (renderApi.enabled.value)
    renderApi.checkHealth().catch(() => { /* keep settings usable */ })
})
</script>

<template>
  <Dialog :open="true" @update:open="(val) => { if (!val) emit('close') }">
    <DialogContent
      class="max-w-[560px]"
      sr-description="配置 Render API 服务地址、默认运行时参数和服务端渲染演示选项"
    >
      <DialogHeader>
        <DialogTitle>Render API 设置</DialogTitle>
      </DialogHeader>

      <div class="space-y-5 py-2">
        <section class="space-y-3">
          <div class="flex items-center justify-between">
            <Label>启用 Render API</Label>
            <Switch
              :model-value="renderApi.enabled.value"
              @update:model-value="handleToggleService"
            />
          </div>

          <div class="space-y-1.5">
            <Label>服务状态</Label>
            <div class="flex items-center gap-2">
              <span class="text-sm" :class="statusColor">{{ statusText }}</span>
              <Button
                v-if="renderApi.enabled.value"
                variant="outline"
                size="xs"
                :disabled="renderApi.isChecking.value"
                @click="handleCheckHealth"
              >
                {{ renderApi.isChecking.value ? '检查中...' : '检查服务' }}
              </Button>
            </div>
          </div>

          <div class="space-y-1.5">
            <Label>Render API 地址</Label>
            <Input
              :model-value="renderApi.serviceUrl.value"
              :disabled="!renderApi.enabled.value"
              placeholder="http://127.0.0.1:18081"
              @update:model-value="handleUrlChange"
            />
          </div>
        </section>

        <section class="space-y-3 border-t pt-4">
          <div class="flex items-center justify-between gap-4">
            <div class="space-y-1">
              <Label>包含诊断信息</Label>
              <p class="text-xs text-muted-foreground">
                服务端返回诊断路径时，会在渲染完成提示中展示，便于检查浏览器和资源加载问题。
              </p>
            </div>
            <Switch
              :model-value="renderApi.config.includeDiagnostics"
              :disabled="!renderApi.enabled.value"
              @update:model-value="handleIncludeDiagnosticsChange"
            />
          </div>

          <div class="space-y-1.5">
            <Label>请求超时（毫秒，可选）</Label>
            <Input
              type="number"
              :model-value="renderApi.config.requestTimeoutMs ?? ''"
              :disabled="!renderApi.enabled.value"
              placeholder="30000"
              @update:model-value="handleRequestTimeoutChange"
            />
          </div>
        </section>

        <section class="space-y-3 border-t pt-4">
          <div class="flex items-center justify-between gap-4">
            <Label>本次请求不使用守护进程</Label>
            <Switch
              :model-value="renderApi.config.noDaemon"
              :disabled="!renderApi.enabled.value"
              @update:model-value="handleNoDaemonChange"
            />
          </div>

          <div class="flex items-center justify-between gap-4">
            <div class="space-y-1">
              <Label>禁用浏览器 sandbox</Label>
              <p class="text-xs text-muted-foreground">
                仅在容器 root 用户或浏览器运行时明确需要时开启。
              </p>
            </div>
            <Switch
              :model-value="renderApi.config.disableSandbox"
              :disabled="!renderApi.enabled.value"
              @update:model-value="handleDisableSandboxChange"
            />
          </div>

          <div class="grid gap-3 sm:grid-cols-2">
            <div class="space-y-1.5">
              <Label>浏览器类型（可选）</Label>
              <Input
                :model-value="renderApi.config.browserKind ?? ''"
                :disabled="!renderApi.enabled.value"
                placeholder="headless-shell"
                @update:model-value="handleBrowserKindChange"
              />
            </div>
            <div class="space-y-1.5">
              <Label>浏览器路径（可选）</Label>
              <Input
                :model-value="renderApi.config.browserPath ?? ''"
                :disabled="!renderApi.enabled.value"
                placeholder="/path/to/headless-shell"
                @update:model-value="handleBrowserPathChange"
              />
            </div>
          </div>
        </section>
      </div>
    </DialogContent>
  </Dialog>
</template>
