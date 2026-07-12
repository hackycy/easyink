import type { MaterialConformanceReport } from '@easyink/core'
import { randomUUID } from 'node:crypto'
import { existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { createAuthenticatedResultReceiver, runIsolatedMaterialConformance } from './isolated-material-conformance'
import { boundAndFreezeMaterialConformanceReports, cloneAndFreezeMaterialConformanceReports, createAuthenticatedResultMessage, createHandshakeMessage, createIsolatedConformanceSession, MAX_ISSUES_PER_REPORT, MAX_TOTAL_ISSUES } from './isolated-material-conformance-protocol'

const fixtureModule = pathToFileURL(join(process.cwd(), 'packages/builtin/src/testing/fixtures/isolated-material-fixtures.ts')).href
const invalidIpcModule = pathToFileURL(join(process.cwd(), 'packages/builtin/src/testing/fixtures/invalid-ipc-fixture.ts')).href
const spoofedResultModule = pathToFileURL(join(process.cwd(), 'packages/builtin/src/testing/fixtures/spoofed-result-fixture.ts')).href
const spoofedExitModule = pathToFileURL(join(process.cwd(), 'packages/builtin/src/testing/fixtures/spoofed-result-exit-fixture.ts')).href
const descendantSpawnModule = pathToFileURL(join(process.cwd(), 'packages/builtin/src/testing/fixtures/descendant-spawn-fixture.ts')).href
const budgetReportModule = pathToFileURL(join(process.cwd(), 'packages/builtin/src/testing/fixtures/budget-report-fixture.ts')).href
const cleanupPaths: string[] = []

afterEach(() => {
  for (const path of cleanupPaths.splice(0))
    rmSync(path, { force: true })
})

describe('isolated material conformance process', () => {
  it.each([
    ['fixture-sync-infinite'],
    ['fixture-async-infinite'],
  ])('terminates %s at the parent deadline without leaving a child', async (materialType) => {
    let pid = 0
    const started = Date.now()
    const reports = await runIsolatedMaterialConformance({
      moduleSpecifier: fixtureModule,
      exportName: 'isolatedMaterialFixturePackage',
      materialType,
    }, {
      deadlineMs: 2_000,
      onSpawn: childPid => pid = childPid,
    })
    expect(Date.now() - started).toBeLessThan(5_000)
    expect(reports).toEqual([expect.objectContaining({
      materialType,
      valid: false,
      issues: [expect.objectContaining({ code: 'CONFORMANCE_ISOLATED_EXECUTION_TIMEOUT' })],
    })])
    expectProcessGone(pid)
  }, 10_000)

  it('kills the child after a valid report before scheduled timer and Promise work escapes', async () => {
    const sentinelPath = join(tmpdir(), `easyink-conformance-${randomUUID()}`)
    cleanupPaths.push(sentinelPath)
    let pid = 0
    const reports = await runIsolatedMaterialConformance({
      moduleSpecifier: fixtureModule,
      exportName: 'isolatedMaterialFixturePackage',
      materialType: 'fixture-scheduled-after-report',
      arguments: [`--sentinel=${sentinelPath}`],
    }, {
      deadlineMs: 5_000,
      onSpawn: childPid => pid = childPid,
    })
    expect(reports).toEqual([expect.objectContaining({ materialType: 'fixture-scheduled-after-report', valid: true })])
    expect(Object.isFrozen(reports)).toBe(true)
    expect(Object.isFrozen(reports[0])).toBe(true)
    expect(Object.isFrozen(reports[0]?.issues)).toBe(true)
    expect(() => (reports as MaterialConformanceReport[]).push(reports[0]!)).toThrow()
    expect(() => {
      (reports[0] as { valid: boolean }).valid = false
    }).toThrow()
    expect(reports[0]?.valid).toBe(true)
    expectProcessGone(pid)
    await new Promise(resolve => setTimeout(resolve, 250))
    expect(existsSync(sentinelPath)).toBe(false)
  }, 10_000)

  it('ignores forged, replayed, wrong-request, wrong-auth, and extra-field results', async () => {
    const reports = await runIsolatedMaterialConformance({
      moduleSpecifier: spoofedResultModule,
      exportName: 'spoofedResultManifest',
      materialType: 'fixture-spoofed-result',
    }, { deadlineMs: 5_000 })
    expect(reports).toEqual([expect.objectContaining({
      materialType: 'fixture-spoofed-result',
      valid: false,
      issues: expect.arrayContaining([expect.objectContaining({ code: 'CONFORMANCE_VIEWER_REQUIRED' })]),
    })])
  }, 10_000)

  it('reports a crash when a source sends a forged result and exits', async () => {
    const reports = await runIsolatedMaterialConformance({
      moduleSpecifier: spoofedExitModule,
      exportName: 'unreachable',
      materialType: 'fixture-spoofed-exit',
    }, { deadlineMs: 5_000 })
    expect(reports[0]?.issues[0]?.code).toBe('CONFORMANCE_ISOLATED_EXECUTION_CRASH')
  }, 10_000)

  it('denies descendant processes and leaves no sentinel', async () => {
    const sentinelPath = join(tmpdir(), `easyink-descendant-${randomUUID()}`)
    cleanupPaths.push(sentinelPath)
    const poisoned = {
      EASYINK_TEST_SECRET: 'must-not-leak',
      NODE_OPTIONS: '--allow-child-process --require=easyink-forbidden-preload',
      NODE_PATH: 'easyink-forbidden-node-path',
      NODE_REPL_EXTERNAL_MODULE: 'easyink-forbidden-repl',
      NODE_V8_COVERAGE: sentinelPath,
      TSX_TSCONFIG_PATH: 'easyink-forbidden-tsx',
      LD_PRELOAD: 'easyink-forbidden-preload',
      DYLD_INSERT_LIBRARIES: 'easyink-forbidden-dyld',
    }
    const originals = Object.fromEntries(Object.keys(poisoned).map(key => [key, process.env[key]]))
    try {
      Object.assign(process.env, poisoned)
      const reports = await runIsolatedMaterialConformance({
        moduleSpecifier: descendantSpawnModule,
        exportName: 'descendantSpawnManifest',
        materialType: 'fixture-descendant-spawn',
        arguments: [`--sentinel=${sentinelPath}`],
      }, { deadlineMs: 5_000 })
      expect(reports[0]).toEqual(expect.objectContaining({
        valid: false,
        issues: expect.arrayContaining([expect.objectContaining({
          code: 'CONFORMANCE_VIEWER_FAILED',
          message: expect.stringMatching(/permission|access denied|ERR_ACCESS_DENIED/i),
        })]),
      }))
      await new Promise(resolve => setTimeout(resolve, 250))
      expect(existsSync(sentinelPath)).toBe(false)
    }
    finally {
      for (const [key, value] of Object.entries(originals)) {
        if (value === undefined)
          delete process.env[key]
        else
          process.env[key] = value
      }
    }
  }, 10_000)

  it('cleans up and returns a stable runner error when onSpawn throws', async () => {
    let pid = 0
    const reports = await runIsolatedMaterialConformance({
      moduleSpecifier: fixtureModule,
      exportName: 'isolatedMaterialFixturePackage',
      materialType: 'fixture-scheduled-after-report',
    }, {
      deadlineMs: 5_000,
      onSpawn: (childPid) => {
        pid = childPid
        throw new Error('callback failed')
      },
    })
    expect(reports[0]?.issues[0]?.code).toBe('CONFORMANCE_ISOLATED_RUNNER_ERROR')
    expectProcessGone(pid)
  }, 10_000)

  it('accepts a deterministic capped report over authenticated IPC', async () => {
    const reports = await runIsolatedMaterialConformance({
      moduleSpecifier: budgetReportModule,
      exportName: 'budgetReportManifest',
      materialType: 'fixture-budget-report',
    }, { deadlineMs: 10_000 })
    expect(reports[0]?.issues).toHaveLength(512)
    expect(reports[0]?.issues.filter(issue => issue.code === 'CONFORMANCE_ISSUES_TRUNCATED')).toHaveLength(1)
    expect(Object.isFrozen(reports[0]?.issues[0])).toBe(true)
  }, 15_000)

  it('reports child crashes and invalid IPC with stable codes after cleanup', async () => {
    let crashPid = 0
    const crashed = await runIsolatedMaterialConformance({
      moduleSpecifier: fixtureModule,
      exportName: 'isolatedMaterialFixturePackage',
      materialType: 'fixture-child-crash',
    }, { deadlineMs: 5_000, onSpawn: pid => crashPid = pid })
    expect(crashed[0]?.issues[0]?.code).toBe('CONFORMANCE_ISOLATED_EXECUTION_CRASH')
    expectProcessGone(crashPid)

    let invalidPid = 0
    const invalid = await runIsolatedMaterialConformance({
      moduleSpecifier: invalidIpcModule,
      exportName: 'invalidIpcFixture',
    }, { deadlineMs: 5_000, onSpawn: pid => invalidPid = pid })
    expect(invalid[0]?.issues[0]?.code).toBe('CONFORMANCE_ISOLATED_EXECUTION_CHILD_FAILED')
    expectProcessGone(invalidPid)
  }, 15_000)

  it('strictly clones and deeply freezes authenticated reports', () => {
    const input = [{
      materialType: 'strict-report',
      valid: false,
      issues: [{ code: 'STRICT', path: '/viewer', message: 'failed' }],
    }]
    const reports = cloneAndFreezeMaterialConformanceReports(input)
    expect(reports).toEqual(input)
    expect(Object.isFrozen(reports)).toBe(true)
    expect(Object.isFrozen(reports[0])).toBe(true)
    expect(Object.isFrozen(reports[0]?.issues)).toBe(true)
    expect(Object.isFrozen(reports[0]?.issues[0])).toBe(true)
    expect(() => {
      (reports[0] as { valid: boolean }).valid = true
    }).toThrow()
    expect(reports[0]?.valid).toBe(false)
  })

  it('accepts one authenticated result and rejects replay and prior-session messages', () => {
    const reports = [{ materialType: 'authenticated', valid: true, issues: [] }]
    const session = createIsolatedConformanceSession()
    const message = createAuthenticatedResultMessage(session, reports)
    const receiver = createAuthenticatedResultReceiver()
    expect(receiver.accept(createHandshakeMessage(session))).toBeUndefined()
    expect(receiver.accept(message)).toEqual(reports)
    expect(receiver.accept(message)).toBeUndefined()

    const nextSession = createIsolatedConformanceSession()
    const nextReceiver = createAuthenticatedResultReceiver()
    expect(nextReceiver.accept(createHandshakeMessage(nextSession))).toBeUndefined()
    expect(nextReceiver.accept(message)).toBeUndefined()
  })

  it('rejects accessors, proxies, custom prototypes, sparse arrays, and extra fields', () => {
    let getterCalls = 0
    const accessor = {
      get materialType() {
        getterCalls++
        return 'accessor'
      },
      valid: true,
      issues: [],
    }
    const plain = { materialType: 'plain', valid: true, issues: [] }
    const customPrototype = Object.assign(Object.create({ inherited: true }), plain)
    const sparse = Array.from({ length: 1 })
    delete sparse[0]
    const malformed = [
      [{ ...plain, extra: true }],
      [accessor],
      [new Proxy(plain, {})],
      [customPrototype],
      sparse,
      [{ ...plain, issues: [{ code: 'X', path: '', message: '', extra: true }] }],
    ]
    for (const value of malformed)
      expect(() => cloneAndFreezeMaterialConformanceReports(value)).toThrow('CONFORMANCE_ISOLATED_EXECUTION_REPORT_INVALID')
    expect(getterCalls).toBe(0)
  })

  it('keeps independent per-report and total issue budgets', () => {
    const reports = Array.from({ length: 2 }, (_, reportIndex) => ({
      materialType: `material-${reportIndex}`,
      valid: false,
      issues: Array.from({ length: 300 }, (_, issueIndex) => ({ code: `E${issueIndex}`, path: '', message: 'failed' })),
    }))
    const cloned = cloneAndFreezeMaterialConformanceReports(reports)
    expect(cloned.map(report => report.issues.length)).toEqual([300, 300])
    expect(Object.isFrozen(cloned[1]?.issues[299])).toBe(true)

    const packageReports = Array.from({ length: 25 }, (_, reportIndex) => ({
      materialType: `builtin-${reportIndex}`,
      valid: false,
      issues: Array.from({ length: MAX_ISSUES_PER_REPORT }, (_, issueIndex) => ({ code: `E${issueIndex}`, path: '', message: '' })),
    }))
    const bounded = boundAndFreezeMaterialConformanceReports(packageReports)
    expect(bounded).toHaveLength(25)
    expect(bounded.reduce((total, report) => total + report.issues.length, 0)).toBe(25 * MAX_ISSUES_PER_REPORT)
    expect(25 * MAX_ISSUES_PER_REPORT).toBeLessThanOrEqual(MAX_TOTAL_ISSUES)
  })

  it('fairly bounds 1000 reports without losing material identity', () => {
    const reports = Array.from({ length: 1_000 }, (_, reportIndex) => ({
      materialType: `material-${reportIndex}`,
      valid: false,
      issues: Array.from({ length: 100 }, (_, issueIndex) => ({ code: `E${issueIndex}`, path: '', message: 'failed' })),
    }))
    const bounded = boundAndFreezeMaterialConformanceReports(reports)
    expect(bounded).toHaveLength(1_000)
    expect(bounded[999]?.materialType).toBe('material-999')
    expect(bounded.every(report => report.issues.length === Math.floor(MAX_TOTAL_ISSUES / 1_000))).toBe(true)
    expect(bounded.every(report => report.issues.filter(issue => issue.code === 'CONFORMANCE_ISSUES_TRUNCATED').length === 1)).toBe(true)
  })

  it('uses the serialized byte budget without wiping healthy reports', () => {
    const hugeIssue = { code: 'E', path: `/${'p'.repeat(4_094)}`, message: 'm'.repeat(1_024) }
    const reports = [
      ...Array.from({ length: 4 }, (_, index) => ({
        materialType: `malicious-${index}`,
        valid: false,
        issues: Array.from({ length: MAX_ISSUES_PER_REPORT }).fill(hugeIssue),
      })),
      { materialType: 'healthy', valid: true, issues: [] },
    ]
    expect(() => cloneAndFreezeMaterialConformanceReports(reports)).toThrow('CONFORMANCE_ISOLATED_EXECUTION_REPORT_BUDGET_EXCEEDED')
    const bounded = boundAndFreezeMaterialConformanceReports(reports)
    expect(bounded).toHaveLength(5)
    expect(bounded[4]).toEqual({ materialType: 'healthy', valid: true, issues: [] })
    expect(bounded.slice(0, 4).every(report => report.issues.some(issue => issue.code === 'CONFORMANCE_ISSUES_TRUNCATED'))).toBe(true)
  })

  it('emergency-compacts escaped single issues within the serialized budget', () => {
    const escaped = '"\\\u0001'
    const unicode = '\u754C\uD83D\uDE00'
    const reports = Array.from({ length: 1_000 }, (_, reportIndex) => ({
      materialType: `${reportIndex}:${escaped.repeat(341)}${unicode}`.slice(0, 1_024),
      valid: reportIndex % 2 === 0,
      issues: [{
        code: escaped.repeat(86).slice(0, 256),
        path: `/${escaped.repeat(1_365)}`.slice(0, 4_096),
        message: `${unicode}${escaped}`.repeat(256).slice(0, 1_024),
      }],
    }))
    expect(() => cloneAndFreezeMaterialConformanceReports(reports)).toThrow('CONFORMANCE_ISOLATED_EXECUTION_REPORT_BUDGET_EXCEEDED')

    const bounded = boundAndFreezeMaterialConformanceReports(reports)
    const rebound = boundAndFreezeMaterialConformanceReports(bounded)
    expect(bounded.map(report => report.materialType)).toEqual(reports.map(report => report.materialType))
    expect(bounded.every(report => !report.valid
      && report.issues.length === 1
      && report.issues[0]?.code === 'CONFORMANCE_ISSUES_TRUNCATED')).toBe(true)
    expect(Object.isFrozen(bounded)).toBe(true)
    expect(Object.isFrozen(bounded[999])).toBe(true)
    expect(Object.isFrozen(bounded[999]?.issues)).toBe(true)
    expect(Object.isFrozen(bounded[999]?.issues[0])).toBe(true)
    expect(() => cloneAndFreezeMaterialConformanceReports(bounded)).not.toThrow()
    expect(JSON.stringify(rebound)).toBe(JSON.stringify(bounded))

    const withEmptyInvalid = reports.map((report, reportIndex) => reportIndex === 999
      ? { ...report, valid: false, issues: [] }
      : report)
    const emptyInvalidBounded = boundAndFreezeMaterialConformanceReports(withEmptyInvalid)
    expect(emptyInvalidBounded[999]?.issues).toEqual([{
      code: 'CONFORMANCE_ISSUES_TRUNCATED',
      path: '',
      message: 'material issues exceeded serialized budget',
    }])
  })
})

function expectProcessGone(pid: number): void {
  expect(pid).toBeGreaterThan(0)
  expect(() => process.kill(pid, 0)).toThrow()
}
