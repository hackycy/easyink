import type { LocaleTree } from '@easyink/plugin-api/material'
import type { ContributionOwner, LocaleDiagnostic, LocaleSource } from './types'

const applicationOwner: ContributionOwner = Object.freeze({ pluginId: 'application', installationId: 'application', contributionId: 'locale' })

function leaves(tree: LocaleTree, prefix = '', ancestors = new Set<object>()): [string, unknown][] {
  const result: [string, unknown][] = []
  ancestors.add(tree)
  for (const [name, value] of Object.entries(tree)) {
    const key = prefix ? `${prefix}.${name}` : name
    if (value && typeof value === 'object' && !Array.isArray(value) && !ancestors.has(value))
      result.push(...leaves(value as LocaleTree, key, ancestors))
    else
      result.push([key, value])
  }
  ancestors.delete(tree)
  return result
}

/** Rebuilds a per-host index; never mutates the shared declaration trees. */
export class LocaleIndex {
  private readonly values = new Map<string, string>()
  private readonly adopted = new Map<string, ContributionOwner>()
  private readonly diagnostics: LocaleDiagnostic[] = []
  private readonly reported = new Set<string>()
  private code?: string

  constructor(private sources: readonly LocaleSource[]) {}

  get snapshot(): readonly LocaleDiagnostic[] {
    return Object.freeze([...this.diagnostics])
  }

  select(code?: string, messages?: LocaleTree) {
    this.code = code
    this.values.clear()
    this.adopted.clear()
    const applicationKeys = new Set<string>()
    const invalid: { key: string, owner: ContributionOwner }[] = []
    if (messages) {
      for (const [key, value] of leaves(messages)) {
        if (typeof value === 'string' && value.length) {
          this.values.set(key, value)
          this.adopted.set(key, applicationOwner)
          applicationKeys.add(key)
        }
        else {
          invalid.push({ key, owner: applicationOwner })
        }
      }
    }
    for (const { owner, declaration } of this.sources) {
      // An existing language tree replaces messages as a whole, even when empty.
      const tree = (code ? declaration.locales?.[code] : undefined) ?? declaration.messages
      if (!tree)
        continue
      for (const [key, value] of leaves(tree)) {
        if (typeof value !== 'string' || !value.length) {
          invalid.push({ key, owner })
        }
        else if (!this.values.has(key)) {
          this.values.set(key, value)
          this.adopted.set(key, owner)
        }
        else if (!applicationKeys.has(key) && this.values.get(key) !== value) {
          this.report('locale-conflict', key, owner, this.adopted.get(key))
        }
      }
    }
    for (const { key, owner } of invalid)
      this.report('locale-invalid', key, owner, this.adopted.get(key))
  }

  t(key: string) {
    const value = this.values.get(key)
    if (value !== undefined)
      return value
    this.report('locale-missing', key, applicationOwner)
    return key
  }

  clear() {
    this.values.clear()
    this.adopted.clear()
    this.sources = []
    this.diagnostics.length = 0
    this.reported.clear()
  }

  private report(code: LocaleDiagnostic['code'], key: string, source: ContributionOwner, adoptedSource?: ContributionOwner) {
    const language = this.code ?? 'default'
    const id = JSON.stringify([code, language, key, source.pluginId, source.installationId, source.contributionId])
    if (this.reported.has(id))
      return
    this.reported.add(id)
    this.diagnostics.push(Object.freeze({ code, language, key, source, adoptedSource }))
  }
}
