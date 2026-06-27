import { readdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, relative, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const packagesRoot = resolve(repoRoot, 'packages')
const systemIgnoredDirs = new Set(['.git', '.turbo', 'dist', 'node_modules'])
const generatorConfig = {
  exclude: [],
  ignoreDirs: [],
  include: [],
}

async function main() {
  const runtimeOptions = parseRuntimeOptions(process.argv.slice(2))

  const rootPackageJson = await readJson(resolve(repoRoot, 'package.json'))
  const repositoryUrl = resolveRepositoryUrl(rootPackageJson)
  const packageJsonFiles = await collectPackageJsonFiles(packagesRoot)

  let updatedCount = 0
  let unchangedCount = 0
  let skippedCount = 0

  for (const packageJsonPath of packageJsonFiles) {
    const packageJson = await readJson(packageJsonPath)
    const packageDir = dirname(packageJsonPath)
    const relativePackageDir = toPosixPath(relative(packagesRoot, packageDir))

    if (!shouldIncludePackage({
      packageName: packageJson.name,
      relativePackageDir,
    })) {
      continue
    }

    if (!packageJson.name || !packageJson.description) {
      skippedCount += 1
      console.warn(`[package-readmes] skipped ${relativePackageDir}: missing name or description`)
      continue
    }

    const readmePath = resolve(packageDir, 'README.md')
    const readmeContent = buildReadme({
      description: packageJson.description,
      packageName: packageJson.name,
      repositoryUrl,
    })

    const currentContent = await readExistingFile(readmePath)
    if (currentContent === readmeContent) {
      unchangedCount += 1
      continue
    }

    if (runtimeOptions.dryRun) {
      console.log(`[package-readmes] would update ${toPosixPath(relative(repoRoot, readmePath))}`)
    }
    else {
      await writeFile(readmePath, readmeContent, 'utf8')
      console.log(`[package-readmes] updated ${toPosixPath(relative(repoRoot, readmePath))}`)
    }

    updatedCount += 1
  }

  const modeLabel = runtimeOptions.dryRun ? 'dry-run' : 'write'
  console.log(`[package-readmes] mode=${modeLabel} updated=${updatedCount} unchanged=${unchangedCount} skipped=${skippedCount}`)
}

function parseRuntimeOptions(argv) {
  const options = { dryRun: false }

  for (const argument of argv) {
    if (argument === '--dry-run') {
      options.dryRun = true
      continue
    }

    throw new Error(`Unknown argument: ${argument}`)
  }

  return options
}

async function collectPackageJsonFiles(currentDir) {
  const entries = await readdir(currentDir, { withFileTypes: true })
  const packageJsonFiles = []

  for (const entry of entries) {
    const entryPath = resolve(currentDir, entry.name)
    const relativeEntryDir = toPosixPath(relative(packagesRoot, entryPath))

    if (entry.isDirectory()) {
      if (shouldIgnoreDirectory({
        directoryName: entry.name,
        relativeDirectory: relativeEntryDir,
      })) {
        continue
      }

      packageJsonFiles.push(...await collectPackageJsonFiles(entryPath))
      continue
    }

    if (entry.isFile() && entry.name === 'package.json')
      packageJsonFiles.push(entryPath)
  }

  return packageJsonFiles
}

function shouldIgnoreDirectory({ directoryName, relativeDirectory }) {
  if (systemIgnoredDirs.has(directoryName))
    return true

  if (generatorConfig.ignoreDirs.includes(directoryName))
    return true

  if (matchesPatterns(relativeDirectory, generatorConfig.exclude))
    return true

  return false
}

function shouldIncludePackage({ packageName, relativePackageDir }) {
  const candidates = [
    packageName ?? '',
    relativePackageDir,
    `packages/${relativePackageDir}`,
  ]

  if (generatorConfig.exclude.length > 0 && candidates.some(candidate => matchesPatterns(candidate, generatorConfig.exclude)))
    return false

  if (generatorConfig.include.length === 0)
    return true

  return candidates.some(candidate => matchesPatterns(candidate, generatorConfig.include))
}

function matchesPatterns(value, patterns) {
  return patterns.some((pattern) => {
    const expression = new RegExp(`^${globToRegExpSource(pattern)}$`, 'i')
    return expression.test(value)
  })
}

function globToRegExpSource(pattern) {
  return pattern
    .split('*')
    .map(segment => escapeRegExp(segment))
    .join('.*')
}

function escapeRegExp(value) {
  return value.replace(/[|\\{}()[\]^$+?.]/g, '\\$&')
}

function buildReadme({ packageName, description, repositoryUrl }) {
  const npmPackageName = encodeURIComponent(packageName)
  const npmUrl = `https://www.npmjs.com/package/${npmPackageName}`
  const versionBadgeUrl = `https://img.shields.io/npm/v/${npmPackageName}?logo=npm`
  const downloadsBadgeUrl = `https://img.shields.io/npm/dm/${npmPackageName}?logo=npm`
  const documentationUrl = `https://hackycy.github.io/easyink/docs/`

  return [
    `# ${packageName}`,
    '',
    `[![npm version](${versionBadgeUrl})](${npmUrl}) [![npm downloads](${downloadsBadgeUrl})](${npmUrl})`,
    '',
    description.trim(),
    '',
    '## Documentation',
    '',
    `- [Docs](${documentationUrl})`,
    '',
    '## License',
    '',
    `[MIT](${repositoryUrl}/blob/main/LICENSE) © 2025-present hackycy`,
    '',
  ].join('\n')
}

function resolveRepositoryUrl(rootPackageJson) {
  const repositoryField = rootPackageJson.repository
  const rawRepositoryUrl = typeof repositoryField === 'string'
    ? repositoryField
    : repositoryField?.url ?? rootPackageJson.homepage

  if (!rawRepositoryUrl)
    throw new Error('Unable to resolve repository URL from the root package.json')

  return normalizeRepositoryUrl(rawRepositoryUrl)
}

function normalizeRepositoryUrl(repositoryUrl) {
  return repositoryUrl
    .replace(/^git\+/, '')
    .replace(/^git@github.com:/, 'https://github.com/')
    .replace(/\.git$/, '')
    .replace(/#.*$/, '')
}

async function readJson(filePath) {
  const source = await readFile(filePath, 'utf8')
  return JSON.parse(source)
}

async function readExistingFile(filePath) {
  try {
    return await readFile(filePath, 'utf8')
  }
  catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')
      return null

    throw error
  }
}

function toPosixPath(filePath) {
  return filePath.split('\\').join('/')
}

main().catch((error) => {
  console.error(`[package-readmes] ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})
