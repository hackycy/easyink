import { Buffer } from 'node:buffer'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'
import {
  supermarketDemoData,
  supermarketReceiptTemplate,
} from '@easyink/samples'
import { loadRenderApiConfig } from '../src/config'
import { createRenderApiServer } from '../src/server'

interface RenderCliSummary {
  success: boolean
  requestId?: string
  pageCount?: number
  diagnosticsPath?: string
  code?: string
  message?: string
}

interface DiagnosticsSummary {
  requestId: string
  pageCount?: number
  consoleErrors?: string[]
  failedRequests?: string[]
}

const repoRoot = resolve(import.meta.dirname, '../../..')
const renderRoot = resolve(repoRoot, 'lib/EasyInk.Render')
const hostRoot = resolve(renderRoot, 'host')
const smokeRoot = resolve(repoRoot, 'temp/easyink-render-supermarket-smoke')
const outputDir = resolve(smokeRoot, 'output')
const requestPath = resolve(smokeRoot, 'supermarket-request.json')
const diagnosticsPath = resolve(smokeRoot, 'supermarket-diagnostics.json')
const outputPath = resolve(outputDir, 'supermarket-receipt.pdf')
const nativeWindows = process.platform === 'win32'
const hostBinaryPath = nativeWindows ? resolve(smokeRoot, 'easyink-render.exe') : resolve(hostRoot, 'easyink-render')

void main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})

async function main(): Promise<void> {
  try {
    resetSmokeRoot()
    writeSupermarketRequest()
    if (nativeWindows) {
      buildNativeHostBinary()
      renderWithNativeChromium()
    }
    else {
      buildLinuxHostBinary()
      renderWithChromium()
    }
    assertSmokeResult()
    if (nativeWindows)
      await renderWithActualApi()
  }
  finally {
    rmSync(hostBinaryPath, { force: true })
  }
}

async function renderWithActualApi(): Promise<void> {
  const workDir = resolve(smokeRoot, 'api-work')
  const api = createRenderApiServer({ config: {
    ...loadRenderApiConfig({}),
    binary: hostBinaryPath,
    workDir,
    defaultRuntime: { noDaemon: true, disableSandbox: true, browserPath: process.env.EASYINK_RENDER_BROWSER_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe' },
  } })
  try {
    const address = await api.listen(0, '127.0.0.1')
    const response = await fetch(`http://127.0.0.1:${address.port}/v1/render/pdf`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requestId: 'actual-api-supermarket',
        source: { type: 'easyink', schema: supermarketReceiptTemplate, data: supermarketDemoData },
        response: { type: 'pdf' },
      }),
    })
    const bytes = Buffer.from(await response.arrayBuffer())
    if (!response.ok || bytes.subarray(0, 5).toString() !== '%PDF-' || bytes.length < 1000)
      throw new Error(`Actual API PDF failed: ${response.status} ${bytes.subarray(0, 200).toString()}`)
    if (Number(response.headers.get('x-easyink-page-count')) < 1)
      throw new Error('Actual API did not expose rendered page metrics')
    const remaining = readdirSync(workDir)
    if (remaining.length)
      throw new Error(`API returned before request cleanup: ${remaining.join(', ')}`)
    writeFileSync(resolve(outputDir, 'api-supermarket.pdf'), bytes)
    console.log(JSON.stringify({ actualApi: true, pdfBytes: bytes.length, requestDirectoriesAfterResponse: remaining.length }))
  }
  finally {
    await api.close()
  }
}

function resetSmokeRoot(): void {
  rmSync(smokeRoot, { force: true, recursive: true })
  mkdirSync(outputDir, { recursive: true })
}

function writeSupermarketRequest(): void {
  writeFileSync(requestPath, `${JSON.stringify({
    requestId: 'smoke-supermarket-receipt-001',
    source: {
      type: 'easyink',
      schema: supermarketReceiptTemplate,
      data: supermarketDemoData,
      fileName: 'supermarket-receipt',
    },
    diagnostics: {
      includeHtmlSnapshot: true,
      includeScreenshot: true,
    },
  }, null, 2)}\n`)
}

function buildNativeHostBinary(): void {
  run('go', ['build', '-C', hostRoot, '-trimpath', '-o', hostBinaryPath, './cmd/easyink-render'])
}

function renderWithNativeChromium(): void {
  const browserPath = process.env.EASYINK_RENDER_BROWSER_PATH ?? [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  ].find(path => existsSync(path))
  if (!browserPath)
    throw new Error('Set EASYINK_RENDER_BROWSER_PATH to a Chromium executable for the native Windows smoke check')
  run(hostBinaryPath, [
    'render',
    '--no-daemon',
    '--disable-sandbox',
    '--request',
    requestPath,
    '--out',
    outputPath,
    '--browser-path',
    browserPath,
    '--profile-root',
    resolve(smokeRoot, 'profile'),
    '--temp-dir',
    resolve(smokeRoot, 'tmp'),
    '--log-dir',
    resolve(smokeRoot, 'logs'),
    '--diagnostics-out',
    diagnosticsPath,
    '--json',
  ])
}

function buildLinuxHostBinary(): void {
  run('docker', [
    'run',
    '--rm',
    '--platform',
    'linux/amd64',
    '-v',
    `${hostRoot}:/src`,
    '-w',
    '/src',
    'golang:1.23-bookworm',
    'sh',
    '-lc',
    'CGO_ENABLED=0 GOOS=linux GOARCH=amd64 /usr/local/go/bin/go build -trimpath -o /src/easyink-render ./cmd/easyink-render',
  ])
}

function renderWithChromium(): void {
  run('docker', [
    'run',
    '--rm',
    '--platform',
    'linux/amd64',
    '--entrypoint',
    '/bin/sh',
    '-v',
    `${renderRoot}:/work`,
    '-v',
    `${smokeRoot}:/smoke`,
    '-w',
    '/work',
    'mcr.microsoft.com/playwright:v1.57.0-noble',
    '-lc',
    [
      'set -eu',
      'BROWSER_PATH="$(find /ms-playwright -path "*/chrome-linux*/chrome" -type f | head -n 1)"',
      'test -n "$BROWSER_PATH"',
      'mkdir -p /smoke/profile /smoke/tmp /smoke/logs /smoke/output',
      './host/easyink-render render --no-daemon --disable-sandbox --request /smoke/supermarket-request.json --out /smoke/output/supermarket-receipt.pdf --browser-path "$BROWSER_PATH" --profile-root /smoke/profile --temp-dir /smoke/tmp --log-dir /smoke/logs --diagnostics-out /smoke/supermarket-diagnostics.json --json',
      'test -s /smoke/output/supermarket-receipt.pdf',
    ].join('\n'),
  ])
}

function assertSmokeResult(): void {
  if (!existsSync(outputPath)) {
    throw new Error(`PDF was not created: ${outputPath}`)
  }
  const pdfBytes = statSync(outputPath).size
  if (pdfBytes < 1000) {
    throw new Error(`PDF is unexpectedly small: ${pdfBytes} bytes`)
  }

  const diagnostics = JSON.parse(readFileSync(diagnosticsPath, 'utf8')) as DiagnosticsSummary
  if ((diagnostics.consoleErrors?.length ?? 0) > 0) {
    throw new Error(`Render diagnostics contains console errors: ${diagnostics.consoleErrors?.join('\n')}`)
  }
  if ((diagnostics.failedRequests?.length ?? 0) > 0) {
    throw new Error(`Render diagnostics contains failed requests: ${diagnostics.failedRequests?.join('\n')}`)
  }
  if ((diagnostics.pageCount ?? 0) < 1) {
    throw new Error(`Expected at least one page, got ${diagnostics.pageCount ?? 0}`)
  }

  console.log(JSON.stringify({
    success: true,
    requestId: diagnostics.requestId,
    pageCount: diagnostics.pageCount,
    pdfBytes,
    pdfPath: outputPath,
    diagnosticsPath,
  }, null, 2))
}

function run(command: string, args: string[]): void {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  if (result.stdout) {
    process.stdout.write(result.stdout)
  }
  if (result.stderr) {
    process.stderr.write(result.stderr)
  }
  if (result.error)
    throw new Error(`Could not start ${command}: ${result.error.message}`, { cause: result.error })
  if (result.status !== 0) {
    const summary = parseRenderFailure(result.stdout ?? '')
    throw new Error(summary
      ? `${command} failed: ${summary.code ?? 'RENDER_FAILED'} ${summary.message ?? ''}`.trim()
      : `${command} failed with exit code ${result.status ?? 'unknown'}`)
  }
}

function parseRenderFailure(stdout: string): RenderCliSummary | undefined {
  const trimmed = stdout.trim()
  if (!trimmed) {
    return undefined
  }
  try {
    return JSON.parse(trimmed) as RenderCliSummary
  }
  catch {
    return undefined
  }
}
