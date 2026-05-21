<script setup lang="ts">
import { computed, ref, watch } from 'vue'

const DEFAULT_JSON = JSON.stringify({}, null, 2)

const jsonText = ref(DEFAULT_JSON)
const parseError = ref('')
const copied = ref(false)
const promptCopied = ref(false)

watch(jsonText, () => {
  try {
    const v = JSON.parse(jsonText.value)
    parseError.value = (typeof v !== 'object' || v === null || Array.isArray(v))
      ? '根数据必须是 JSON 对象'
      : ''
  }
  catch (e) {
    parseError.value = e instanceof Error ? e.message : String(e)
  }
})

function looksLikeUrl(v: string) {
  return /^https?:\/\//.test(v) || /\.(?:png|jpe?g|gif|svg|webp|bmp)$/i.test(v)
}

function buildFields(obj: Record<string, unknown>, parent = ''): unknown[] {
  return Object.entries(obj).map(([key, value]) => {
    const path = parent ? `${parent}/${key}` : key
    if (Array.isArray(value)) {
      const child = value.length > 0 && value[0] != null && typeof value[0] === 'object'
        ? buildFields(value[0] as Record<string, unknown>, path)
        : []
      return { name: key, title: key, path, tag: 'collection', expand: true, fields: child }
    }
    if (value != null && typeof value === 'object') {
      return { name: key, title: key, path, expand: true, fields: buildFields(value as Record<string, unknown>, path) }
    }
    return { name: key, title: key, path, use: typeof value === 'string' && looksLikeUrl(value) ? 'image' : 'text' }
  })
}

const output = computed(() => {
  if (parseError.value) {
    return ''
  }
  try {
    const data = JSON.parse(jsonText.value) as Record<string, unknown>
    return JSON.stringify({ id: 'custom', name: 'custom', title: '自定义数据', expand: true, fields: buildFields(data) }, null, 2)
  }
  catch {
    return ''
  }
})

function handleFormat() {
  try {
    jsonText.value = JSON.stringify(JSON.parse(jsonText.value), null, 2)
  }
  catch {}
}

async function handleCopy() {
  if (!output.value) {
    return
  }
  await navigator.clipboard.writeText(output.value)
  copied.value = true
  setTimeout(() => {
    copied.value = false
  }, 1500)
}

const renamePrompt = computed(() => {
  if (!output.value) {
    return ''
  }
  return `请根据每个字段 path 的语义，将下面 DataSourceDescriptor 中所有 DataFieldNode 的 title 字段改为更具语义的中文名称。

规则：
1. 分组节点（有 fields 子节点）：根据 path 语义翻译为中文，如 address -> 地址、items -> 商品列表
2. 叶子节点（无 fields）：根据 path 的完整语义生成简短的中文名称，如 customer/name -> 姓名、items/price -> 单价、address/city -> 城市
3. name 字段保持原值不动，只改 title
4. DataSourceDescriptor 顶层的 id、name、title 保持不变
5. 只输出修改后的完整 JSON，不要解释

以下是需要处理的 DataSourceDescriptor：
\`\`\` json
${output.value}
\`\`\`
`
})

async function handleCopyPrompt() {
  if (!renamePrompt.value) {
    return
  }
  await navigator.clipboard.writeText(renamePrompt.value)
  promptCopied.value = true
  setTimeout(() => {
    promptCopied.value = false
  }, 1500)
}
</script>

<template>
  <div class="ei-j2ds">
    <!-- top accent bar -->
    <div class="ei-j2ds__accent" />

    <div class="ei-j2ds__body">
      <!-- INPUT -->
      <div class="ei-j2ds__panel">
        <div class="ei-j2ds__bar">
          <div class="ei-j2ds__bar-left">
            <span class="ei-j2ds__dot ei-j2ds__dot--input" />
            <span class="ei-j2ds__label">JSON 输入</span>
          </div>
          <!-- format -->
          <button class="ei-j2ds__btn ei-j2ds__btn--icon" title="格式化 JSON" @click="handleFormat">
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
              <path d="M2 4h11M2 7.5h7M2 11h5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
              <path d="M11 9l2 2-2 2" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </button>
        </div>
        <div class="ei-j2ds__editor-wrap" :class="{ 'ei-j2ds__editor-wrap--error': parseError }">
          <textarea
            v-model="jsonText"
            class="ei-j2ds__textarea"
            spellcheck="false"
            autocomplete="off"
          />
        </div>
        <transition name="ei-j2ds-err">
          <div v-if="parseError" class="ei-j2ds__error">
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" style="flex-shrink:0">
              <circle cx="6.5" cy="6.5" r="6" stroke="currentColor" stroke-width="1.2" />
              <path d="M6.5 4v3.5M6.5 9.2v.3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" />
            </svg>
            {{ parseError }}
          </div>
        </transition>
      </div>

      <!-- DIVIDER ARROW -->
      <div class="ei-j2ds__divider">
        <svg class="ei-j2ds__arrow-h" width="22" height="22" viewBox="0 0 22 22" fill="none">
          <path d="M4 11h14m0 0l-4-4m4 4l-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        <svg class="ei-j2ds__arrow-v" width="20" height="20" viewBox="0 0 20 20" fill="none">
          <path d="M10 4v12m0 0l4-4m-4 4l-4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </div>

      <!-- OUTPUT -->
      <div class="ei-j2ds__panel">
        <div class="ei-j2ds__bar">
          <div class="ei-j2ds__bar-left">
            <span class="ei-j2ds__dot ei-j2ds__dot--output" />
            <span class="ei-j2ds__label">DataSourceDescriptor</span>
          </div>
          <div class="ei-j2ds__actions">
            <!-- copy AI prompt -->
            <button
              class="ei-j2ds__btn ei-j2ds__btn--icon ei-j2ds__btn--ai"
              :class="{ 'ei-j2ds__btn--ok': promptCopied }"
              :disabled="!output"
              title="复制 AI 重命名提示词"
              @click="handleCopyPrompt"
            >
              <!-- lightning bolt, visual center at (8,8) in 16x16 -->
              <svg v-if="!promptCopied" width="15" height="15" viewBox="0 0 16 16" fill="none">
                <path d="M10 1.5L5 8H8.5L6 14.5L11 8H7.5Z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round" />
              </svg>
              <svg v-else width="15" height="15" viewBox="0 0 16 16" fill="none">
                <path d="M3 8l3.5 3.5 6.5-7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </button>
            <!-- copy JSON -->
            <button
              class="ei-j2ds__btn ei-j2ds__btn--icon"
              :class="{ 'ei-j2ds__btn--ok': copied }"
              :disabled="!output"
              title="复制 DataSourceDescriptor JSON"
              @click="handleCopy"
            >
              <!-- two overlapping squares, visual center at (8,8) in 16x16 -->
              <svg v-if="!copied" width="15" height="15" viewBox="0 0 16 16" fill="none">
                <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" stroke="currentColor" stroke-width="1.3" />
                <path d="M10.5 5.5V4a1 1 0 0 0-1-1H3.5a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1H5.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" />
              </svg>
              <svg v-else width="15" height="15" viewBox="0 0 16 16" fill="none">
                <path d="M3 8l3.5 3.5 6.5-7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </button>
          </div>
        </div>
        <pre class="ei-j2ds__pre">{{ output }}</pre>
      </div>
    </div>

    <!-- bottom usage hint -->
    <div class="ei-j2ds__footer">
      <span class="ei-j2ds__hint">
        <svg class="ei-j2ds__hint-info" width="13" height="13" viewBox="0 0 13 13" fill="none">
          <circle cx="6.5" cy="6.5" r="5.5" stroke="currentColor" stroke-width="1.2" />
          <path d="M6.5 5.5v4M6.5 3.8v.4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" />
        </svg>
        粘贴业务 JSON 对象，右侧自动生成 DataSourceDescriptor 结构。
        <span class="ei-j2ds__hint-icon"><svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M10 1.5L5 8H8.5L6 14.5L11 8H7.5Z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round" /></svg> 复制 AI 提示词</span>后发送给大模型可自动补全中文标题。
        <span class="ei-j2ds__hint-icon"><svg width="13" height="13" viewBox="0 0 16 16" fill="none"><rect x="5.5" y="5.5" width="8" height="8" rx="1.5" stroke="currentColor" stroke-width="1.3" /><path d="M10.5 5.5V4a1 1 0 0 0-1-1H3.5a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1H5.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" /></svg> 复制结构</span>后粘贴至设计器数据源配置。
      </span>
    </div>
  </div>
</template>

<style scoped>
/* ── wrapper ── */
.ei-j2ds {
  position: relative;
  margin: 24px 0;
  border: 1px solid var(--vp-c-divider);
  border-radius: 12px;
  overflow: hidden;
  background: var(--vp-c-bg-soft);
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.06);
  transition: box-shadow 0.3s ease;
}

.ei-j2ds:hover {
  box-shadow: 0 8px 36px rgba(0, 0, 0, 0.1);
}

/* top gradient accent line */
.ei-j2ds__accent {
  height: 3px;
  background: linear-gradient(90deg, var(--vp-c-brand-1), var(--ei-c-teal, #14b8a6), var(--ei-c-amber, #f59e0b));
}

/* ── two-column body ── */
.ei-j2ds__body {
  display: flex;
  flex-direction: row;
  min-height: 300px;
}

.ei-j2ds__panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

/* ── toolbar bar ── */
.ei-j2ds__bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 7px 12px;
  background: var(--vp-c-bg);
  border-bottom: 1px solid var(--vp-c-divider);
  gap: 8px;
  overflow: hidden;
}

.ei-j2ds__bar-left {
  display: flex;
  align-items: center;
  gap: 7px;
}

/* colored dot badge */
.ei-j2ds__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.ei-j2ds__dot--input {
  background: var(--vp-c-brand-1);
  box-shadow: 0 0 6px color-mix(in srgb, var(--vp-c-brand-1) 60%, transparent);
}

.ei-j2ds__dot--output {
  background: var(--ei-c-teal, #14b8a6);
  box-shadow: 0 0 6px color-mix(in srgb, var(--ei-c-teal, #14b8a6) 60%, transparent);
}

.ei-j2ds__label {
  font-size: 11.5px;
  font-weight: 600;
  color: var(--vp-c-text-2);
  white-space: nowrap;
}

/* ── buttons ── */
.ei-j2ds__actions {
  display: flex;
  gap: 6px;
}

.ei-j2ds__btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  padding: 3px 11px;
  font-size: 11.5px;
  font-weight: 500;
  border: 1px solid var(--vp-c-divider);
  border-radius: 6px;
  background: var(--vp-c-bg-soft);
  color: var(--vp-c-text-2);
  cursor: pointer;
  transition:
    border-color 0.2s ease,
    color 0.2s ease,
    background 0.2s ease,
    box-shadow 0.2s ease;
  white-space: nowrap;
  flex-shrink: 0;
}

/* icon-only square button */
.ei-j2ds__btn--icon {
  width: 28px;
  height: 28px;
  padding: 0;
  border-radius: 7px;
  line-height: 0;
}

.ei-j2ds__btn--icon svg {
  display: block;
}

.ei-j2ds__btn:not(:disabled):hover {
  border-color: var(--vp-c-brand-1);
  color: var(--vp-c-brand-1);
  background: color-mix(in srgb, var(--vp-c-brand-1) 6%, transparent);
}

.ei-j2ds__btn:disabled {
  opacity: 0.38;
  cursor: not-allowed;
}

/* AI button distinct teal tint */
.ei-j2ds__btn--ai:not(:disabled):hover {
  border-color: var(--ei-c-teal, #14b8a6);
  color: var(--ei-c-teal, #14b8a6);
  background: color-mix(in srgb, var(--ei-c-teal, #14b8a6) 6%, transparent);
}

.ei-j2ds__btn--ok {
  border-color: #10b981 !important;
  color: #10b981 !important;
  background: color-mix(in srgb, #10b981 6%, transparent) !important;
}

/* ── editor wrap (border glow on error) ── */
.ei-j2ds__editor-wrap {
  flex: 1;
  display: flex;
  flex-direction: column;
}

/* ── textarea ── */
.ei-j2ds__textarea {
  flex: 1;
  display: block;
  width: 100%;
  min-height: 220px;
  margin: 0;
  padding: 14px 16px;
  border: none;
  outline: none;
  resize: none;
  font-family: var(--vp-font-family-mono);
  font-size: 13px;
  line-height: 1.75;
  tab-size: 2;
  color: var(--vp-c-text-1);
  background: var(--vp-c-bg);
  transition: background 0.2s ease;
}

.ei-j2ds__textarea:focus {
  background: color-mix(in srgb, var(--vp-c-brand-1) 2%, var(--vp-c-bg));
}

/* ── error strip ── */
.ei-j2ds__error {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 14px;
  font-size: 12px;
  color: var(--vp-c-danger-1, #f56c6c);
  background: color-mix(in srgb, var(--vp-c-danger-1, #f56c6c) 8%, transparent);
  border-top: 1px solid color-mix(in srgb, var(--vp-c-danger-1, #f56c6c) 20%, transparent);
}

.ei-j2ds-err-enter-active,
.ei-j2ds-err-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.ei-j2ds-err-enter-from,
.ei-j2ds-err-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

/* ── center divider ── */
.ei-j2ds__divider {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  flex-shrink: 0;
  color: var(--vp-c-text-3);
  background: var(--vp-c-bg-soft);
  border-left: 1px solid var(--vp-c-divider);
  border-right: 1px solid var(--vp-c-divider);
}

.ei-j2ds__arrow-v {
  display: none;
}

/* ── pre output ── */
.ei-j2ds__pre {
  flex: 1;
  margin: 0;
  padding: 14px 16px;
  min-height: 220px;
  overflow: auto;
  font-family: var(--vp-font-family-mono);
  font-size: 13px;
  line-height: 1.75;
  color: var(--vp-c-text-1);
  background: color-mix(in srgb, var(--ei-c-teal, #14b8a6) 2%, var(--vp-c-bg));
  white-space: pre;
}

/* ── bottom usage footer ── */
.ei-j2ds__footer {
  padding: 9px 16px;
  background: var(--vp-c-bg);
  border-top: 1px solid var(--vp-c-divider);
}

.ei-j2ds__hint {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
  font-size: 12px;
  line-height: 1;
  color: var(--vp-c-text-3);
}

.ei-j2ds__hint-info {
  flex-shrink: 0;
}

.ei-j2ds__hint-icon {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 2px 6px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 4px;
  background: var(--vp-c-bg-soft);
  color: var(--vp-c-text-2);
  font-size: 11px;
  line-height: 1;
  white-space: nowrap;
}

/* ── responsive: stack vertically below 640px ── */
@media (max-width: 639px) {
  .ei-j2ds__body {
    flex-direction: column;
  }

  .ei-j2ds__divider {
    width: 100%;
    height: 36px;
    border-left: none;
    border-right: none;
    border-top: 1px solid var(--vp-c-divider);
    border-bottom: 1px solid var(--vp-c-divider);
  }

  .ei-j2ds__arrow-h {
    display: none;
  }

  .ei-j2ds__arrow-v {
    display: block;
  }
}
</style>
