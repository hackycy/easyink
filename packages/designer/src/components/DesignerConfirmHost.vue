<script setup lang="ts">
import type { DesignerAssetPickRequest, DesignerConfirmRequest, DesignerInteractionProvider } from '../types'
import { EiDialog } from '@easyink/ui'
import { computed, onBeforeUnmount, ref } from 'vue'
import { useDesignerStore } from '../composables'
import { pickAssetWithFileInput, uploadAssetAsDataUrl } from '../interactions/asset-file-picker'

interface PendingConfirm {
  request: DesignerConfirmRequest
  resolve: (value: boolean) => void
}

const store = useDesignerStore()
const queue: PendingConfirm[] = []
const active = ref<PendingConfirm | null>(null)

function nextConfirm() {
  if (!active.value)
    active.value = queue.shift() ?? null
}

function confirm(request: DesignerConfirmRequest): Promise<boolean> {
  return new Promise((resolve) => {
    queue.push({ request, resolve })
    nextConfirm()
  })
}

function pickAsset(request: DesignerAssetPickRequest) {
  return pickAssetWithFileInput(request, {
    messages: {
      documentMissing: text('designer.diagnostic.assetPickerDocumentMissing', 'Asset file picker requires a browser document.'),
      unsupportedFileType: text('designer.diagnostic.imagePickerUnsupportedFileType', 'Selected file type is not supported by this image field.'),
      pickerOpenFailed: text('designer.diagnostic.imagePickerOpenFailed', 'Failed to open image file picker.'),
    },
    onDiagnostic(diagnostic) {
      store.diagnostics.push({
        source: 'designer-interaction',
        severity: diagnostic.severity,
        message: diagnostic.message,
        detail: diagnostic.detail,
      })
    },
  })
}

const provider: DesignerInteractionProvider = { confirm, pickAsset, uploadAsset: uploadAssetAsDataUrl }
store.interactions.setFallbackProvider(provider)
store.refreshInteractionAvailability()

function settle(value: boolean) {
  const current = active.value
  if (!current)
    return

  active.value = null
  current.resolve(value)
  nextConfirm()
}

function cancelAll() {
  settle(false)
  while (queue.length > 0)
    queue.shift()?.resolve(false)
}

onBeforeUnmount(() => {
  store.interactions.clearFallbackProvider(provider)
  store.refreshInteractionAvailability()
  cancelAll()
})

const request = computed(() => active.value?.request)
const open = computed(() => request.value != null)

function text(key: string, fallback: string): string {
  const value = store.t(key)
  return value === key ? fallback : value
}

const title = computed(() => request.value?.title ?? text('designer.dialog.confirm', 'Confirm'))
const confirmText = computed(() => request.value?.confirmText ?? text('designer.dialog.confirm', 'Confirm'))
const cancelText = computed(() => request.value?.cancelText ?? text('designer.dialog.cancel', 'Cancel'))
</script>

<template>
  <EiDialog
    :open="open"
    :title="title"
    :confirm-text="confirmText"
    :cancel-text="cancelText"
    :width="420"
    @update:open="value => { if (!value) settle(false) }"
    @cancel="settle(false)"
    @confirm="settle(true)"
  >
    <div
      v-if="request"
      class="ei-designer-confirm"
      :class="`ei-designer-confirm--${request.severity ?? 'warning'}`"
    >
      <p class="ei-designer-confirm__message">
        {{ request.message }}
      </p>
      <p v-if="request.description" class="ei-designer-confirm__description">
        {{ request.description }}
      </p>
    </div>
  </EiDialog>
</template>

<style scoped lang="scss">
.ei-designer-confirm {
  display: flex;
  flex-direction: column;
  gap: 8px;

  &__message {
    margin: 0;
    color: var(--ei-text, #333);
    font-size: 14px;
    line-height: 1.5;
  }

  &__description {
    margin: 0;
    color: var(--ei-text-secondary, #666);
    font-size: 13px;
    line-height: 1.5;
  }

  &--danger &__message {
    color: var(--ei-danger, #d92d20);
  }
}
</style>
