import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import process from 'node:process'
import { expect, it } from 'vitest'

it('consumes emitted public contracts and rejects forbidden capabilities without importing host UI', () => {
  const script = resolve(process.cwd(), 'packages/plugin-api/src/test-fixtures/check-consumption.mjs')
  const result = JSON.parse(execFileSync(process.execPath, [script], { encoding: 'utf8', timeout: 30000 }))
  expect(result.map((entry: { entry: string }) => entry.entry)).toEqual(['root', 'model', 'designer', 'viewer', 'ui', 'runtime', 'runtime-consumer'])
  for (const entry of result)
    expect(entry.forbidden).toEqual([])
}, 35000)
