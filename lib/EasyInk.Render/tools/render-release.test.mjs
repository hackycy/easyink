import { chmod, mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { describe, expect, it } from 'vitest'

import {
  buildBrowserBundle,
  buildHostPackage,
  createDockerGoBuildArgs,
  createReleaseIndex,
  createRuntimeManifest,
  fileInfo,
  packageToManifestBrowser,
  parsePlatformList,
  resolveChromeForTestingDownload,
  validateManifest,
  verifyBrowserArchiveStartup,
  verifyPackageReference,
  verifyRuntimeBundle,
} from './render-release.mjs'

const digestPattern = /^[a-f0-9]{64}$/
const isWindows = process.platform === 'win32'

describe('render release tooling', () => {
  it('validateManifest accepts the sample manifest shape', () => {
    const errors = validateManifest(sampleManifest())
    expect(errors).toEqual([])
  })

  it('validateManifest reports missing package integrity fields', () => {
    const manifest = sampleManifest()
    manifest.host.sha256 = 'not-a-sha'
    manifest.host.size = -1
    manifest.host.platform = 'freebsd-x64'

    const errors = validateManifest(manifest)
    expect(errors.some(error => error.includes('host.sha256'))).toBe(true)
    expect(errors.some(error => error.includes('host.size'))).toBe(true)
    expect(errors.some(error => error.includes('host.platform'))).toBe(true)
  })

  it('validateManifest requires the embedded EasyInk viewer runtime entry', () => {
    const manifest = sampleManifest()
    manifest.easyinkRuntime.entry = 'embedded://easyink-lite'

    const errors = validateManifest(manifest)
    expect(errors.some(error => error.includes('easyinkRuntime.entry'))).toBe(true)
  })

  it('verifyRuntimeBundle validates the embedded viewer files and materials manifest', async () => {
    const runtimeRoot = await createRuntimeBundleFixture()

    const errors = await verifyRuntimeBundle(sampleManifest(), { runtimeRoot })

    expect(errors).toEqual([])
  })

  it('verifyRuntimeBundle reports missing runtime files', async () => {
    const runtimeRoot = await createRuntimeBundleFixture({
      omit: 'runtime/easyink-viewer/assets/viewer.js',
    })

    const errors = await verifyRuntimeBundle(sampleManifest(), { runtimeRoot })

    expect(errors).toContain('runtime bundle file missing: runtime/easyink-viewer/assets/viewer.js')
  })

  it('verifyRuntimeBundle requires bundled runtime metadata and material coverage', async () => {
    const runtimeRoot = await createRuntimeBundleFixture({
      materials: runtimeMaterials().filter(type => type !== 'chart'),
    })
    const manifest = sampleManifest()
    manifest.easyinkRuntime.bundled = false

    const errors = await verifyRuntimeBundle(manifest, { runtimeRoot })

    expect(errors).toContain('easyinkRuntime.bundled must be true for the embedded EasyInk viewer runtime')
    expect(errors).toContain('runtime materials manifest missing material type: chart')
  })

  it('fileInfo returns size and sha256 for release artifacts', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'easyink-render-release-'))
    const path = join(dir, 'artifact.bin')
    await writeFile(path, 'easyink')

    const info = await fileInfo(path)
    expect(info.size).toBe(7)
    expect(info.sha256).toMatch(digestPattern)
  })

  it('verifyPackageReference compares manifest metadata with archive bytes', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'easyink-render-release-'))
    const path = join(dir, 'artifact.bin')
    await writeFile(path, 'easyink')
    const info = await fileInfo(path)

    const valid = await verifyPackageReference({ size: info.size, sha256: info.sha256 }, path, { requireExecutable: false })
    expect(valid.errors).toEqual([])

    const invalid = await verifyPackageReference({ size: info.size + 1, sha256: info.sha256.replace(/.$/, '0') }, path, { requireExecutable: false })
    expect(invalid.errors).toHaveLength(2)
  })

  it('createRuntimeManifest stamps host package metadata', () => {
    const manifest = createRuntimeManifest({
      baseManifest: sampleManifest(),
      hostPackage: {
        platform: 'darwin-arm64',
        executable: 'easyink-render',
        archiveName: 'easyink-render-0.1.0-darwin-arm64.tar.gz',
        size: 42,
        sha256: 'a'.repeat(64),
      },
      urlBase: 'https://download.easyink.dev/render',
    })

    expect(manifest.host.platform).toBe('darwin-arm64')
    expect(manifest.host.size).toBe(42)
    expect(manifest.host.sha256).toBe('a'.repeat(64))
    expect(manifest.host.url).toBe('https://download.easyink.dev/render/host/0.1.0/darwin-arm64/easyink-render-0.1.0-darwin-arm64.tar.gz')
    expect(validateManifest(manifest)).toEqual([])
  })

  it('createRuntimeManifest can stamp browser bundle metadata', () => {
    const manifest = createRuntimeManifest({
      baseManifest: sampleManifest(),
      hostPackage: {
        platform: 'linux-arm64',
        executable: 'easyink-render',
        archiveName: 'easyink-render-0.1.0-linux-arm64.tar.gz',
        size: 42,
        sha256: 'a'.repeat(64),
      },
      browserBundle: {
        name: 'chrome-for-testing',
        version: '148.0.7778.97',
        platform: 'linux-arm64',
        executable: 'headless-shell',
        archiveName: 'chrome-for-testing-148.0.7778.97-linux-arm64.tar.gz',
        size: 108,
        sha256: 'b'.repeat(64),
      },
      urlBase: 'https://download.easyink.dev/render',
    })

    expect(manifest.browser.size).toBe(108)
    expect(manifest.browser.sha256).toBe('b'.repeat(64))
    expect(manifest.browser.url).toBe('https://download.easyink.dev/render/browser/148.0.7778.97/linux-arm64/chrome-for-testing-148.0.7778.97-linux-arm64.tar.gz')
    expect(validateManifest(manifest)).toEqual([])
  })

  it('parsePlatformList accepts all and comma-separated platform lists', () => {
    expect(parsePlatformList('linux-x64,darwin-arm64')).toEqual(['linux-x64', 'darwin-arm64'])
    expect(parsePlatformList('all')).toContain('win-x64')
    expect(parsePlatformList('all')).toContain('win-x86')
    expect(() => parsePlatformList('freebsd-x64')).toThrow('Unsupported platform')
  })

  it('createReleaseIndex records generated package metadata', () => {
    const index = createReleaseIndex({
      kind: 'host',
      version: '0.1.0',
      packages: [
        {
          platform: 'linux-x64',
          manifestPath: 'releases/host/0.1.0/linux-x64/runtime-manifest.linux-x64.json',
          archivePath: 'releases/host/0.1.0/linux-x64/easyink-render-0.1.0-linux-x64.tar.gz',
          archiveName: 'easyink-render-0.1.0-linux-x64.tar.gz',
          executable: 'easyink-render',
          size: 42,
          sha256: 'a'.repeat(64),
        },
      ],
    })

    expect(index.schemaVersion).toBe(1)
    expect(index.kind).toBe('host')
    expect(index.packages[0].platform).toBe('linux-x64')
    expect(index.packages[0].sha256).toBe('a'.repeat(64))
    expect(Date.parse(index.generatedAt)).not.toBeNaN()
  })

  it('buildBrowserBundle packages a local browser directory', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'easyink-render-browser-'))
    const browserDir = join(dir, 'browser')
    await mkdir(browserDir)
    await writeFile(join(browserDir, 'headless-shell'), 'fake-browser')
    await mkdir(join(browserDir, 'assets'))
    await writeFile(join(browserDir, 'assets/version.txt'), '148')
    const outDir = join(dir, 'out')

    const bundle = await buildBrowserBundle({
      platform: 'linux-arm64',
      version: '148.0.7778.97',
      outDir,
      browserDir,
      executable: 'headless-shell',
    })

    expect(bundle.platform).toBe('linux-arm64')
    expect(bundle.executable).toBe('headless-shell')
    expect(bundle.size > 0).toBe(true)
    expect(bundle.sha256).toMatch(digestPattern)

    const manifest = {
      ...sampleManifest(),
      browser: packageToManifestBrowser(bundle),
    }
    expect(validateManifest(manifest)).toEqual([])

    const verified = await verifyPackageReference(manifest.browser, bundle.archivePath)
    expect(verified.errors).toEqual([])
  })

  it('buildHostPackage creates a Windows x86 zip host archive', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'easyink-render-package-'))
    const fakeGo = join(dir, 'fake-go.mjs')
    await writeFile(fakeGo, `import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const outIndex = process.argv.indexOf('-o')
if (outIndex === -1 || !process.argv[outIndex + 1]) {
  process.exit(1)
}
const out = process.argv[outIndex + 1]
if (process.env.GOOS !== 'windows' || process.env.GOARCH !== '386') {
  process.exit(2)
}
mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, 'fake-host')
`)

    const hostPackage = await buildHostPackage({
      platform: 'win-x86',
      version: '0.1.0',
      outDir: join(dir, 'out'),
      goCommand: process.execPath,
      goCommandArgs: [fakeGo],
    })

    expect(hostPackage.archiveName).toMatch(/\.zip$/)
    expect(hostPackage.archiveName).toContain('win-x86')
    expect(hostPackage.executable).toBe('easyink-render.exe')
    const verified = await verifyPackageReference(
      { size: hostPackage.size, sha256: hostPackage.sha256, executable: hostPackage.executable },
      hostPackage.archivePath,
    )
    expect(verified.errors).toEqual([])
  })

  it('createDockerGoBuildArgs cross-compiles a host target in a Go container', () => {
    const args = createDockerGoBuildArgs({
      hostRoot: '/repo/lib/EasyInk.Render/host',
      outDir: '/repo/lib/EasyInk.Render/releases/host/0.1.0/win-x64',
      target: {
        goos: 'windows',
        goarch: 'amd64',
        executable: 'easyink-render.exe',
      },
      dockerImage: 'golang:1.23-bookworm',
    })

    expect(args).toContain('golang:1.23-bookworm')
    expect(args).toContain('/repo/lib/EasyInk.Render/host:/src')
    expect(args.at(-1)).toContain('GOOS=windows GOARCH=amd64')
    expect(args.at(-1)).toContain('-o \'/out/easyink-render.exe\'')
  })

  it('buildBrowserBundle preserves nested browser directories in zip archives', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'easyink-render-browser-nested-'))
    const browserDir = join(dir, 'browser')
    await mkdir(browserDir)
    await mkdir(join(browserDir, 'resources'))
    await writeFile(join(browserDir, 'headless-shell'), 'fake-browser')
    await writeFile(join(browserDir, 'resources', 'version.txt'), '148')
    const outDir = join(dir, 'out')

    const bundle = await buildBrowserBundle({
      platform: 'win-x86',
      version: '148.0.7778.97',
      outDir,
      browserDir,
      executable: 'headless-shell',
    })

    expect(bundle.archiveName).toMatch(/\.zip$/)
    expect(bundle.archiveName).toContain('win-x86')
    const verified = await verifyPackageReference(
      { size: bundle.size, sha256: bundle.sha256, executable: 'headless-shell' },
      bundle.archivePath,
    )
    expect(verified.errors).toEqual([])
  })

  it('resolveChromeForTestingDownload maps EasyInk platforms to Chrome for Testing downloads', () => {
    const download = resolveChromeForTestingDownload(cftIndex(), {
      platform: 'win-x86',
      version: '148.0.7778.97',
      binary: 'chrome-headless-shell',
    })

    expect(download.cftPlatform).toBe('win32')
    expect(download.executable).toBe('chrome-headless-shell.exe')
    expect(download.url).toBe('https://example.test/chrome-headless-shell-win32.zip')
  })

  it('resolveChromeForTestingDownload fails when a platform is not published', () => {
    expect(() => resolveChromeForTestingDownload(cftIndex(), {
      platform: 'linux-arm64',
      version: '148.0.7778.97',
      binary: 'chrome-headless-shell',
    })).toThrow('Chrome for Testing download not found')
  })

  it('verifyBrowserArchiveStartup extracts and runs browser version command', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'easyink-render-browser-startup-'))
    const browserDir = join(dir, 'browser')
    await mkdir(browserDir)
    const executableName = isWindows ? 'headless-shell.cmd' : 'headless-shell'
    const executable = join(browserDir, executableName)
    await writeFile(executable, isWindows
      ? '@echo off\necho HeadlessChrome 148.0.7778.97\n'
      : '#!/bin/sh\necho "HeadlessChrome 148.0.7778.97"\n')
    await chmod(executable, 0o755)
    const outDir = join(dir, 'out')
    const bundle = await buildBrowserBundle({
      platform: 'linux-x64',
      version: '148.0.7778.97',
      outDir,
      browserDir,
      executable: executableName,
    })

    const result = await verifyBrowserArchiveStartup(packageToManifestBrowser(bundle), bundle.archivePath)

    expect(result.errors).toEqual([])
    expect(result.startup?.stdout).toContain('148.0.7778.97')
  })

  it('verifyPackageReference reports missing executable in archive', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'easyink-render-missing-executable-'))
    const browserDir = join(dir, 'browser')
    await mkdir(browserDir)
    await writeFile(join(browserDir, 'headless-shell'), 'fake-browser')
    const outDir = join(dir, 'out')
    const bundle = await buildBrowserBundle({
      platform: 'linux-arm64',
      version: '148.0.7778.97',
      outDir,
      browserDir,
      executable: 'headless-shell',
    })

    const verified = await verifyPackageReference(
      { size: bundle.size, sha256: bundle.sha256, executable: 'missing-shell' },
      bundle.archivePath,
    )
    expect(verified.errors).toContain('executable not found in archive: missing-shell')
  })
})

function cftIndex() {
  return {
    versions: [
      {
        version: '148.0.7778.97',
        downloads: {
          'chrome-headless-shell': [
            { platform: 'linux64', url: 'https://example.test/chrome-headless-shell-linux64.zip' },
            { platform: 'mac-arm64', url: 'https://example.test/chrome-headless-shell-mac-arm64.zip' },
            { platform: 'win64', url: 'https://example.test/chrome-headless-shell-win64.zip' },
            { platform: 'win32', url: 'https://example.test/chrome-headless-shell-win32.zip' },
          ],
        },
      },
    ],
  }
}

async function createRuntimeBundleFixture(options = {}) {
  const root = await mkdtemp(join(tmpdir(), 'easyink-render-runtime-'))
  const files = {
    'runtime/easyink-viewer/index.html': '<!doctype html><main id="easyink-root"></main>',
    'runtime/easyink-viewer/assets/viewer.css': '.easyink-runtime-root{}',
    'runtime/easyink-viewer/assets/viewer.js': 'window.__easyinkViewer = true',
    'runtime/easyink-viewer/assets/vendor/qrcode-generator.js': 'window.qrcode = true',
    'runtime/easyink-viewer/assets/vendor/jsbarcode.all.min.js': 'window.JsBarcode = true',
    'runtime/easyink-viewer/assets/materials/manifest.json': `${JSON.stringify({
      schemaVersion: 1,
      runtime: 'easyink-viewer',
      materials: (options.materials ?? runtimeMaterials()).map(type => ({ type, viewer: `builtin-${type}` })),
    }, null, 2)}\n`,
  }
  for (const [file, content] of Object.entries(files)) {
    if (file === options.omit) {
      continue
    }
    const path = join(root, file)
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, content)
  }
  return root
}

function runtimeMaterials() {
  return [
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
}

function sampleManifest() {
  return {
    schemaVersion: 1,
    protocolVersion: '1.0',
    host: {
      version: '0.1.0',
      platform: 'linux-arm64',
      executable: 'easyink-render',
      url: '',
      sha256: '',
      size: 0,
    },
    browser: {
      name: 'chrome-for-testing',
      version: '148.0.7778.97',
      platform: 'linux-arm64',
      executable: 'headless-shell',
      url: '',
      sha256: '',
      size: 0,
    },
    easyinkRuntime: {
      version: '0.1.0',
      bundled: true,
      entry: 'runtime/easyink-viewer/index.html',
    },
    compatibility: {
      minOs: 'linux',
      protocol: '1.0',
    },
  }
}
