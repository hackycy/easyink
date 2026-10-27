export interface DocsVersion {
  id: string
  label: string
  base: string
  pages?: Record<string, string[]>
}

export interface DocsIndex {
  default: string
  versions: DocsVersion[]
}

export interface VersionConfig {
  current: string
  root: string
  aggregate: boolean
  versions: DocsVersion[]
}

export function pageRoute(path: string): string {
  const route = `/${path.replace(/^\/+/, '')}`.replace(/\.(?:md|html)$/, '.html')
  if (route.endsWith('/index.html'))
    return route.slice(0, -10)
  if (route.endsWith('/') || route.endsWith('.html'))
    return route
  return `${route}.html`
}

export function versionLink(version: DocsVersion, route: string, search = '', hash = '') {
  const anchors = version.pages?.[pageRoute(route)]
  const missing = !anchors
  const suffix = missing ? '' : pageRoute(route).slice(1)
  let anchor = ''
  try {
    if (!missing && hash && anchors.includes(decodeURIComponent(hash.slice(1))))
      anchor = hash
  }
  catch { /* An invalid fragment is omitted. */ }
  return { href: `${version.base}${suffix}${search}${anchor}`, missing }
}
