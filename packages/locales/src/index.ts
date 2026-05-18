import enUS from './en-US'
import zhCN from './zh-CN'

const builtinLocales = {
  'zh-CN': zhCN,
  'en-US': enUS,
} as const

export { builtinLocales, enUS, zhCN }
export type BuiltinLocaleCode = keyof typeof builtinLocales
export type { LocaleMessages } from './types'
