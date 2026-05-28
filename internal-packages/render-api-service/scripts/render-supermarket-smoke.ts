import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'
import {
  supermarketDemoData,
  supermarketReceiptTemplate,
} from '@easyink/samples'

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
const hostBinaryPath = resolve(hostRoot, 'easyink-render')

main()

function main(): void {
  try {
    resetSmokeRoot()
    writeSupermarketRequest()
    buildLinuxHostBinary()
    renderWithHeadlessShell()
    assertSmokeResult()
  }
  finally {
    rmSync(hostBinaryPath, { force: true })
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

function renderWithHeadlessShell(): void {
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
    'chromedp/headless-shell:latest',
    '-lc',
    [
      'set -eu',
      'mkdir -p /smoke/profile /smoke/tmp /smoke/logs /smoke/output',
      './host/easyink-render render --no-daemon --request /smoke/supermarket-request.json --out /smoke/output/supermarket-receipt.pdf --browser-kind headless-shell --browser-path /headless-shell/headless-shell --profile-root /smoke/profile --temp-dir /smoke/tmp --log-dir /smoke/logs --diagnostics-out /smoke/supermarket-diagnostics.json --json',
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
  if (result.status !== 0) {
    const summary = parseRenderFailure(result.stdout)
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
