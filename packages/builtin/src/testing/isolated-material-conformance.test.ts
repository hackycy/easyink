import { randomUUID } from 'node:crypto'
import { existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { runIsolatedMaterialConformance } from './isolated-material-conformance'

const fixtureModule = pathToFileURL(join(process.cwd(), 'packages/builtin/src/testing/fixtures/isolated-material-fixtures.ts')).href
const invalidIpcModule = pathToFileURL(join(process.cwd(), 'packages/builtin/src/testing/fixtures/invalid-ipc-fixture.ts')).href
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
    expectProcessGone(pid)
    await new Promise(resolve => setTimeout(resolve, 250))
    expect(existsSync(sentinelPath)).toBe(false)
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
    expect(invalid[0]?.issues[0]?.code).toBe('CONFORMANCE_ISOLATED_EXECUTION_INVALID_IPC')
    expectProcessGone(invalidPid)
  }, 15_000)
})

function expectProcessGone(pid: number): void {
  expect(pid).toBeGreaterThan(0)
  expect(() => process.kill(pid, 0)).toThrow()
}
