import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import process from 'node:process'
import { expect, it } from 'vitest'

it('consumes emitted Viewer collections and rejects legacy registration without importing UI', () => {
  const script = resolve(process.cwd(), 'packages/viewer/src/test-fixtures/check-consumption.mjs')
  const result = JSON.parse(execFileSync(process.execPath, [script], { encoding: 'utf8', timeout: 30000 }))
  expect(result.forbidden).toEqual([])
  expect(result.empty.forbidden).toEqual([])
}, 35000)
