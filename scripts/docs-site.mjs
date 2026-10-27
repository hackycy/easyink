import { execFileSync } from 'node:child_process'
import { cp, mkdir, mkdtemp, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'

export const docsBase = '/easyink/docs/'

export function validateRegistry(registry) {
  const ids = registry.versions?.map(version => version.id) ?? []
  if (!ids.length || new Set(ids).size !== ids.length || !ids.includes(registry.default))
    throw new Error('Documentation versions must be unique and contain the default series')
  for (const version of registry.versions) {
    if (typeof version.id !== 'string' || !/^\d+\.\d+$/.test(version.id) || typeof version.label !== 'string' || !version.label || typeof version.ref !== 'string' || !version.ref)
      throw new Error(`Invalid documentation version: ${JSON.stringify(version)}`)
  }
  return registry
}

export function resolveRef(repo, ref) {
  for (const candidate of [ref, `refs/remotes/origin/${ref}`]) {
    try {
      return execFileSync('git', ['rev-parse', '--verify', `${candidate}^{commit}`], { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
    }
    catch { /* Try the remote-tracking branch next. */ }
  }
  throw new Error(`Documentation Git ref not found: ${ref}`)
}

export async function resolveSources(repo, registry, overrides = {}, gitSources = false) {
  const current = JSON.parse(await readFile(join(repo, 'docs/.vitepress/series.json'), 'utf8')).id
  for (const id of Object.keys(overrides)) {
    if (!registry.versions.some(version => version.id === id))
      throw new Error(`Unknown documentation series override: ${id}`)
  }
  return registry.versions.map((version) => {
    let workspace = overrides[version.id] ?? (!gitSources && version.id === current ? repo : undefined)
    const sha = resolveRef(workspace ?? repo, workspace ? 'HEAD' : version.ref)
    if (gitSources && version.id === current && sha === resolveRef(repo, 'HEAD'))
      workspace = repo
    const dirty = workspace ? execFileSync('git', ['status', '--porcelain'], { cwd: workspace, encoding: 'utf8' }).trim().length > 0 : false
    return { ...version, sha, ...(workspace ? { workspace: resolve(workspace), dirty } : {}) }
  })
}

export async function filesUnder(dir, prefix = '') {
  const files = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(prefix, entry.name)
    if (entry.isDirectory())
      files.push(...await filesUnder(join(dir, entry.name), path))
    else
      files.push(path)
  }
  return files
}

function escapeHtml(value) {
  return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}

export function redirectHtml(target, anchors) {
  const data = JSON.stringify({ target, anchors }).replaceAll('<', '\\u003c')
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="robots" content="noindex"><meta name="viewport" content="width=device-width,initial-scale=1"><title>EasyInk 文档</title><link rel="canonical" href="https://hackycy.github.io${escapeHtml(target)}"><noscript><meta http-equiv="refresh" content="0;url=${escapeHtml(target)}"></noscript></head><body><a href="${escapeHtml(target)}">进入文档</a><script>const {target,anchors}=${data};let hash='';try{if(anchors.includes(decodeURIComponent(location.hash.slice(1))))hash=location.hash}catch{}location.replace(target+location.search+hash)</script></body></html>\n`
}

function routeFile(route) {
  return route.endsWith('/') ? `${route.slice(1)}index.html` : route.slice(1)
}

export async function assembleSite(registry, builds, output) {
  validateRegistry(registry)
  // Validate every input before replacing an existing assembled site.
  const versions = []
  for (const version of registry.versions) {
    const build = builds.find(build => build.id === version.id)
    if (!build)
      throw new Error(`Missing documentation build: ${version.id}`)
    const metadata = JSON.parse(await readFile(join(build.dir, 'docs-build.json'), 'utf8'))
    const base = `${docsBase}${version.id}/`
    if (metadata.id !== version.id || metadata.base !== base || !Array.isArray(metadata.pages?.['/']))
      throw new Error(`Invalid documentation build metadata: ${version.id}`)
    if (build.sha && metadata.source !== build.sha)
      throw new Error(`Documentation source SHA mismatch: ${version.id}`)
    for (const [route, anchors] of Object.entries(metadata.pages)) {
      if (!route.startsWith('/') || route.includes('..') || !Array.isArray(anchors) || anchors.some(anchor => typeof anchor !== 'string'))
        throw new Error(`Invalid documentation route: ${route}`)
      await readFile(join(build.dir, routeFile(route)))
    }
    versions.push({ id: version.id, label: version.label, base, source: metadata.source, dirty: Boolean(build.dirty), pages: metadata.pages })
  }
  let existing = []
  try {
    existing = await readdir(output)
  }
  catch (error) {
    if (error.code !== 'ENOENT')
      throw error
  }
  if (existing.length) {
    let previous
    try {
      previous = JSON.parse(await readFile(join(output, 'versions.json'), 'utf8'))
    }
    catch { /* Only a previously assembled site may be replaced. */ }
    if (!previous?.versions?.length || !previous.versions.every(version => version.base && version.pages?.['/']))
      throw new Error(`Output directory contains files other than an assembled documentation site: ${output}`)
  }
  await mkdir(dirname(output), { recursive: true })
  const staged = await mkdtemp(join(dirname(output), '.docs-site-'))
  try {
    for (const version of versions) {
      await cp(builds.find(build => build.id === version.id).dir, join(staged, version.id), { recursive: true })
    }
    const preferred = versions.find(version => version.id === registry.default)
    const routes = new Set(versions.flatMap(version => Object.keys(version.pages)))
    for (const route of routes) {
      const version = Object.hasOwn(preferred.pages, route) ? preferred : versions.find(version => Object.hasOwn(version.pages, route))
      const file = join(staged, routeFile(route))
      await mkdir(dirname(file), { recursive: true })
      await writeFile(file, redirectHtml(`${version.base}${route.slice(1)}`, version.pages[route]))
    }
    await writeFile(join(staged, 'versions.json'), `${JSON.stringify({ default: registry.default, versions }, null, 2)}\n`)
    const sitemap = versions.map(version => `<sitemap><loc>https://hackycy.github.io${version.base}sitemap.xml</loc></sitemap>`).join('')
    await writeFile(join(staged, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${sitemap}</sitemapindex>\n`)
    await validateSite(staged)
    await rm(output, { recursive: true, force: true })
    await mkdir(dirname(output), { recursive: true })
    await rename(staged, output)
  }
  finally {
    await rm(staged, { recursive: true, force: true })
  }
  return versions
}

export async function validateSite(output) {
  const index = JSON.parse(await readFile(join(output, 'versions.json'), 'utf8'))
  const ids = index.versions?.map(version => version.id) ?? []
  if (!ids.length || new Set(ids).size !== ids.length || !ids.includes(index.default))
    throw new Error('Invalid assembled documentation version index')
  const files = new Set((await filesUnder(output)).map(file => file.replaceAll('\\', '/')))
  for (const version of index.versions) {
    if (!/^\d+\.\d+$/.test(version.id) || version.base !== `${docsBase}${version.id}/` || !Array.isArray(version.pages?.['/']))
      throw new Error(`Invalid assembled documentation series: ${version.id}`)
    const metadata = JSON.parse(await readFile(join(output, version.id, 'docs-build.json'), 'utf8'))
    if (metadata.id !== version.id || metadata.base !== version.base || metadata.source !== version.source || JSON.stringify(metadata.pages) !== JSON.stringify(version.pages))
      throw new Error(`Assembled documentation metadata mismatch: ${version.id}`)
    for (const route of Object.keys(version.pages)) {
      if (!files.has(`${version.id}/${routeFile(route)}`))
        throw new Error(`Missing assembled documentation page: ${version.id}${route}`)
    }
    if (!files.has(`${version.id}/sitemap.xml`))
      throw new Error(`Missing assembled documentation sitemap: ${version.id}`)
    for (const file of files) {
      if (!file.startsWith(`${version.id}/`) || !file.endsWith('.html'))
        continue
      const html = await readFile(join(output, file), 'utf8')
      for (const match of html.matchAll(/<(script|img|link)\b[^>]+?\b(?:src|href)="([^"]+)"/g)) {
        const resource = match[2].split(/[?#]/)[0]
        if (!resource.startsWith(docsBase))
          continue
        // Canonical links can refer to pages. Other local resources stay in their series.
        if (!resource.startsWith(version.base) || !files.has(decodeURIComponent(resource.slice(docsBase.length))))
          throw new Error(`Missing or incorrectly scoped documentation resource in ${file}: ${resource}`)
      }
    }
  }
  return index
}
