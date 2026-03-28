import type { TemplateSchema } from './types'

/** 当前 Schema 版本 */
export const SCHEMA_VERSION = '0.1.0'

/**
 * 创建默认的空模板 Schema
 */
export function createDefaultSchema(): TemplateSchema {
  return {
    version: SCHEMA_VERSION,
    meta: {
      name: '未命名模板',
    },
    page: {
      paper: 'A4',
      orientation: 'portrait',
      margins: { top: 10, right: 10, bottom: 10, left: 10 },
      unit: 'mm',
    },
    elements: [],
  }
}
