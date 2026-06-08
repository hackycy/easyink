<script setup lang="ts">
import { IconClose } from '@easyink/icons'
import { computed, onBeforeUnmount, useAttrs, watch } from 'vue'
import EiButton from './EiButton.vue'
import EiIcon from './EiIcon.vue'

defineOptions({
  inheritAttrs: false,
})

const props = withDefaults(
  defineProps<{
    open: boolean
    title?: string
    width?: string | number
    cancelText?: string
    confirmText?: string
    confirmDisabled?: boolean
    confirmLoading?: boolean
    showFooter?: boolean
    closeOnOverlay?: boolean
    closeOnEsc?: boolean
  }>(),
  {
    width: 520,
    cancelText: 'Cancel',
    confirmText: 'OK',
    showFooter: true,
    closeOnOverlay: true,
    closeOnEsc: true,
  },
)

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  (e: 'cancel'): void
  (e: 'confirm'): void
  (e: 'close'): void
}>()

const attrs = useAttrs()

const dialogStyle = computed(() => ({
  width: typeof props.width === 'number' ? `${props.width}px` : props.width,
}))

function close() {
  emit('update:open', false)
  emit('close')
}

function cancel() {
  emit('cancel')
  close()
}

function confirm() {
  if (props.confirmDisabled || props.confirmLoading)
    return
  emit('confirm')
}

function onOverlayPointerDown(event: PointerEvent) {
  if (!props.closeOnOverlay)
    return
  if (event.target === event.currentTarget)
    cancel()
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && props.open && props.closeOnEsc)
    cancel()
}

watch(
  () => props.open,
  (open) => {
    if (open)
      window.addEventListener('keydown', onKeydown)
    else
      window.removeEventListener('keydown', onKeydown)
  },
)

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="ei-dialog-overlay"
      role="presentation"
      @pointerdown="onOverlayPointerDown"
    >
      <section
        v-bind="attrs"
        class="ei-dialog"
        role="dialog"
        aria-modal="true"
        :aria-label="title"
        :style="dialogStyle"
        @pointerdown.stop
      >
        <header class="ei-dialog__header">
          <div class="ei-dialog__title">
            <slot name="title">
              {{ title }}
            </slot>
          </div>
          <button
            class="ei-dialog__close"
            type="button"
            aria-label="Close"
            @click="cancel"
          >
            <EiIcon :icon="IconClose" :size="16" />
          </button>
        </header>

        <div class="ei-dialog__body">
          <slot />
        </div>

        <footer v-if="showFooter" class="ei-dialog__footer">
          <slot name="footer" :cancel="cancel" :confirm="confirm">
            <EiButton @click="cancel">
              {{ cancelText }}
            </EiButton>
            <EiButton variant="primary" :disabled="confirmDisabled || confirmLoading" @click="confirm">
              {{ confirmLoading ? '...' : confirmText }}
            </EiButton>
          </slot>
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<style scoped lang="scss">
.ei-dialog-overlay {
  position: fixed;
  inset: 0;
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(0, 0, 0, 0.35);
  box-sizing: border-box;
}

.ei-dialog {
  max-width: min(100%, 960px);
  max-height: min(86vh, 720px);
  display: flex;
  flex-direction: column;
  background: var(--ei-bg-elevated, #fff);
  border: 1px solid var(--ei-border-color, #d9d9d9);
  border-radius: 6px;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.18);
  color: var(--ei-text, #333);
}

.ei-dialog__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--ei-border-color, #eee);
}

.ei-dialog__title {
  min-width: 0;
  font-size: 15px;
  font-weight: 600;
  line-height: 1.4;
}

.ei-dialog__close {
  width: 24px;
  height: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--ei-text-secondary, #666);
  cursor: pointer;
  font-size: 16px;
  line-height: 1;
}

.ei-dialog__close:hover {
  background: var(--ei-hover-bg, #f5f5f5);
  color: var(--ei-text, #333);
}

.ei-dialog__body {
  min-height: 0;
  overflow: auto;
  padding: 16px;
}

.ei-dialog__footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid var(--ei-border-color, #eee);
}

@media (max-width: 640px) {
  .ei-dialog-overlay {
    padding: 12px;
  }

  .ei-dialog {
    width: 100% !important;
    max-height: 92vh;
  }
}
</style>
