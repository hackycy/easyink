import type { LocaleMessages } from './types'
import { ref } from 'vue'
import { zhCN } from './zh-CN'

function deepMerge(target: LocaleMessages, source: LocaleMessages): LocaleMessages {
  const result = { ...target }
  for (const key of Object.keys(source)) {
    const sv = source[key]
    const tv = result[key]
    if (typeof sv === 'object' && sv !== null && typeof tv === 'object' && tv !== null) {
      result[key] = deepMerge(tv as LocaleMessages, sv as LocaleMessages)
    }
    else {
      result[key] = sv
    }
  }
  return result
}

export function useLocale(initial?: LocaleMessages) {
  const messages = ref<LocaleMessages>(initial ?? zhCN)

  /** 解析点分 key 路径，如 'toolbar.undo' */
  function t(key: string): string {
    const parts = key.split('.')
    let current: unknown = messages.value
    for (const part of parts) {
      if (current == null || typeof current !== 'object') {
        return key
      }
      current = (current as Record<string, unknown>)[part]
    }
    return typeof current === 'string' ? current : key
  }

  /** 合并额外消息（插件扩展） */
  function merge(extra: LocaleMessages): void {
    messages.value = deepMerge(messages.value, extra)
  }

  /** 替换整个 locale */
  function setLocale(newMessages: LocaleMessages): void {
    messages.value = newMessages
  }

  return { messages, merge, setLocale, t }
}
