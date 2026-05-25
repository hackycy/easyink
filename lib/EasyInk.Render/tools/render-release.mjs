import { Buffer } from 'node:buffer'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { chmod, mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, relative, resolve } from 'node:path'
import process from 'node:process'
import { pipeline } from 'node:stream/promises'
import { fileURLToPath } from 'node:url'
import { unzipSync, zipSync } from 'fflate'

const toolDir = dirname(fileURLToPath(import.meta.url))
const renderRoot = resolve(toolDir, '..')
const repoRoot = resolve(renderRoot, '../..')
const hostRoot = resolve(renderRoot, 'host')
const defaultManifestPath = resolve(renderRoot, 'manifests/runtime-manifest.sample.json')
const defaultRuntimeBundleRoot = resolve(hostRoot, 'internal/easyink')
const defaultDockerImage = 'golang:1.23-bookworm'
const defaultDockerPlatform = 'linux/amd64'
const dockerSourceRoot = '/src'
const dockerOutputRoot = '/out'
const easyinkRuntimeEntry = 'runtime/easyink-viewer/index.html'
const requiredRuntimeBundleFiles = [
  easyinkRuntimeEntry,
  'runtime/easyink-viewer/assets/viewer.css',
  'runtime/easyink-viewer/assets/viewer.js',
  'runtime/easyink-viewer/assets/vendor/qrcode-generator.js',
  'runtime/easyink-viewer/assets/vendor/jsbarcode.all.min.js',
  'runtime/easyink-viewer/assets/materials/manifest.json',
]
const requiredRuntimeMaterials = [
  'text',
  'rect',
  'line',
  'image',
  'qrcode',
  'barcode',
  'ellipse',
  'table-static',
  'table-data',
  'flow-row',
  'chart',
  'page-number',
  'container',
  'svg-star',
  'svg-heart',
  'svg',
]
const supportedPlatforms = new Set(['win-x64', 'win-x86', 'linux-x64', 'linux-arm64', 'darwin-x64', 'darwin-arm64'])
const defaultPlatforms = Array.from(supportedPlatforms)
const defaultChromeForTestingDownloadsURL = 'https://googlechromelabs.github.io/chrome-for-testing/known-good-versions-with-downloads.json'
const hostTargets = {
  'win-x64': { goos: 'windows', goarch: 'amd64', executable: 'easyink-render.exe', archive: 'zip' },
  'win-x86': { goos: 'windows', goarch: '386', executable: 'easyink-render.exe', archive: 'zip' },
  'linux-x64': { goos: 'linux', goarch: 'amd64', executable: 'easyink-render', archive: 'tar.gz' },
  'linux-arm64': { goos: 'linux', goarch: 'arm64', executable: 'easyink-render', archive: 'tar.gz' },
  'darwin-x64': { goos: 'darwin', goarch: 'amd64', executable: 'easyink-render', archive: 'tar.gz' },
  'darwin-arm64': { goos: 'darwin', goarch: 'arm64', executable: 'easyink-render', archive: 'tar.gz' },
}
const browserTargets = {
  'win-x64': { cftPlatform: 'win64', executable: 'chrome-headless-shell.exe' },
  'win-x86': { cftPlatform: 'win32', executable: 'chrome-headless-shell.exe' },
  'linux-x64': { cftPlatform: 'linux64', executable: 'chrome-headless-shell' },
  'linux-arm64': { cftPlatform: 'linux-arm64', executable: 'chrome-headless-shell' },
  'darwin-x64': { cftPlatform: 'mac-x64', executable: 'chrome-headless-shell' },
  'darwin-arm64': { cftPlatform: 'mac-arm64', executable: 'chrome-headless-shell' },
}

export async function readJsonFile(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'))
}

export async function fetchJson(url) {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`GET ${url} failed with ${response.status}`)
  }
  return response.json()
}

export function validateManifest(manifest) {
  const errors = []
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    return ['manifest must be an object']
  }
  requireEqual(errors, manifest.schemaVersion, 1, 'schemaVersion')
  requireNonEmptyString(errors, manifest.protocolVersion, 'protocolVersion')
  validatePackageRef(errors, manifest.host, 'host', { requireName: false })
  validatePackageRef(errors, manifest.browser, 'browser', { requireName: true })
  validateRuntime(errors, manifest.easyinkRuntime)
  validateCompatibility(errors, manifest.compatibility, manifest.protocolVersion)
  return errors
}

export async function verifyPackageReference(reference, archivePath, options = {}) {
  const info = await fileInfo(archivePath)
  const errors = []
  if (reference.size !== info.size) {
    errors.push(`size mismatch: manifest=${reference.size} actual=${info.size}`)
  }
  if (reference.sha256 !== info.sha256) {
    errors.push(`sha256 mismatch: manifest=${reference.sha256} actual=${info.sha256}`)
  }
  if (options.requireExecutable !== false) {
    const executable = options.executable ?? reference.executable
    if (executable) {
      const executableFound = await archiveContainsExecutable(archivePath, executable)
      if (!executableFound) {
        errors.push(`executable not found in archive: ${executable}`)
      }
    }
  }
  return { ...info, errors }
}

export async function verifyBrowserArchiveStartup(reference, archivePath, options = {}) {
  const packageVerification = await verifyPackageReference(reference, archivePath)
  if (packageVerification.errors.length > 0) {
    return { ...packageVerification, startup: null }
  }
  const tempDir = await mkdtemp(resolve(tmpdir(), 'easyink-render-browser-startup-'))
  try {
    await extractArchive(archivePath, tempDir)
    const executablePath = await findFilePathByBaseName(tempDir, basename(reference.executable))
    if (!executablePath) {
      return {
        ...packageVerification,
        startup: null,
        errors: [`executable not found in archive: ${reference.executable}`],
      }
    }
    await chmod(executablePath, 0o755)
    const startup = await runCommandCapture(executablePath, ['--version'], {
      timeoutMs: options.timeoutMs ?? 10000,
    })
    const output = `${startup.stdout}\n${startup.stderr}`
    const errors = []
    if (startup.exitCode !== 0) {
      errors.push(`browser startup exited with code ${startup.exitCode}`)
    }
    if (!output.includes(reference.version)) {
      errors.push(`browser version output did not include ${reference.version}`)
    }
    return {
      ...packageVerification,
      startup,
      errors,
    }
  }
  finally {
    await rm(tempDir, { recursive: true, force: true })
  }
}

export async function verifyRuntimeBundle(manifest, options = {}) {
  const errors = validateManifest(manifest)
  if (errors.length > 0) {
    return errors
  }
  const runtime = manifest.easyinkRuntime
  if (runtime.bundled !== true) {
    errors.push('easyinkRuntime.bundled must be true for the embedded EasyInk viewer runtime')
  }
  if (runtime.entry !== easyinkRuntimeEntry) {
    errors.push(`easyinkRuntime.entry must be ${JSON.stringify(easyinkRuntimeEntry)}`)
  }

  const runtimeRoot = resolve(options.runtimeRoot ?? defaultRuntimeBundleRoot)
  const missingFileErrors = []
  for (const file of requiredRuntimeBundleFiles) {
    const path = resolve(runtimeRoot, file)
    if (!await fileExists(path)) {
      missingFileErrors.push(`runtime bundle file missing: ${file}`)
    }
  }
  errors.push(...missingFileErrors)
  if (missingFileErrors.length > 0) {
    return errors
  }

  const materialsPath = resolve(runtimeRoot, 'runtime/easyink-viewer/assets/materials/manifest.json')
  let materials
  try {
    materials = await readJsonFile(materialsPath)
  }
  catch (error) {
    errors.push(`runtime materials manifest is invalid JSON: ${error instanceof Error ? error.message : String(error)}`)
    return errors
  }
  if (materials.schemaVersion !== 1) {
    errors.push('runtime materials manifest schemaVersion must be 1')
  }
  if (materials.runtime !== 'easyink-viewer') {
    errors.push('runtime materials manifest runtime must be "easyink-viewer"')
  }
  const materialTypes = new Set(Array.isArray(materials.materials)
    ? materials.materials.map(item => item?.type).filter(Boolean)
    : [])
  for (const type of requiredRuntimeMaterials) {
    if (!materialTypes.has(type)) {
      errors.push(`runtime materials manifest missing material type: ${type}`)
    }
  }
  return errors
}

export async function fileInfo(filePath) {
  const stats = await stat(filePath)
  if (!stats.isFile()) {
    throw new Error(`not a file: ${filePath}`)
  }
  return {
    size: stats.size,
    sha256: await sha256File(filePath),
  }
}

export async function buildHostPackage(options) {
  const platform = requireKnownPlatform(options.platform)
  const target = hostTargets[platform]
  const version = options.version
  requireVersion(version)
  const outDir = resolve(options.outDir ?? resolve(renderRoot, 'releases'), `host/${version}/${platform}`)
  await mkdir(outDir, { recursive: true })

  const executablePath = resolve(outDir, target.executable)
  if (options.docker) {
    await buildHostExecutableWithDocker({
      dockerCommand: options.dockerCommand ?? 'docker',
      dockerImage: options.dockerImage ?? defaultDockerImage,
      dockerPlatform: options.dockerPlatform ?? defaultDockerPlatform,
      hostRoot,
      outDir,
      target,
    })
  }
  else {
    await runCommand(
      options.goCommand ?? 'go',
      [...(options.goCommandArgs ?? []), 'build', '-trimpath', '-ldflags', '-s -w', '-o', executablePath, './cmd/easyink-render-host'],
      {
        cwd: hostRoot,
        env: {
          ...process.env,
          CGO_ENABLED: '0',
          GOOS: target.goos,
          GOARCH: target.goarch,
        },
      },
    )
  }

  const archiveName = target.archive === 'zip'
    ? `easyink-render-${version}-${platform}.zip`
    : `easyink-render-${version}-${platform}.tar.gz`
  const archivePath = resolve(outDir, archiveName)
  if (target.archive === 'zip') {
    const input = await readFile(executablePath)
    await writeFile(archivePath, zipSync({ [target.executable]: input }, { level: 9 }))
  }
  else {
    await runCommand('tar', ['-czf', archivePath, '-C', outDir, target.executable], { cwd: outDir })
  }
  const archive = await fileInfo(archivePath)
  return {
    platform,
    executable: target.executable,
    archivePath,
    archiveName,
    size: archive.size,
    sha256: archive.sha256,
  }
}

export function createDockerGoBuildArgs(options) {
  const image = options.dockerImage ?? defaultDockerImage
  const platform = options.dockerPlatform ?? defaultDockerPlatform
  const command = [
    'set -e',
    `CGO_ENABLED=0 GOOS=${options.target.goos} GOARCH=${options.target.goarch} /usr/local/go/bin/go build -trimpath -ldflags '-s -w' -o ${quoteSh(`${dockerOutputRoot}/${options.target.executable}`)} ./cmd/easyink-render-host`,
  ].join('; ')
  return [
    'run',
    '--rm',
    '--platform',
    platform,
    '-v',
    `${options.hostRoot}:${dockerSourceRoot}`,
    '-v',
    `${options.outDir}:${dockerOutputRoot}`,
    '-w',
    dockerSourceRoot,
    image,
    'sh',
    '-lc',
    command,
  ]
}

async function buildHostExecutableWithDocker(options) {
  await runCommand(
    options.dockerCommand,
    createDockerGoBuildArgs(options),
    {},
  )
}

export async function buildBrowserBundle(options) {
  const platform = requireKnownPlatform(options.platform)
  const version = options.version
  requireBrowserVersion(version)
  const browserDir = resolve(repoRoot, requiredOption(options, 'browserDir'))
  const browserStats = await stat(browserDir)
  if (!browserStats.isDirectory()) {
    throw new Error(`browserDir must be a directory: ${browserDir}`)
  }
  const executable = requiredOption(options, 'executable')
  const executablePath = resolve(browserDir, executable)
  const executableStats = await stat(executablePath)
  if (!executableStats.isFile()) {
    throw new Error(`browser executable is not a file: ${executablePath}`)
  }
  const outDir = resolve(options.outDir ?? resolve(renderRoot, 'releases'), `browser/${version}/${platform}`)
  await mkdir(outDir, { recursive: true })
  const archiveName = platform.startsWith('win-')
    ? `chrome-for-testing-${version}-${platform}.zip`
    : `chrome-for-testing-${version}-${platform}.tar.gz`
  const archivePath = resolve(outDir, archiveName)
  if (platform.startsWith('win-')) {
    await writeFile(archivePath, zipSync(await collectZipTree(browserDir), { level: 9 }))
  }
  else {
    await runCommand('tar', ['-czf', archivePath, '-C', browserDir, '.'], { cwd: browserDir })
  }
  const archive = await fileInfo(archivePath)
  return {
    name: 'chrome-for-testing',
    platform,
    version,
    executable,
    archivePath,
    archiveName,
    size: archive.size,
    sha256: archive.sha256,
  }
}

export async function downloadChromeForTestingArchive(options) {
  const version = options.version
  requireBrowserVersion(version)
  const platform = requireKnownPlatform(options.platform)
  const binary = options.binary ?? 'chrome-headless-shell'
  const downloadsURL = options.downloadsURL ?? defaultChromeForTestingDownloadsURL
  const index = options.index ?? await fetchJson(downloadsURL)
  const resolvedDownload = resolveChromeForTestingDownload(index, { version, platform, binary })
  const outDir = resolve(options.outDir ?? resolve(renderRoot, 'releases'), `browser/${version}/${platform}`)
  await mkdir(outDir, { recursive: true })
  const archiveName = basename(new URL(resolvedDownload.url).pathname)
  const archivePath = resolve(outDir, archiveName)
  await downloadFile(resolvedDownload.url, archivePath)
  const archive = await fileInfo(archivePath)
  return {
    name: 'chrome-for-testing',
    platform,
    version,
    executable: resolvedDownload.executable,
    archivePath,
    archiveName,
    size: archive.size,
    sha256: archive.sha256,
    url: resolvedDownload.url,
    binary,
  }
}

export function resolveChromeForTestingDownload(index, options) {
  const platform = requireKnownPlatform(options.platform)
  const target = browserTargets[platform]
  const version = options.version
  requireBrowserVersion(version)
  const binary = options.binary ?? 'chrome-headless-shell'
  const versionEntry = Array.isArray(index?.versions)
    ? index.versions.find(item => item?.version === version)
    : undefined
  if (!versionEntry) {
    throw new Error(`Chrome for Testing version not found: ${version}`)
  }
  const downloads = versionEntry.downloads?.[binary]
  if (!Array.isArray(downloads)) {
    throw new TypeError(`Chrome for Testing binary not found for ${version}: ${binary}`)
  }
  const download = downloads.find(item => item?.platform === target.cftPlatform)
  if (!download?.url) {
    throw new Error(`Chrome for Testing download not found for ${version} ${platform} (${target.cftPlatform})`)
  }
  return {
    version,
    platform,
    cftPlatform: target.cftPlatform,
    binary,
    executable: target.executable,
    url: download.url,
  }
}

export function createRuntimeManifest({ baseManifest, hostPackage, browserBundle, urlBase = '' }) {
  const hostUrl = urlBase
    ? `${urlBase.replace(/\/$/, '')}/host/${baseManifest.host.version}/${hostPackage.platform}/${hostPackage.archiveName}`
    : ''
  const browserUrl = browserBundle && urlBase
    ? `${urlBase.replace(/\/$/, '')}/browser/${browserBundle.version}/${browserBundle.platform}/${browserBundle.archiveName}`
    : ''
  return {
    ...baseManifest,
    host: {
      ...baseManifest.host,
      platform: hostPackage.platform,
      executable: hostPackage.executable,
      url: hostUrl,
      sha256: hostPackage.sha256,
      size: hostPackage.size,
    },
    browser: browserBundle
      ? {
          ...baseManifest.browser,
          name: browserBundle.name,
          version: browserBundle.version,
          platform: browserBundle.platform,
          executable: browserBundle.executable,
          url: browserUrl,
          sha256: browserBundle.sha256,
          size: browserBundle.size,
        }
      : baseManifest.browser,
  }
}

export async function writeRuntimeManifest(manifest, outDir, platform) {
  await mkdir(outDir, { recursive: true })
  const path = resolve(outDir, `runtime-manifest.${platform}.json`)
  await writeFile(path, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  return path
}

export function packageToManifestBrowser(bundle) {
  return {
    name: bundle.name,
    version: bundle.version,
    platform: bundle.platform,
    executable: bundle.executable,
    url: bundle.url ?? '',
    sha256: bundle.sha256,
    size: bundle.size,
  }
}

export function parsePlatformList(value) {
  if (!value || value === 'all') {
    return defaultPlatforms
  }
  const platforms = value.split(',').map(item => item.trim()).filter(Boolean)
  if (platforms.length === 0) {
    return defaultPlatforms
  }
  return platforms.map(requireKnownPlatform)
}

function parseBooleanOption(value) {
  return value === 'true' || value === '1' || value === 'yes'
}

function resolveHostBuildOptions(options) {
  return {
    docker: parseBooleanOption(options.docker),
    dockerImage: options.dockerImage,
    dockerPlatform: options.dockerPlatform,
  }
}

function quoteSh(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`
}

export function createReleaseIndex({ kind, version, packages }) {
  return {
    schemaVersion: 1,
    kind,
    version,
    generatedAt: new Date().toISOString(),
    packages: packages.map(item => ({
      platform: item.platform,
      manifestPath: item.manifestPath,
      archivePath: item.archivePath,
      archiveName: item.archiveName,
      executable: item.executable,
      size: item.size,
      sha256: item.sha256,
    })),
  }
}

function validatePackageRef(errors, value, label, options) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    errors.push(`${label} must be an object`)
    return
  }
  if (options.requireName) {
    requireNonEmptyString(errors, value.name, `${label}.name`)
  }
  if (label === 'browser') {
    requireBrowserVersionField(errors, value.version, `${label}.version`)
  }
  else {
    requireVersionField(errors, value.version, `${label}.version`)
  }
  requireKnownPlatformField(errors, value.platform, `${label}.platform`)
  requireNonEmptyString(errors, value.executable, `${label}.executable`)
  requireString(errors, value.url, `${label}.url`)
  requireSha256(errors, value.sha256, `${label}.sha256`, { allowEmpty: value.url === '' && value.size === 0 })
  requireNonNegativeInteger(errors, value.size, `${label}.size`)
}

function validateRuntime(errors, value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    errors.push('easyinkRuntime must be an object')
    return
  }
  requireNonEmptyString(errors, value.version, 'easyinkRuntime.version')
  if (typeof value.bundled !== 'boolean') {
    errors.push('easyinkRuntime.bundled must be a boolean')
  }
  requireNonEmptyString(errors, value.entry, 'easyinkRuntime.entry')
  requireEqual(errors, value.entry, easyinkRuntimeEntry, 'easyinkRuntime.entry')
}

function validateCompatibility(errors, value, protocolVersion) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    errors.push('compatibility must be an object')
    return
  }
  requireNonEmptyString(errors, value.minOs, 'compatibility.minOs')
  requireEqual(errors, value.protocol, protocolVersion, 'compatibility.protocol')
}

function requireEqual(errors, actual, expected, label) {
  if (actual !== expected) {
    errors.push(`${label} must be ${JSON.stringify(expected)}`)
  }
}

function requireString(errors, value, label) {
  if (typeof value !== 'string') {
    errors.push(`${label} must be a string`)
  }
}

function requireNonEmptyString(errors, value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    errors.push(`${label} must be a non-empty string`)
  }
}

function requireNonNegativeInteger(errors, value, label) {
  if (!Number.isSafeInteger(value) || value < 0) {
    errors.push(`${label} must be a non-negative integer`)
  }
}

function requireSha256(errors, value, label, options) {
  if (options.allowEmpty && value === '') {
    return
  }
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/i.test(value)) {
    errors.push(`${label} must be a SHA256 hex digest`)
  }
}

function requireKnownPlatformField(errors, value, label) {
  if (!supportedPlatforms.has(value)) {
    errors.push(`${label} must be one of ${Array.from(supportedPlatforms).join(', ')}`)
  }
}

function requireKnownPlatform(platform) {
  if (!hostTargets[platform]) {
    throw new Error(`Unsupported platform: ${platform}`)
  }
  return platform
}

function requireVersionField(errors, value, label) {
  if (!isSemver(value)) {
    errors.push(`${label} must be a semantic version`)
  }
}

function requireVersion(version) {
  if (!isSemver(version)) {
    throw new Error(`Invalid version: ${version}`)
  }
}

function requireBrowserVersionField(errors, value, label) {
  if (!isBrowserVersion(value)) {
    errors.push(`${label} must be a semantic or Chrome-style version`)
  }
}

function requireBrowserVersion(version) {
  if (!isBrowserVersion(version)) {
    throw new Error(`Invalid browser version: ${version}`)
  }
}

function isSemver(value) {
  return typeof value === 'string' && /^\d+\.\d+\.\d+(?:[-+][\d.a-z-]+)?$/i.test(value)
}

function isBrowserVersion(value) {
  return isSemver(value) || (typeof value === 'string' && /^\d+\.\d+\.\d+\.\d+$/.test(value))
}

async function sha256File(filePath) {
  const hash = createHash('sha256')
  await new Promise((resolvePromise, reject) => {
    createReadStream(filePath)
      .on('data', chunk => hash.update(chunk))
      .on('error', reject)
      .on('end', resolvePromise)
  })
  return hash.digest('hex')
}

async function downloadFile(url, filePath) {
  const response = await fetch(url)
  if (!response.ok || !response.body) {
    throw new Error(`GET ${url} failed with ${response.status}`)
  }
  await pipeline(response.body, createWriteStream(filePath))
}

async function runCommand(command, args, options) {
  await new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd: options?.cwd,
      env: options?.env,
      shell: shouldRunThroughShell(command),
      stdio: 'inherit',
    })
    child.on('error', reject)
    child.on('exit', (code) => {
      if (code === 0) {
        resolvePromise()
        return
      }
      reject(new Error(`${command} ${args.join(' ')} exited with code ${code}`))
    })
  })
}

async function runCommandCapture(command, args, options = {}) {
  return await new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      shell: shouldRunThroughShell(command),
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const chunks = { stdout: [], stderr: [] }
    const timeout = setTimeout(() => {
      child.kill('SIGKILL')
      reject(new Error(`${command} ${args.join(' ')} timed out after ${options.timeoutMs}ms`))
    }, options.timeoutMs ?? 10000)
    child.stdout.on('data', chunk => chunks.stdout.push(chunk))
    child.stderr.on('data', chunk => chunks.stderr.push(chunk))
    child.on('error', (error) => {
      clearTimeout(timeout)
      reject(error)
    })
    child.on('exit', (code) => {
      clearTimeout(timeout)
      resolvePromise({
        exitCode: code ?? 0,
        stdout: Buffer.concat(chunks.stdout).toString('utf8'),
        stderr: Buffer.concat(chunks.stderr).toString('utf8'),
      })
    })
  })
}

function shouldRunThroughShell(command) {
  return process.platform === 'win32' && /\.(?:bat|cmd)$/i.test(command)
}

async function archiveContainsExecutable(archivePath, executable) {
  const tempDir = await mkdtemp(resolve(tmpdir(), 'easyink-render-verify-'))
  try {
    await extractArchive(archivePath, tempDir)
    return await fileExists(resolve(tempDir, executable)) || await findFileByBaseName(tempDir, basename(executable))
  }
  finally {
    await rm(tempDir, { recursive: true, force: true })
  }
}

async function extractArchive(archivePath, outDir) {
  if (archivePath.endsWith('.zip')) {
    const content = await readFile(archivePath)
    const entries = unzipSync(content)
    for (const [name, data] of Object.entries(entries)) {
      const normalized = name.replace(/\\/g, '/')
      const targetPath = resolve(outDir, normalized)
      if (normalized.endsWith('/')) {
        await mkdir(targetPath, { recursive: true })
        continue
      }
      await mkdir(dirname(targetPath), { recursive: true })
      await writeFile(targetPath, data)
    }
    return
  }
  if (archivePath.endsWith('.tar.gz') || archivePath.endsWith('.tgz')) {
    await runCommand('tar', ['-xzf', archivePath, '-C', outDir], {})
    return
  }
  throw new Error(`Unsupported archive format: ${archivePath}`)
}

async function collectZipTree(rootDir) {
  const tree = {}
  async function walk(dir, node) {
    const dirents = await readdir(dir, { withFileTypes: true })
    for (const dirent of dirents) {
      const fullPath = resolve(dir, dirent.name)
      if (dirent.isDirectory()) {
        const child = {}
        node[dirent.name] = child
        await walk(fullPath, child)
        continue
      }
      node[dirent.name] = await readFile(fullPath)
    }
  }
  await walk(rootDir, tree)
  return tree
}

async function fileExists(filePath) {
  try {
    const stats = await stat(filePath)
    return stats.isFile()
  }
  catch {
    return false
  }
}

async function findFileByBaseName(root, fileName) {
  const entries = await readdir(root, { withFileTypes: true })
  for (const entry of entries) {
    const path = resolve(root, entry.name)
    if (entry.isFile() && entry.name === fileName) {
      return true
    }
    if (entry.isDirectory() && await findFileByBaseName(path, fileName)) {
      return true
    }
  }
  return false
}

async function findFilePathByBaseName(root, fileName) {
  const entries = await readdir(root, { withFileTypes: true })
  for (const entry of entries) {
    const path = resolve(root, entry.name)
    if (entry.isFile() && entry.name === fileName) {
      return path
    }
    if (entry.isDirectory()) {
      const found = await findFilePathByBaseName(path, fileName)
      if (found) {
        return found
      }
    }
  }
  return ''
}

function parseArgs(argv) {
  const [command, ...rest] = argv
  const options = {}
  for (let i = 0; i < rest.length; i += 1) {
    const name = rest[i]
    if (!name.startsWith('--')) {
      throw new Error(`Unexpected argument: ${name}`)
    }
    const key = name.slice(2)
    const value = rest[i + 1]
    if (value === undefined || value.startsWith('--')) {
      throw new Error(`Missing value for ${name}`)
    }
    options[key] = value
    i += 1
  }
  return { command, options }
}

async function main(argv) {
  const { command, options } = parseArgs(argv)
  if (command === 'validate-manifest') {
    const manifestPath = resolve(repoRoot, options.manifest ?? defaultManifestPath)
    const manifest = await readJsonFile(manifestPath)
    const errors = await verifyRuntimeBundle(manifest, {
      runtimeRoot: options.runtimeRoot ? resolve(repoRoot, options.runtimeRoot) : undefined,
    })
    if (errors.length > 0) {
      throw new Error(`Manifest validation failed:\n${errors.map(error => `- ${error}`).join('\n')}`)
    }
    console.warn(`[render-release] manifest and runtime bundle valid: ${relative(repoRoot, manifestPath)}`)
    return
  }
  if (command === 'verify-package') {
    const manifestPath = resolve(repoRoot, options.manifest ?? defaultManifestPath)
    const archivePath = resolve(repoRoot, requiredOption(options, 'archive'))
    const manifest = await readJsonFile(manifestPath)
    const kind = options.kind ?? 'host'
    const reference = kind === 'browser'
      ? manifest.browser
      : kind === 'host'
        ? manifest.host
        : undefined
    if (!reference) {
      throw new Error(`Unsupported package kind: ${kind}`)
    }
    const result = await verifyPackageReference(reference, archivePath)
    if (result.errors.length > 0) {
      throw new Error(`Package verification failed:\n${result.errors.map(error => `- ${error}`).join('\n')}`)
    }
    console.warn(`[render-release] package verified: ${relative(repoRoot, archivePath)}`)
    return
  }
  if (command === 'verify-browser') {
    const manifestPath = resolve(repoRoot, options.manifest ?? defaultManifestPath)
    const archivePath = resolve(repoRoot, requiredOption(options, 'archive'))
    const manifest = await readJsonFile(manifestPath)
    const result = await verifyBrowserArchiveStartup(manifest.browser, archivePath, {
      timeoutMs: options.timeoutMs ? Number(options.timeoutMs) : undefined,
    })
    if (result.errors.length > 0) {
      throw new Error(`Browser verification failed:\n${result.errors.map(error => `- ${error}`).join('\n')}`)
    }
    const versionOutput = (result.startup?.stdout || result.startup?.stderr || '').trim()
    console.warn(`[render-release] browser verified: ${relative(repoRoot, archivePath)}`)
    if (versionOutput) {
      console.warn(`[render-release] browser version: ${versionOutput}`)
    }
    return
  }
  if (command === 'build-host') {
    const baseManifest = await readJsonFile(resolve(repoRoot, options.manifest ?? defaultManifestPath))
    const platform = requiredOption(options, 'platform')
    const version = options.version ?? baseManifest.host.version
    const outDir = resolve(repoRoot, options.outDir ?? 'lib/EasyInk.Render/releases')
    const hostPackage = await buildHostPackage({
      platform,
      version,
      outDir,
      ...resolveHostBuildOptions(options),
    })
    const manifest = createRuntimeManifest({
      baseManifest: {
        ...baseManifest,
        host: {
          ...baseManifest.host,
          version,
        },
      },
      hostPackage,
      urlBase: options.urlBase ?? '',
    })
    const errors = validateManifest(manifest)
    if (errors.length > 0) {
      throw new Error(`Generated manifest validation failed:\n${errors.map(error => `- ${error}`).join('\n')}`)
    }
    const manifestPath = await writeRuntimeManifest(manifest, dirname(hostPackage.archivePath), platform)
    console.warn(`[render-release] host package: ${relative(repoRoot, hostPackage.archivePath)}`)
    console.warn(`[render-release] manifest: ${relative(repoRoot, manifestPath)}`)
    return
  }
  if (command === 'build-host-matrix') {
    const baseManifest = await readJsonFile(resolve(repoRoot, options.manifest ?? defaultManifestPath))
    const version = options.version ?? baseManifest.host.version
    const outDir = resolve(repoRoot, options.outDir ?? 'lib/EasyInk.Render/releases')
    const platforms = parsePlatformList(options.platforms)
    const hostBuildOptions = resolveHostBuildOptions(options)
    const packages = []
    for (const platform of platforms) {
      const hostPackage = await buildHostPackage({
        platform,
        version,
        outDir,
        ...hostBuildOptions,
      })
      const manifest = createRuntimeManifest({
        baseManifest: {
          ...baseManifest,
          host: {
            ...baseManifest.host,
            version,
          },
        },
        hostPackage,
        urlBase: options.urlBase ?? '',
      })
      const errors = validateManifest(manifest)
      if (errors.length > 0) {
        throw new Error(`Generated manifest validation failed for ${platform}:\n${errors.map(error => `- ${error}`).join('\n')}`)
      }
      const manifestPath = await writeRuntimeManifest(manifest, dirname(hostPackage.archivePath), platform)
      const verification = await verifyPackageReference(manifest.host, hostPackage.archivePath)
      if (verification.errors.length > 0) {
        throw new Error(`Host package verification failed for ${platform}:\n${verification.errors.map(error => `- ${error}`).join('\n')}`)
      }
      packages.push({
        ...hostPackage,
        manifestPath: relative(repoRoot, manifestPath),
        archivePath: relative(repoRoot, hostPackage.archivePath),
      })
      console.warn(`[render-release] host package: ${relative(repoRoot, hostPackage.archivePath)}`)
      console.warn(`[render-release] manifest: ${relative(repoRoot, manifestPath)}`)
    }
    const index = createReleaseIndex({ kind: 'host', version, packages })
    const indexPath = resolve(outDir, `host/${version}/release-index.json`)
    await mkdir(dirname(indexPath), { recursive: true })
    await writeFile(indexPath, `${JSON.stringify(index, null, 2)}\n`, 'utf8')
    console.warn(`[render-release] release index: ${relative(repoRoot, indexPath)}`)
    return
  }
  if (command === 'build-browser') {
    const baseManifest = await readJsonFile(resolve(repoRoot, options.manifest ?? defaultManifestPath))
    const platform = requiredOption(options, 'platform')
    const version = options.version ?? baseManifest.browser.version
    const outDir = resolve(repoRoot, options.outDir ?? 'lib/EasyInk.Render/releases')
    const bundle = await buildBrowserBundle({
      platform,
      version,
      outDir,
      browserDir: requiredOption(options, 'browserDir'),
      executable: requiredOption(options, 'browserExecutable'),
    })
    const manifest = {
      ...baseManifest,
      browser: packageToManifestBrowser(bundle),
    }
    const errors = validateManifest(manifest)
    if (errors.length > 0) {
      throw new Error(`Generated browser manifest validation failed:\n${errors.map(error => `- ${error}`).join('\n')}`)
    }
    const manifestPath = await writeRuntimeManifest(manifest, dirname(bundle.archivePath), platform)
    console.warn(`[render-release] browser bundle: ${relative(repoRoot, bundle.archivePath)}`)
    console.warn(`[render-release] manifest: ${relative(repoRoot, manifestPath)}`)
    return
  }
  if (command === 'download-browser') {
    const baseManifest = await readJsonFile(resolve(repoRoot, options.manifest ?? defaultManifestPath))
    const platform = requiredOption(options, 'platform')
    const version = options.version ?? baseManifest.browser.version
    const outDir = resolve(repoRoot, options.outDir ?? 'lib/EasyInk.Render/releases')
    const bundle = await downloadChromeForTestingArchive({
      platform,
      version,
      outDir,
      binary: options.binary ?? 'chrome-headless-shell',
      downloadsURL: options.downloadsUrl ?? defaultChromeForTestingDownloadsURL,
    })
    const manifest = {
      ...baseManifest,
      browser: packageToManifestBrowser(bundle),
    }
    const errors = validateManifest(manifest)
    if (errors.length > 0) {
      throw new Error(`Downloaded browser manifest validation failed:\n${errors.map(error => `- ${error}`).join('\n')}`)
    }
    const manifestPath = await writeRuntimeManifest(manifest, dirname(bundle.archivePath), platform)
    console.warn(`[render-release] browser archive downloaded: ${relative(repoRoot, bundle.archivePath)}`)
    console.warn(`[render-release] manifest: ${relative(repoRoot, manifestPath)}`)
    return
  }
  if (command === 'build-runtime') {
    const hostManifest = await readJsonFile(resolve(repoRoot, requiredOption(options, 'hostManifest')))
    const browserManifest = await readJsonFile(resolve(repoRoot, requiredOption(options, 'browserManifest')))
    const platform = requiredOption(options, 'platform')
    const outDir = resolve(repoRoot, options.outDir ?? 'lib/EasyInk.Render/releases')
    const manifest = {
      ...hostManifest,
      browser: browserManifest.browser,
    }
    const errors = validateManifest(manifest)
    if (errors.length > 0) {
      throw new Error(`Runtime manifest validation failed:\n${errors.map(error => `- ${error}`).join('\n')}`)
    }
    const manifestPath = await writeRuntimeManifest(manifest, outDir, platform)
    console.warn(`[render-release] runtime manifest: ${relative(repoRoot, manifestPath)}`)
    return
  }
  throw new Error(`Unknown command: ${command ?? '<missing>'}`)
}

function requiredOption(options, key) {
  const value = options[key]
  if (!value) {
    throw new Error(`Missing required option: --${key}`)
  }
  return value
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
