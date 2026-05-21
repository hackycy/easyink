import type { DocumentSchema, PagePrintConfig, PageSchema } from '@easyink/schema'
import type { PageModelKind } from '@easyink/shared'

export interface ResolvedPageModel {
  kind: PageModelKind
  width: number
  height: number
  minHeight?: number
  maxHeight?: number
  print?: PagePrintConfig
}

export function resolvePageModel(schema: DocumentSchema | PageSchema): ResolvedPageModel {
  const page = 'page' in schema ? schema.page : schema
  const paper = page.pageModel?.paper

  return {
    kind: page.pageModel?.kind ?? inferPageModelKind(page),
    width: paper?.width ?? page.width,
    height: paper?.height ?? page.height,
    minHeight: paper?.minHeight,
    maxHeight: paper?.maxHeight,
    print: page.print,
  }
}

function inferPageModelKind(page: PageSchema): PageModelKind {
  if (page.mode === 'continuous')
    return 'continuous-paper'
  return 'paged-paper'
}
