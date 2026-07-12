import type { MaterialConformanceIssue, MaterialConformanceReport } from '@easyink/core'
import type { ChildProcess } from 'node:child_process'
import { fork, spawn } from 'node:child_process'
import { resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { parseAuthenticatedResultMessage, parseHandshakeMessage } from './isolated-material-conformance-protocol'

export interface MaterialConformanceSourceDescriptor {
  moduleSpecifier: string
  exportName: string
  materialType?: string
}

export interface IsolatedMaterialConformanceOptions {
  deadlineMs?: number
  environment?: Readonly<Record<string, string>>
  onSpawn?: (pid: number) => void
}

export interface AuthenticatedResultReceiver {
  accept: (message: unknown) => readonly MaterialConformanceReport[] | undefined
}

const childEntryUrl = new URL('./isolated-material-conformance-child.ts', import.meta.url)
const CHILD_ENTRY = childEntryUrl.protocol === 'file:'
  ? fileURLToPath(childEntryUrl)
  : resolve(process.cwd(), 'packages/builtin/src/testing/isolated-material-conformance-child.ts')
const DEFAULT_DEADLINE_MS = 10_000

export async function runIsolatedMaterialConformance(
  source: MaterialConformanceSourceDescriptor,
  options: IsolatedMaterialConformanceOptions = {},
): Promise<readonly MaterialConformanceReport[]> {
  const deadlineMs = options.deadlineMs ?? DEFAULT_DEADLINE_MS
  const workspaceRoot = process.cwd()
  const child = fork(CHILD_ENTRY, [], {
    detached: process.platform !== 'win32',
    env: { ...process.env, ...options.environment },
    execArgv: ['--permission', `--allow-fs-read=${workspaceRoot}`],
    serialization: 'advanced',
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  })
  return await new Promise((resolve) => {
    let finishing = false
    const receiver = createAuthenticatedResultReceiver()
    let timer: ReturnType<typeof setTimeout>
    const finish = async (reports: readonly MaterialConformanceReport[]) => {
      if (finishing)
        return
      finishing = true
      clearTimeout(timer)
      await terminateAndWait(child)
      resolve(Object.freeze([...reports]))
    }
    timer = setTimeout(() => {
      void finish([failureReport(source, 'CONFORMANCE_ISOLATED_EXECUTION_TIMEOUT', `isolated conformance process exceeded ${deadlineMs}ms`)])
    }, deadlineMs)

    child.on('message', (message: unknown) => {
      const reports = receiver.accept(message)
      if (!reports)
        return
      void finish(reports)
    })
    child.once('error', () => {
      void finish([failureReport(source, 'CONFORMANCE_ISOLATED_EXECUTION_CRASH', 'isolated conformance process failed to start')])
    })
    child.once('exit', (code, signal) => {
      if (!finishing)
        void finish([failureReport(source, 'CONFORMANCE_ISOLATED_EXECUTION_CRASH', `isolated conformance process exited before reporting (${code ?? signal ?? 'unknown'})`)])
    })
    try {
      if (child.pid !== undefined)
        options.onSpawn?.(child.pid)
    }
    catch {
      void finish([failureReport(source, 'CONFORMANCE_ISOLATED_RUNNER_ERROR', 'isolated conformance onSpawn callback failed')])
      return
    }
    child.send({ kind: 'run', source }, (error) => {
      if (error)
        void finish([failureReport(source, 'CONFORMANCE_ISOLATED_EXECUTION_CRASH', 'isolated conformance request could not be sent')])
    })
  })
}

export function createAuthenticatedResultReceiver(): AuthenticatedResultReceiver {
  let resultAccepted = false
  let session: ReturnType<typeof parseHandshakeMessage>
  return {
    accept: (message) => {
      if (!session) {
        session = parseHandshakeMessage(message)
        return undefined
      }
      if (resultAccepted)
        return undefined
      const reports = parseAuthenticatedResultMessage(message, session)
      if (!reports)
        return undefined
      resultAccepted = true
      return reports
    },
  }
}

async function terminateAndWait(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null)
    return
  const exited = new Promise<void>(resolve => child.once('exit', () => resolve()))
  const pid = child.pid
  if (process.platform === 'win32' && isProcessId(pid)) {
    await taskkill(pid)
    if (child.exitCode === null && child.signalCode === null)
      child.kill('SIGKILL')
  }
  else if (isProcessId(pid)) {
    try {
      process.kill(-pid, 'SIGKILL')
    }
    catch {
      child.kill('SIGKILL')
    }
  }
  else {
    child.kill('SIGKILL')
  }
  await exited
}

async function taskkill(pid: number): Promise<void> {
  await new Promise<void>((resolve) => {
    const killer = spawn('taskkill.exe', ['/PID', `${pid}`, '/T', '/F'], {
      shell: false,
      stdio: 'ignore',
      windowsHide: true,
    })
    killer.once('error', () => {
      resolve()
    })
    killer.once('exit', () => {
      resolve()
    })
  })
}

function isProcessId(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
}

function failureReport(
  source: MaterialConformanceSourceDescriptor,
  code: string,
  message: string,
): MaterialConformanceReport {
  const issue: MaterialConformanceIssue = Object.freeze({ code, path: '', message })
  return Object.freeze({ materialType: source.materialType ?? '', valid: false, issues: Object.freeze([issue]) })
}
