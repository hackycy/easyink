import { execFileSync, spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import vm from 'node:vm'
import { afterEach, describe, expect, it } from 'vitest'
import { assembleSite, redirectHtml, resolveRef, resolveSources, validateRegistry, validateSite } from './docs-site.mjs'

const temporary = []
async function temp() {
  const dir = await mkdtemp(join(tmpdir(), 'easyink-docs-'))
  temporary.push(dir)
  return dir
}
afterEach(async () => {
  await Promise.all(temporary.splice(0).map(dir => rm(dir, { recursive: true, force: true })))
})

const registry = {
  default: '0.1',
  versions: [
    { id: '0.1', label: '0.1.x', ref: 'main' },
    { id: '0.0', label: '0.0.x', ref: '0.0.x' },
  ],
}

async function fixture(root, id, extra = {}) {
  const dir = join(root, id)
  const pages = { '/': [], '/viewer/': ['print'], ...extra }
  for (const route of Object.keys(pages)) {
    const file = join(dir, route.endsWith('/') ? `${route.slice(1)}index.html` : route.slice(1))
    await mkdir(dirname(file), { recursive: true })
    await writeFile(file, `<html><head><script src="/easyink/docs/${id}/assets/shared.js"></script></head><body>${id}</body></html>`)
  }
  await mkdir(join(dir, 'assets'), { recursive: true })
  await writeFile(join(dir, 'assets/shared.js'), `window.series = '${id}'`)
  await writeFile(join(dir, 'sitemap.xml'), '<urlset/>')
  await writeFile(join(dir, 'docs-build.json'), JSON.stringify({ id, base: `/easyink/docs/${id}/`, source: id, pages }))
  return { id, dir }
}

describe('versioned documentation artifacts', () => {
  it('merges complete series without overwriting equally named assets', async () => {
    const root = await temp()
    const builds = [await fixture(root, '0.1'), await fixture(root, '0.0', { '/legacy.html': ['old'] })]
    const output = join(root, 'site')
    await assembleSite(registry, builds, output)
    const index = await validateSite(output)
    expect(index.versions.map(version => version.id)).toEqual(['0.1', '0.0'])
    expect(await readFile(join(output, '0.1/assets/shared.js'), 'utf8')).toContain('0.1')
    expect(await readFile(join(output, '0.0/assets/shared.js'), 'utf8')).toContain('0.0')
    expect(await readFile(join(output, 'viewer/index.html'), 'utf8')).toContain('/easyink/docs/0.1/viewer/')
    expect(await readFile(join(output, 'legacy.html'), 'utf8')).toContain('/easyink/docs/0.0/legacy.html')
    await expect(readFile(join(output, 'unknown.html'))).rejects.toThrow()
  })

  it('selects redirects from the configured default, including a legacy default', async () => {
    const root = await temp()
    const builds = [await fixture(root, '0.1'), await fixture(root, '0.0')]
    const output = join(root, 'site')
    await assembleSite({ ...registry, default: '0.0' }, builds, output)
    expect(await readFile(join(output, 'index.html'), 'utf8')).toContain('"target":"/easyink/docs/0.0/"')
  })

  it('refuses to replace a directory containing source files', async () => {
    const root = await temp()
    const builds = [await fixture(root, '0.1'), await fixture(root, '0.0')]
    const output = join(root, 'source-docs')
    await mkdir(output)
    await writeFile(join(output, 'guide.md'), 'source')
    await expect(assembleSite(registry, builds, output)).rejects.toThrow('other than an assembled')
    expect(await readFile(join(output, 'guide.md'), 'utf8')).toBe('source')
  })

  it('preserves the previous assembled site when any series is absent or invalid', async () => {
    const root = await temp()
    const builds = [await fixture(root, '0.1'), await fixture(root, '0.0')]
    const output = join(root, 'site')
    await assembleSite(registry, builds, output)
    const previous = await readFile(join(output, 'versions.json'), 'utf8')
    await expect(assembleSite(registry, [builds[0]], output)).rejects.toThrow('Missing documentation build: 0.0')
    await rm(join(builds[1].dir, 'assets/shared.js'))
    await expect(assembleSite(registry, builds, output)).rejects.toThrow('Missing or incorrectly scoped')
    expect(await readFile(join(output, 'versions.json'), 'utf8')).toBe(previous)
  })

  it('rejects cross-series resources and mismatched source metadata', async () => {
    const root = await temp()
    const builds = [await fixture(root, '0.1'), await fixture(root, '0.0')]
    await expect(assembleSite(registry, [{ ...builds[0], sha: 'wrong' }, builds[1]], join(root, 'site'))).rejects.toThrow('SHA mismatch')
    await writeFile(join(builds[1].dir, 'index.html'), '<script src="/easyink/docs/0.1/assets/shared.js"></script>')
    await expect(assembleSite(registry, builds, join(root, 'site'))).rejects.toThrow('incorrectly scoped')
  })

  it('rejects an assembled site with a missing series or page', async () => {
    const root = await temp()
    const builds = [await fixture(root, '0.1'), await fixture(root, '0.0')]
    const output = join(root, 'site')
    await assembleSite(registry, builds, output)
    await rm(join(output, '0.0/viewer/index.html'))
    await expect(validateSite(output)).rejects.toThrow('Missing assembled documentation page: 0.0/viewer/')
    await rm(join(output, '0.0'), { recursive: true })
    await expect(validateSite(output)).rejects.toThrow()
  })

  it('validates series identities and rejects missing Git sources', async () => {
    expect(() => validateRegistry({ ...registry, default: '0.9' })).toThrow()
    expect(() => validateRegistry({ ...registry, versions: [registry.versions[0], registry.versions[0]] })).toThrow()
    const repo = await temp()
    execFileSync('git', ['init', '-q'], { cwd: repo })
    expect(() => resolveRef(repo, 'missing-series')).toThrow('Git ref not found')
  })

  it('stops on a failed series build without replacing the previous site', async () => {
    const root = await temp()
    for (const id of ['0.1', '0.0']) {
      const dir = join(root, id)
      await mkdir(join(dir, 'docs/.vitepress'), { recursive: true })
      await writeFile(join(dir, 'docs/.vitepress/series.json'), JSON.stringify({ id }))
      await writeFile(join(dir, 'package.json'), JSON.stringify({ scripts: { 'docs:build': 'node -e "process.exit(1)"' } }))
      execFileSync('git', ['init', '-q'], { cwd: dir })
      execFileSync('git', ['add', '.'], { cwd: dir })
      execFileSync('git', ['-c', 'user.name=Docs Test', '-c', 'user.email=docs@example.test', 'commit', '-qm', 'fixture'], { cwd: dir })
    }
    const output = join(root, 'site')
    await mkdir(output)
    await writeFile(join(output, 'index.html'), 'previous site')
    const result = spawnSync(process.execPath, [
      resolve('scripts/docs-versions.mjs'),
      'build',
      '--source',
      `0.1=${join(root, '0.1')}`,
      '--source',
      `0.0=${join(root, '0.0')}`,
      '--out',
      output,
    ], { encoding: 'utf8' })
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('docs:build failed in')
    expect(await readFile(join(output, 'index.html'), 'utf8')).toBe('previous site')
  })

  it('freezes both branches when the central workflow was invoked from a legacy release', async () => {
    const repo = await temp()
    execFileSync('git', ['init', '-q'], { cwd: repo })
    await mkdir(join(repo, 'docs/.vitepress'), { recursive: true })
    await writeFile(join(repo, 'docs/.vitepress/series.json'), '{"id":"0.1"}')
    execFileSync('git', ['add', '.'], { cwd: repo })
    execFileSync('git', ['-c', 'user.name=Docs Test', '-c', 'user.email=docs@example.test', 'commit', '-qm', 'fixture'], { cwd: repo })
    execFileSync('git', ['branch', '-M', 'main'], { cwd: repo })
    execFileSync('git', ['branch', '0.0.x'], { cwd: repo })
    const oldRef = process.env.GITHUB_REF
    process.env.GITHUB_REF = 'refs/tags/npm-v-old-series'
    try {
      const sources = await resolveSources(repo, registry, {}, true)
      expect(sources.map(source => source.id)).toEqual(['0.1', '0.0'])
      expect(sources.every(source => /^[a-f0-9]{40}$/.test(source.sha))).toBe(true)
      expect(sources[0].workspace).toBe(repo)
    }
    finally {
      if (oldRef === undefined)
        delete process.env.GITHUB_REF
      else
        process.env.GITHUB_REF = oldRef
    }
  })
})

describe('legacy URL redirects', () => {
  function navigate(hash) {
    const html = redirectHtml('/easyink/docs/0.1/viewer/', ['print'])
    const replace = []
    const script = html.match(/<script>([\s\S]*?)<\/script>/)[1]
    vm.runInNewContext(script, { location: { hash, search: '?mode=preview', replace: value => replace.push(value) } })
    return { html, target: replace[0] }
  }

  it('keeps valid fragments and query parameters', () => {
    expect(navigate('#print').target).toBe('/easyink/docs/0.1/viewer/?mode=preview#print')
    expect(navigate('#other').target).toBe('/easyink/docs/0.1/viewer/?mode=preview')
    expect(navigate('#%xx').target).toBe('/easyink/docs/0.1/viewer/?mode=preview')
  })

  it('has a no-JavaScript fallback, normal link and noindex', () => {
    expect(navigate('').html).toContain('<noscript><meta http-equiv="refresh"')
    expect(navigate('').html).toContain('<a href="/easyink/docs/0.1/viewer/">')
    expect(navigate('').html).toContain('content="noindex"')
  })
})
