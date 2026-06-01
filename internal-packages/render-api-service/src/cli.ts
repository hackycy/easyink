import type { RenderProcessConfig } from './config'
import type {
  PrintPDFRequest,
  RenderApiRequest,
  RenderCliJsonFailure,
  RenderCliJsonResult,
  RenderCliJsonSuccess,
  RenderDiagnostics,
  RenderRuntimeOptions,
} from './protocol'
import { Buffer } from 'node:buffer'
import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import process from 'node:process'
import { loadRenderApiConfig } from './config'

export interface RenderCliResult {
  cli: RenderCliJsonSuccess
  pdf: Buffer
  diagnostics?: RenderDiagnostics
  stdout: string
  stderr: string
  exitCode: number
}

export class RenderCliError extends Error {
  readonly code: string
  readonly exitCode?: number
  readonly stderr?: string
  readonly cli?: RenderCliJsonFailure

  constructor(message: string, options: { code: string, exitCode?: number, stderr?: string, cli?: RenderCliJsonFailure }) {
    super(message)
    this.name = 'RenderCliError'
    this.code = options.code
    this.exitCode = options.exitCode
    this.stderr = options.stderr
    this.cli = options.cli
  }
}

export function resolveRenderBinary(binary?: string): string {
  return binary ?? process.env.EASYINK_RENDER_BIN ?? findLocalRenderBinary() ?? 'easyink-render'
}

export function toPrintPDFRequest(input: RenderApiRequest): PrintPDFRequest {
  return {
    requestId: input.requestId,
    source: input.source,
    pdf: input.pdf,
    wait: input.wait,
    output: input.output,
    security: input.security,
    diagnostics: input.diagnostics,
  }
}

export function toRenderCliArgs(paths: { requestPath: string, outputPath: string, diagnosticsPath: string }, runtime: RenderRuntimeOptions = {}): string[] {
  const args = [
    'render',
    '--request',
    paths.requestPath,
    '--out',
    paths.outputPath,
    '--diagnostics-out',
    paths.diagnosticsPath,
    '--json',
  ]

  if (runtime.noDaemon) {
    args.push('--no-daemon')
  }
  if (runtime.forceRestartDaemon) {
    args.push('--force-restart-daemon')
  }
  if (runtime.disableSandbox) {
    args.push('--disable-sandbox')
  }
  pushStringFlag(args, '--browser-path', runtime.browserPath)
  pushStringFlag(args, '--headless-mode', runtime.headlessMode)
  pushStringFlag(args, '--profile-root', runtime.profileRoot)
  pushStringFlag(args, '--temp-dir', runtime.tempDir)
  pushStringFlag(args, '--log-dir', runtime.logDir)
  pushNumberFlag(args, '--max-concurrency', runtime.maxConcurrency)
  pushNumberFlag(args, '--max-queue-size', runtime.maxQueueSize)
  pushNumberFlag(args, '--request-timeout-ms', runtime.requestTimeoutMs)
  pushNumberFlag(args, '--idle-timeout-ms', runtime.idleTimeoutMs)
  return args
}

export async function renderWithCli(input: RenderApiRequest, config: RenderProcessConfig = loadRenderApiConfig()): Promise<RenderCliResult> {
  const binary = resolveRenderBinary(config.binary)
  const baseDir = config.workDir ?? tmpdir()
  await mkdir(baseDir, { recursive: true })
  const requestDir = await mkdtemp(join(baseDir, 'easyink-render-api-'))
  const requestPath = join(requestDir, 'request.json')
  const outputPath = join(requestDir, 'out.pdf')
  const diagnosticsPath = join(requestDir, 'diagnostics.json')
  const runtime = { ...config.defaultRuntime, ...input.runtime }

  try {
    await writeFile(requestPath, JSON.stringify(toPrintPDFRequest(input)), 'utf8')
    if (runtime.noDaemon && !runtime.profileRoot) {
      runtime.profileRoot = join(requestDir, 'profile')
    }
    const args = toRenderCliArgs({ requestPath, outputPath, diagnosticsPath }, runtime)
    const requestTimeoutMs = input.wait?.timeoutMs
    const processResult = await runProcess(binary, args, {
      timeoutMs: requestTimeoutMs ? requestTimeoutMs + 10_000 : config.cliTimeoutMs,
    })
    const cli = parseCliJson(processResult.stdout)

    if (processResult.exitCode !== 0 || !cli.success) {
      const failure = cli.success
        ? {
          success: false,
          code: 'RENDER_CLI_FAILED',
          message: processResult.stderr || `Render CLI exited with code ${processResult.exitCode}`,
          requestId: input.requestId,
        } satisfies RenderCliJsonFailure
        : cli

      throw new RenderCliError(failure.message, {
        code: failure.code,
        exitCode: processResult.exitCode,
        stderr: processResult.stderr,
        cli: failure,
      })
    }
    const successCli = cli

    const [pdf, diagnostics] = await Promise.all([
      readFile(outputPath),
      readJsonFile<RenderDiagnostics>(diagnosticsPath),
    ])

    return {
      cli: successCli,
      pdf,
      diagnostics,
      stdout: processResult.stdout,
      stderr: processResult.stderr,
      exitCode: processResult.exitCode,
    }
  }
  finally {
    if (!config.keepWorkDir) {
      await rm(requestDir, { force: true, recursive: true })
    }
  }
}

export async function runRenderCommand(args: string[], config: RenderProcessConfig = loadRenderApiConfig()): Promise<{ stdout: string, stderr: string, exitCode: number }> {
  const binary = resolveRenderBinary(config.binary)
  return runProcess(binary, args, { timeoutMs: config.cliTimeoutMs })
}

async function runProcess(command: string, args: string[], options: { timeoutMs: number }): Promise<{ stdout: string, stderr: string, exitCode: number }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    const stdout: Buffer[] = []
    const stderr: Buffer[] = []
    let settled = false
    const timer = setTimeout(() => {
      child.kill('SIGTERM')
      settled = true
      reject(new RenderCliError(`Render CLI timed out after ${options.timeoutMs}ms`, { code: 'RENDER_CLI_TIMEOUT' }))
    }, options.timeoutMs)
    timer.unref()

    child.stdout.on('data', chunk => stdout.push(Buffer.from(chunk)))
    child.stderr.on('data', chunk => stderr.push(Buffer.from(chunk)))
    child.on('error', (err) => {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timer)
      reject(new RenderCliError(err.message, { code: 'RENDER_CLI_UNAVAILABLE' }))
    })
    child.on('close', (code) => {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timer)
      resolve({
        stdout: Buffer.concat(stdout).toString('utf8'),
        stderr: Buffer.concat(stderr).toString('utf8'),
        exitCode: code ?? 1,
      })
    })
  })
}

function parseCliJson(stdout: string): RenderCliJsonResult {
  const trimmed = stdout.trim()
  if (!trimmed) {
    return { success: false, code: 'RENDER_CLI_EMPTY_OUTPUT', message: 'Render CLI did not write JSON output' }
  }
  try {
    return JSON.parse(trimmed) as RenderCliJsonResult
  }
  catch {
    return { success: false, code: 'RENDER_CLI_INVALID_OUTPUT', message: 'Render CLI wrote invalid JSON output' }
  }
}

async function readJsonFile<T>(path: string): Promise<T | undefined> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as T
  }
  catch {
    return undefined
  }
}

function pushStringFlag(args: string[], name: string, value: string | undefined): void {
  if (value) {
    args.push(name, value)
  }
}

function pushNumberFlag(args: string[], name: string, value: number | undefined): void {
  if (typeof value === 'number') {
    args.push(name, String(value))
  }
}

function findLocalRenderBinary(): string | undefined {
  const repoRoot = findRepoRoot(process.cwd())
  if (!repoRoot) {
    return undefined
  }

  const platform = currentRenderPlatform()
  if (!platform) {
    return undefined
  }

  const executable = process.platform === 'win32' ? 'easyink-render.exe' : 'easyink-render'
  const renderRoot = join(repoRoot, 'lib/EasyInk.Render')
  const version = readRenderHostVersion(renderRoot)
  const candidates = [
    version ? join(renderRoot, 'releases/host', version, platform, executable) : undefined,
    join(renderRoot, 'host', executable),
  ].filter((item): item is string => Boolean(item))

  return candidates.find(candidate => existsSync(candidate))
}

function findRepoRoot(start: string): string | undefined {
  let current = resolve(start)
  while (true) {
    if (
      existsSync(join(current, 'package.json'))
      && existsSync(join(current, 'lib/EasyInk.Render'))
    ) {
      return current
    }
    const parent = dirname(current)
    if (parent === current) {
      return undefined
    }
    current = parent
  }
}

function currentRenderPlatform(): string | undefined {
  const arch = process.arch
  if (process.platform === 'darwin') {
    if (arch === 'arm64')
      return 'darwin-arm64'
    if (arch === 'x64')
      return 'darwin-x64'
  }
  if (process.platform === 'linux') {
    if (arch === 'arm64')
      return 'linux-arm64'
    if (arch === 'x64')
      return 'linux-x64'
  }
  if (process.platform === 'win32') {
    if (arch === 'ia32')
      return 'win-x86'
    if (arch === 'x64')
      return 'win-x64'
  }
  return undefined
}

function readRenderHostVersion(renderRoot: string): string | undefined {
  try {
    const manifest = JSON.parse(readFileSync(join(renderRoot, 'manifests/runtime-manifest.sample.json'), 'utf8')) as { host?: { version?: unknown } }
    return typeof manifest.host?.version === 'string' ? manifest.host.version : undefined
  }
  catch {
    return undefined
  }
}
