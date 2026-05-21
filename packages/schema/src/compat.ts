import { isObject } from '@easyink/shared'

export function migrateLegacyStackPageMode<T extends Record<string, unknown>>(schema: T): T {
  if (!isObject(schema.page) || schema.page.mode !== 'stack')
    return schema

  const page = schema.page
  const width = typeof page.width === 'number' && page.width > 0 ? page.width : undefined
  const height = typeof page.height === 'number' && page.height > 0 ? page.height : undefined

  return {
    ...schema,
    page: {
      ...page,
      mode: 'continuous',
      ...(width != null && height != null
        ? { pageModel: { kind: 'continuous-paper', paper: { width, height } } }
        : {}),
      layout: { strategy: 'stack-flow', flowAxis: 'y' },
      pagination: { strategy: 'none' },
      reflow: { strategy: 'flow-y', preserveTrailingGap: true, collisionPolicy: 'diagnose' },
    },
  }
}
