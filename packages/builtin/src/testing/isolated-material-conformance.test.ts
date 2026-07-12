import type { MaterialConformanceReport } from '@easyink/core'
import { randomUUID } from 'node:crypto'
import { existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { createAuthenticatedResultReceiver, runIsolatedMaterialConformance } from './isolated-material-conformance'
import { cloneAndFreezeMaterialConformanceReports, createAuthenticatedResultMessage, createHandshakeMessage, createIsolatedConformanceSession } from './isolated-material-conformance-protocol'

const fixtureModule = pathToFileURL(join(process.cwd(), 'packages/builtin/src/testing/fixtures/isolated-material-fixtures.ts')).href
const invalidIpcModule = pathToFileURL(join(process.cwd(), 'packages/builtin/src/testing/fixtures/invalid-ipc-fixture.ts')).href
const spoofedResultModule = pathToFileURL(join(process.cwd(), 'packages/builtin/src/testing/fixtures/spoofed-result-fixture.ts')).href
const spoofedExitModule = pathToFileURL(join(process.cwd(), 'packages/builtin/src/testing/fixtures/spoofed-result-exit-fixture.ts')).href
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
    }, {
      deadlineMs: 5_000,
      environment: { EASYINK_CONFORMANCE_SENTINEL_PATH: sentinelPath },
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
})

function expectProcessGone(pid: number): void {
  expect(pid).toBeGreaterThan(0)
  expect(() => process.kill(pid, 0)).toThrow()
}
