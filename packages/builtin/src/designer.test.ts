import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

describe('builtin framework-neutral boundary', () => {
  it('does not depend on Vue or icon components', () => {
    const packageRoot = path.resolve(import.meta.dirname, '..')
    const packageJson = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>
      peerDependencies?: Record<string, string>
    }
    const source = fs.readdirSync(path.join(packageRoot, 'src'))
      .filter(file => file.endsWith('.ts'))
      .map(file => fs.readFileSync(path.join(packageRoot, 'src', file), 'utf8'))
      .join('\n')

    expect(packageJson.dependencies ?? {}).not.toHaveProperty('@easyink/icons')
    expect(packageJson.peerDependencies ?? {}).not.toHaveProperty('vue')
    expect(source).not.toMatch(/from ['"](?:vue|@easyink\/icons)['"]/)
  })
})
