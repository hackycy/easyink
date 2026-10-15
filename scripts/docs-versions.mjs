import { execFile, spawn } from 'node:child_process'
import { access, appendFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { assembleSite, docsBase, resolveRef, resolveSources, validateRegistry, validateSite } from './docs-site.mjs'

const exec = promisify(execFile)
const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function parseOptions(args) {
  const options = { command: args.shift() ?? 'build', overrides: {}, output: resolve(repo, '.cache/docs-site') }
  while (args.length) {
    const flag = args.shift()
    if (flag === '--git-sources') {
      options.gitSources = true
      continue
    }
    const value = args.shift()
    if (!value)
      throw new Error(`Missing value for ${flag}`)
    if (flag === '--source') {
      const separator = value.indexOf('=')
      if (separator < 1)
        throw new Error('Expected --source SERIES=PATH')
      options.overrides[value.slice(0, separator)] = resolve(value.slice(separator + 1))
    }
    else if (flag === '--out') {
      options.output = resolve(value)
    }
    else if (flag === '--sources-file') {
      options.sourcesFile = resolve(value)
    }
    else {
      throw new Error(`Unknown argument: ${flag}`)
    }
  }
  return options
}

function run(command, args, cwd, env = {}) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, { cwd, env: { ...process.env, ...env }, stdio: 'inherit' })
    child.on('error', reject)
    child.on('close', code => code === 0 ? resolveRun() : reject(new Error(`${command} ${args.join(' ')} failed in ${cwd} (${code})`)))
  })
}

async function checkoutSource(source) {
  const dir = join(repo, '.cache/docs-sources', source.sha)
  try {
    await access(join(dir, 'package.json'))
    return dir
  }
  catch { /* Export a fixed commit without changing any worktree. */ }
  await mkdir(dir, { recursive: true })
  const archive = `${dir}.tar`
  try {
    await exec('git', ['archive', '--format=tar', '-o', archive, source.sha], { cwd: repo })
    await exec('tar', ['-xf', archive, '-C', dir])
  }
  catch (error) {
    await rm(dir, { recursive: true, force: true })
    throw error
  }
  finally {
    await rm(archive, { force: true })
  }
  return dir
}

async function main() {
  const options = parseOptions(process.argv.slice(2))
  if (options.command === 'preview') {
    await validateSite(options.output)
    const { preview } = await import('vite')
    const server = await preview({ configFile: false, root: repo, appType: 'mpa', base: docsBase, build: { outDir: options.output }, preview: { port: 8534 } })
    server.printUrls()
    return
  }
  if (options.command === 'check') {
    const index = await validateSite(options.output)
    console.log(`[docs] verified ${index.versions.length} series in ${options.output}`)
    return
  }
  const registryFile = join(repo, 'docs/versions.json')
  const registry = validateRegistry(JSON.parse(await readFile(registryFile, 'utf8')))
  const sources = options.command === 'build' && options.sourcesFile
    ? JSON.parse(await readFile(options.sourcesFile, 'utf8'))
    : await resolveSources(repo, registry, options.overrides, options.gitSources)
  if (options.command === 'resolve') {
    if (!options.sourcesFile)
      throw new Error('resolve requires --sources-file PATH')
    await mkdir(dirname(options.sourcesFile), { recursive: true })
    await writeFile(options.sourcesFile, `${JSON.stringify(sources, null, 2)}\n`)
    console.log(JSON.stringify(sources, null, 2))
    return
  }
  if (options.command !== 'build')
    throw new Error(`Unknown command: ${options.command}`)
  const builds = []
  for (const version of registry.versions) {
    const source = sources.find(source => source.id === version.id)
    if (!source || !/^[a-f0-9]{40}$/.test(source.sha))
      throw new Error(`Missing fixed documentation source: ${version.id}`)
    const cwd = source.workspace ?? await checkoutSource(source)
    if (source.workspace && resolveRef(cwd, 'HEAD') !== source.sha)
      throw new Error(`Documentation workspace moved after source resolution: ${version.id}`)
    const series = JSON.parse(await readFile(join(cwd, 'docs/.vitepress/series.json'), 'utf8'))
    if (series.id !== version.id)
      throw new Error(`Series ${version.id} needs its documentation infrastructure patch in ${cwd}`)
    console.log(`[docs] ${version.label}: ${source.sha}${source.dirty ? ' (local changes)' : ''}`)
    if (!source.workspace)
      await run('pnpm', ['install', '--frozen-lockfile'], cwd, { SKIP_INSTALL_SIMPLE_GIT_HOOKS: '1' })
    await run('pnpm', ['docs:build'], cwd, {
      EASYINK_DOCS_BASE: `${docsBase}${version.id}/`,
      EASYINK_DOCS_VERSION: version.id,
      EASYINK_DOCS_SOURCE_SHA: source.sha,
      EASYINK_DOCS_VERSIONS_FILE: registryFile,
    })
    builds.push({ ...source, dir: join(cwd, 'docs/.vitepress/dist') })
  }
  const versions = await assembleSite(registry, builds, options.output)
  const summary = ['## Documentation sources', '', ...versions.map(version => `- ${version.label}: ${version.source}${version.dirty ? ' (local changes)' : ''}`), ''].join('\n')
  console.log(summary)
  if (process.env.GITHUB_STEP_SUMMARY)
    await appendFile(process.env.GITHUB_STEP_SUMMARY, summary)
  console.log(`[docs] assembled ${options.output}`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
