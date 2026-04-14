<script setup lang="ts">
import { ref } from 'vue'
import { EasyInkDesigner } from '@easyink/designer'
import type { DocumentSchema } from '@easyink/designer'
import { invoiceDemoData, invoiceWithTableTemplate, sampleDataSources } from '@easyink/samples'
import zhCN from '@easyink/designer/locale/zh-CN'
import { createLocalStoragePreferenceProvider } from '@easyink/designer'
import PreviewOverlay from './PreviewOverlay.vue'

import '@easyink/designer/index.css'

const schema = ref<DocumentSchema>(invoiceWithTableTemplate)
const preferenceProvider = createLocalStoragePreferenceProvider()

const showPreview = ref(false)
const previewSchema = ref<DocumentSchema>()

function openPreview() {
  previewSchema.value = JSON.parse(JSON.stringify(schema.value))
  showPreview.value = true
}
</script>

<template>
  <EasyInkDesigner
    v-model:schema="schema"
    :data-sources="sampleDataSources"
    :locale="zhCN"
    :preference-provider="preferenceProvider"
  >
    <template #topbar>
      <div class="playground-topbar">
        <button class="playground-preview-btn" @click="openPreview">
          预览
        </button>
      </div>
    </template>
  </EasyInkDesigner>

  <PreviewOverlay
    v-if="showPreview && previewSchema"
    :schema="previewSchema"
    :data-sources="sampleDataSources"
    :data="invoiceDemoData"
    @close="showPreview = false"
  />
</template>

<style scoped>
.playground-topbar {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding: 4px 12px;
  background: #f8f8f8;
  border-bottom: 1px solid #e0e0e0;
}

.playground-preview-btn {
  padding: 4px 16px;
  font-size: 13px;
  border: 1px solid #d0d0d0;
  border-radius: 4px;
  background: #fff;
  cursor: pointer;
  color: #333;
}

.playground-preview-btn:hover {
  background: #e8e8e8;
}
</style>
