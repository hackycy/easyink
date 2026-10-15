import type { UserConfig } from 'vitepress'
import type { VersionConfig } from './versioning'
import { existsSync, readFileSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import process from 'node:process'
import { pageRoute } from './versioning'

interface Registry {
  default: string
  versions: { id: string, label: string, ref: string }[]
}

export function buildVersion(series: string) {
  const base = process.env.EASYINK_DOCS_BASE ?? '/'
  const origin = 'https://hackycy.github.io'
  const productionRoot = `${origin}/easyink/docs/`
  const aggregate = process.env.EASYINK_DOCS_VERSION !== undefined
  if (aggregate && process.env.EASYINK_DOCS_VERSION !== series)
    throw new Error(`Expected documentation series ${process.env.EASYINK_DOCS_VERSION}, received ${series}`)
  const registryPath = process.env.EASYINK_DOCS_VERSIONS_FILE ?? resolve('docs/versions.json')
  const registry: Registry = existsSync(registryPath)
    ? JSON.parse(readFileSync(registryPath, 'utf8'))
    : { default: series, versions: [{ id: series, label: `${series}.x`, ref: '' }] }
  const root = aggregate ? base.slice(0, -(series.length + 1)) : productionRoot
  const versioning: VersionConfig = {
    current: series,
    aggregate,
    root,
    versions: registry.versions.map(version => ({
      id: version.id,
      label: version.label,
      base: `${root}${version.id}/`,
    })),
  }
  const pages: Record<string, string[]> = {}
  const hooks: Pick<UserConfig, 'transformHead' | 'transformHtml' | 'buildEnd'> = {
    transformHead({ pageData }) {
      const url = `${origin}${aggregate ? base : `/easyink/docs/${series}/`}${pageRoute(pageData.relativePath).slice(1)}`
      return [
        ['link', { rel: 'canonical', href: url }],
        ['meta', { property: 'og:url', content: url }],
      ]
    },
    transformHtml(html, _id, context) {
      if (context.page === '404.md')
        return html
      pages[pageRoute(context.page)] = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1])
      return html
    },
    async buildEnd(config) {
      await writeFile(resolve(config.outDir, 'docs-build.json'), `${JSON.stringify({
        id: series,
        base,
        pages,
        source: process.env.EASYINK_DOCS_SOURCE_SHA ?? '',
      }, null, 2)}\n`)
    },
  }
  return { base, siteUrl: `${origin}${aggregate ? base : `/easyink/docs/${series}/`}`, versioning, hooks }
}
