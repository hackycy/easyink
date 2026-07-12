import type { MaterialConformanceIssue, MaterialConformanceReport } from '@easyink/core'
import type { ChildProcess } from 'node:child_process'
import { fork } from 'node:child_process'
import { resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

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

interface ChildResultMessage {
  kind: 'result'
  reports: readonly MaterialConformanceReport[]
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
  const child = fork(CHILD_ENTRY, [], {
    env: { ...process.env, ...options.environment },
    execArgv: ['--import', 'tsx'],
    serialization: 'advanced',
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  })
  if (child.pid !== undefined)
    options.onSpawn?.(child.pid)

  return await new Promise((resolve) => {
    let finishing = false
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

    child.once('message', (message: unknown) => {
      if (!isChildResultMessage(message)) {
        void finish([failureReport(source, 'CONFORMANCE_ISOLATED_EXECUTION_INVALID_IPC', 'isolated conformance process returned invalid IPC')])
        return
      }
      void finish(message.reports)
    })
    child.once('error', () => {
      void finish([failureReport(source, 'CONFORMANCE_ISOLATED_EXECUTION_CRASH', 'isolated conformance process failed to start')])
    })
    child.once('exit', (code, signal) => {
      if (!finishing)
        void finish([failureReport(source, 'CONFORMANCE_ISOLATED_EXECUTION_CRASH', `isolated conformance process exited before reporting (${code ?? signal ?? 'unknown'})`)])
    })
    child.send({ kind: 'run', source }, (error) => {
      if (error)
        void finish([failureReport(source, 'CONFORMANCE_ISOLATED_EXECUTION_CRASH', 'isolated conformance request could not be sent')])
    })
  })
}

async function terminateAndWait(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null)
    return
  const exited = new Promise<void>(resolve => child.once('exit', () => resolve()))
  child.kill('SIGKILL')
  await exited
}

function failureReport(
  source: MaterialConformanceSourceDescriptor,
  code: string,
  message: string,
): MaterialConformanceReport {
  const issue: MaterialConformanceIssue = Object.freeze({ code, path: '', message })
  return Object.freeze({ materialType: source.materialType ?? '', valid: false, issues: Object.freeze([issue]) })
}

function isChildResultMessage(value: unknown): value is ChildResultMessage {
  if (!isRecord(value) || value.kind !== 'result' || !Array.isArray(value.reports))
    return false
  return value.reports.every(report => isRecord(report)
    && typeof report.materialType === 'string'
    && typeof report.valid === 'boolean'
    && Array.isArray(report.issues)
    && report.issues.every(issue => isRecord(issue)
      && typeof issue.code === 'string'
      && typeof issue.path === 'string'
      && typeof issue.message === 'string'))
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null
}
