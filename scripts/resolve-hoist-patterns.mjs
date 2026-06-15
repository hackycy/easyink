import { existsSync } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, relative, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const packageRoots = [
  resolve(repoRoot, 'packages'),
  resolve(repoRoot, 'internal-packages'),
]
const defaultEntries = ['@easyink/viewer', '@easyink/builtin']
const runtimeDependencySections = ['dependencies', 'optionalDependencies']
const peerDependencySections = ['peerDependencies']
const ignoredDirs = new Set(['.git', '.turbo', 'dist', 'node_modules'])

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const workspacePackages = await collectWorkspacePackages()
  const graph = createGraphState()

  for (const entryName of options.entries) {
    await visitPackage({
      fromDir: repoRoot,
      graph,
      isEntry: true,
      packageName: entryName,
      workspacePackages,
    })
  }

  const patterns = createHoistPatterns({
    collapseEasyink: options.collapseEasyink,
    entries: options.entries,
    hoistPackages: graph.hoistPackages,
  })

  writeOutput({
    format: options.format,
    graph,
    patterns,
    entries: options.entries,
  })
}

function parseArgs(argv) {
  const options = {
    collapseEasyink: true,
    entries: [],
    format: 'yaml',
  }

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]

    if (argument === '--')
      continue

    if (argument === '--help' || argument === '-h') {
      printHelp()
      process.exit(0)
    }

    if (argument === '--format') {
      const value = argv[index + 1]
      if (!value)
        fail('Missing value for --format.')

      if (!['json', 'list', 'yaml'].includes(value))
        fail(`Unsupported format: ${value}`)

      options.format = value
      index += 1
      continue
    }

    if (argument === '--no-collapse-easyink') {
      options.collapseEasyink = false
      continue
    }

    if (argument.startsWith('-'))
      fail(`Unknown argument: ${argument}`)

    options.entries.push(argument)
  }

  if (options.entries.length === 0)
    options.entries = [...defaultEntries]

  return options
}

function printHelp() {
  console.log(`Usage: node ./scripts/resolve-hoist-patterns.mjs [options] [package...]

Resolve pnpm publicHoistPattern entries needed by preserveSymlinks=true hosts.

Options:
  --format yaml|list|json    Output format. Default: yaml
  --no-collapse-easyink      Print every @easyink package instead of @easyink/*
  -h, --help                 Show this help

Examples:
  node ./scripts/resolve-hoist-patterns.mjs
  node ./scripts/resolve-hoist-patterns.mjs @easyink/viewer @easyink/builtin
  node ./scripts/resolve-hoist-patterns.mjs --format list @easyink/builtin
`)
}

function createGraphState() {
  return {
    hoistPackages: new Set(),
    missingPackages: new Map(),
    peerPackages: new Set(),
    visitedPackages: new Set(),
  }
}

async function visitPackage({ fromDir, graph, isEntry, packageName, workspacePackages }) {
  const packageInfo = await resolvePackageInfo({
    fromDir,
    packageName,
    workspacePackages,
  })

  if (!packageInfo) {
    graph.hoistPackages.add(packageName)
    addMapSet(graph.missingPackages, packageName, fromDir)
    return
  }

  const resolvedName = packageInfo.packageJson.name ?? packageName
  if (!isEntry)
    graph.hoistPackages.add(resolvedName)

  if (graph.visitedPackages.has(resolvedName))
    return

  graph.visitedPackages.add(resolvedName)

  for (const peerName of collectDependencyNames(packageInfo.packageJson, peerDependencySections))
    graph.peerPackages.add(peerName)

  for (const dependencyName of collectDependencyNames(packageInfo.packageJson, runtimeDependencySections)) {
    graph.hoistPackages.add(dependencyName)
    await visitPackage({
      fromDir: packageInfo.packageDir,
      graph,
      isEntry: false,
      packageName: dependencyName,
      workspacePackages,
    })
  }
}

async function resolvePackageInfo({ fromDir, packageName, workspacePackages }) {
  const workspacePackage = workspacePackages.get(packageName)
  if (workspacePackage)
    return workspacePackage

  const packageJsonPath = resolveExternalPackageJson(packageName, fromDir)
  if (!packageJsonPath)
    return null

  return {
    packageDir: dirname(packageJsonPath),
    packageJson: await readJson(packageJsonPath),
    packageJsonPath,
  }
}

function resolveExternalPackageJson(packageName, fromDir) {
  const packageJsonSubpath = `${packageName}/package.json`
  const packageRequire = createRequire(resolve(fromDir, 'package.json'))

  try {
    return packageRequire.resolve(packageJsonSubpath)
  }
  catch {
    return findNodeModulesPackageJson(packageName, fromDir)
  }
}

function findNodeModulesPackageJson(packageName, fromDir) {
  let currentDir = fromDir

  while (true) {
    const candidate = resolve(currentDir, 'node_modules', ...packageName.split('/'), 'package.json')
    if (existsSync(candidate))
      return candidate

    const parentDir = dirname(currentDir)
    if (parentDir === currentDir)
      return null

    currentDir = parentDir
  }
}

async function collectWorkspacePackages() {
  const packageJsonPaths = []

  for (const packageRoot of packageRoots) {
    if (existsSync(packageRoot))
      packageJsonPaths.push(...await collectPackageJsonPaths(packageRoot))
  }

  const packages = new Map()

  for (const packageJsonPath of packageJsonPaths) {
    const packageJson = await readJson(packageJsonPath)
    if (!packageJson.name)
      continue

    packages.set(packageJson.name, {
      packageDir: dirname(packageJsonPath),
      packageJson,
      packageJsonPath,
    })
  }

  return packages
}

async function collectPackageJsonPaths(currentDir) {
  const entries = await readdir(currentDir, { withFileTypes: true })
  const packageJsonPaths = []

  for (const entry of entries) {
    const entryPath = resolve(currentDir, entry.name)

    if (entry.isDirectory()) {
      if (ignoredDirs.has(entry.name))
        continue

      packageJsonPaths.push(...await collectPackageJsonPaths(entryPath))
      continue
    }

    if (entry.isFile() && entry.name === 'package.json')
      packageJsonPaths.push(entryPath)
  }

  return packageJsonPaths
}

function collectDependencyNames(packageJson, sections) {
  const names = new Set()

  for (const section of sections) {
    for (const dependencyName of Object.keys(packageJson[section] ?? {}))
      names.add(dependencyName)
  }

  return [...names].sort()
}

function createHoistPatterns({ collapseEasyink, entries, hoistPackages }) {
  const entrySet = new Set(entries)
  const names = [...hoistPackages]
    .filter(packageName => !entrySet.has(packageName))
    .sort(comparePackageNames)

  const patterns = []
  let hasEasyinkPackage = false

  for (const packageName of names) {
    if (collapseEasyink && packageName.startsWith('@easyink/')) {
      hasEasyinkPackage = true
      continue
    }

    patterns.push(packageName)
  }

  if (hasEasyinkPackage)
    patterns.unshift('@easyink/*')

  return patterns
}

function writeOutput({ entries, format, graph, patterns }) {
  if (format === 'json') {
    console.log(JSON.stringify({
      entries,
      peerDependencies: [...graph.peerPackages].sort(comparePackageNames),
      publicHoistPattern: patterns,
      unexpandedPackages: mapSetToObject(graph.missingPackages),
      visitedPackages: [...graph.visitedPackages].sort(comparePackageNames),
    }, null, 2))
    return
  }

  if (format === 'list') {
    for (const pattern of patterns)
      console.log(pattern)
    return
  }

  console.log(`# entries: ${entries.join(', ')}`)
  console.log('publicHoistPattern:')

  for (const pattern of patterns)
    console.log(`  - ${quoteYamlString(pattern)}`)

  const peerPackages = [...graph.peerPackages].sort(comparePackageNames)
  if (peerPackages.length > 0) {
    console.log('')
    console.log('# peer dependencies should be installed by the app:')
    for (const peerPackage of peerPackages)
      console.log(`#   - ${peerPackage}`)
  }
}

function quoteYamlString(value) {
  return `'${value.replaceAll('\'', '\'\'')}'`
}

function addMapSet(map, key, value) {
  if (!map.has(key))
    map.set(key, new Set())

  map.get(key).add(toPosixPath(relative(repoRoot, value)))
}

function mapSetToObject(map) {
  return Object.fromEntries([...map.entries()].map(([key, values]) => [
    key,
    [...values].sort(),
  ]))
}

function comparePackageNames(left, right) {
  return left.localeCompare(right)
}

function toPosixPath(value) {
  return value.split('\\').join('/')
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'))
}

function fail(message) {
  console.error(`[hoist-patterns] ${message}`)
  process.exit(1)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
