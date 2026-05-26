import type { DataFieldCustomFormatTemplate } from '@easyink/datasource'

export interface BindingCodeExample {
  label: string
  code: string
  hint?: string
}

export const DEFAULT_CUSTOM_FORMAT_SOURCE = `/**
 * 默认数据转换函数
 * 接收字段的原始值，返回最终显示在打印区域的文本内容
 * 空值（null / undefined）统一输出为空字符串
 * 可按需修改函数体，实现格式化、映射等处理逻辑
 * @param {*} value - 字段原始值
 * @returns {string} 处理后的显示文本
 */
function transform(value) {
  return value != null ? String(value) : ''
}`

export const DEFAULT_BINDING_CODE_EXAMPLE_SOURCES = [
  DEFAULT_CUSTOM_FORMAT_SOURCE,
  `/**
 * 将字段原始值转换为字符串
 * 空值（null / undefined）统一输出为空字符串
 * @param {*} value - 字段原始值
 * @returns {string} 转换后的字符串
 */
function transform(value) {
  return String(value ?? '')
}`,
  `/**
 * 将数值格式化为人民币金额，保留两位小数
 * 非数字或无效值时显示占位符 '-'
 * @param {*} value - 字段原始值（数字或可转换为数字的字符串）
 * @returns {string}
 */
function transform(value) {
  var num = Number(value)
  if (isNaN(num)) return '-'
  return '\xA5' + num.toFixed(2)
}`,
  `/**
 * 将日期值格式化为 YYYY-MM-DD 格式
 * 支持时间戳，以及 YYYY-MM-DD / YYYY-MM-DDTHH:mm:ss / YYYY-MM-DD HH:mm:ss 这类明确格式
 * 无效日期返回空字符串
 * @param {*} value - 字段原始值（日期字符串或时间戳）
 * @returns {string}
 */
function parseDateValue(value) {
  if (value instanceof Date && !isNaN(value.getTime())) return value
  if (typeof value === 'number' && isFinite(value)) {
    var fromTimestamp = new Date(value)
    return isNaN(fromTimestamp.getTime()) ? null : fromTimestamp
  }
  if (typeof value !== 'string') return null
  var match = value.trim().match(/^(\\d{4})-(\\d{2})-(\\d{2})(?:[T ](\\d{2}):(\\d{2})(?::(\\d{2}))?)?$/)
  if (!match) return null
  var year = Number(match[1])
  var month = Number(match[2]) - 1
  var day = Number(match[3])
  var hour = Number(match[4] || 0)
  var minute = Number(match[5] || 0)
  var second = Number(match[6] || 0)
  var date = new Date(year, month, day, hour, minute, second)
  if (
    date.getFullYear() !== year
    || date.getMonth() !== month
    || date.getDate() !== day
    || date.getHours() !== hour
    || date.getMinutes() !== minute
    || date.getSeconds() !== second
  ) return null
  return date
}

function transform(value) {
  var d = parseDateValue(value)
  if (!d) return ''
  var y = d.getFullYear()
  var m = String(d.getMonth() + 1).padStart(2, '0')
  var day = String(d.getDate()).padStart(2, '0')
  return y + '-' + m + '-' + day
}`,
  `/**
 * 将整数状态码映射为对应的中文可读标签
 * 未匹配到映射时原样返回字段值的字符串形式
 * @param {*} value - 字段原始值（整数状态码）
 * @returns {string}
 */
function transform(value) {
  var map = { 0: '\u5F85\u5904\u7406', 1: '\u8FDB\u884C\u4E2D', 2: '\u5DF2\u5B8C\u6210' }
  return map[value] !== undefined ? map[value] : String(value ?? '')
}`,
]

export const DEFAULT_BINDING_CODE_EXAMPLE_KEYS = [
  'designer.bindingFormat.examples.default',
  'designer.bindingFormat.examples.toString',
  'designer.bindingFormat.examples.currency',
  'designer.bindingFormat.examples.date',
  'designer.bindingFormat.examples.statusMap',
]

export const DEFAULT_BINDING_CODE_EXAMPLE_LABELS = [
  '默认转换函数',
  '原始值转字符串',
  '数值格式化为货币',
  '日期格式化 YYYY-MM-DD',
  '状态码映射为中文标签',
]

export function createBindingCodeExamples(
  t?: (key: string) => string,
  templates?: DataFieldCustomFormatTemplate[],
): BindingCodeExample[] {
  const builtIn = DEFAULT_BINDING_CODE_EXAMPLE_SOURCES.map((code, i) => ({
    label: t ? t(DEFAULT_BINDING_CODE_EXAMPLE_KEYS[i]) : DEFAULT_BINDING_CODE_EXAMPLE_LABELS[i],
    code,
  }))

  if (!templates?.length)
    return builtIn

  return [
    ...toBindingCodeExamples(templates),
    ...builtIn.slice(1),
  ]
}

export function toBindingCodeExamples(templates: DataFieldCustomFormatTemplate[]): BindingCodeExample[] {
  return templates.map(template => ({
    label: template.label,
    code: template.source,
    hint: template.hint,
  }))
}
