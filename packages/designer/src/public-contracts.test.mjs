import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import process from 'node:process'
import { expect, it } from 'vitest'

it('consumes actual public Designer creation, materials, UI and commands with restricted contexts', () => {
  const script = resolve(process.cwd(), 'packages/designer/src/test-fixtures/check-consumption.mjs')
  const result = JSON.parse(execFileSync(process.execPath, [script], { encoding: 'utf8', timeout: 30000 }))
  expect(result.forbidden).toEqual([])
}, 35000)
