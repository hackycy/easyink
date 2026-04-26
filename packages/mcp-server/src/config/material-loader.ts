import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export interface MaterialTypeConfig {
  description: string
  properties: string[]
  requiredProps?: string[]
  binding?: 'none' | 'single' | 'multi'
  usage?: string[]
  schemaRules?: string[]
  examples?: Array<Record<string, unknown>>
}

export interface MaterialConfig {
  version: string
  schemaVersion: string
  pageDefaults: {
    mode: string
    width: number
    height: number
    unit: string
  }
  generatedFrom?: string
  materialAliases?: Record<string, string>
  generationRules?: Record<string, string>
  materialTypes: Record<string, MaterialTypeConfig>
  bindingRules: {
    fieldPathFormat: string
    sourceIdFormat: string
    bindingTypes: Array<{
      type: string
      description: string
      fields: string[]
    }>
    tableRules: {
      repeatTemplateBinding: string
      staticBindingUsage: string
    }
  }
}

let cachedConfig: MaterialConfig | null = null

export function loadMaterialsConfig(configPath?: string): MaterialConfig {
  if (cachedConfig)
    return cachedConfig

  const path = configPath
    ?? resolve(dirname(fileURLToPath(import.meta.url)), '../../config/materials.json')

  const raw = readFileSync(path, 'utf-8')
  cachedConfig = JSON.parse(raw) as MaterialConfig
  return cachedConfig
}

export function buildMaterialContext(config: MaterialConfig): string {
  const lines: string[] = []

  lines.push('## Page Defaults')
  lines.push(`- Mode: ${config.pageDefaults.mode}`)
  lines.push(`- Default size: ${config.pageDefaults.width}mm x ${config.pageDefaults.height}mm (A4)`)
  lines.push(`- Unit: ${config.pageDefaults.unit}`)
  lines.push('')

  lines.push('## Available Material Types')
  for (const [type, meta] of Object.entries(config.materialTypes)) {
    lines.push(`### ${type}`)
    lines.push(`- ${meta.description}`)
    lines.push(`- Properties: ${meta.properties.join(', ')}`)
    if (meta.requiredProps && meta.requiredProps.length > 0)
      lines.push(`- Required props: ${meta.requiredProps.join(', ')}`)
    if (meta.binding)
      lines.push(`- Binding: ${meta.binding}`)
    for (const usage of meta.usage ?? []) {
      lines.push(`- Usage: ${usage}`)
    }
    for (const rule of meta.schemaRules ?? []) {
      lines.push(`- Schema rule: ${rule}`)
    }
    lines.push('')
  }

  if (config.materialAliases && Object.keys(config.materialAliases).length > 0) {
    lines.push('## Material Aliases')
    lines.push('- The aliases below are accepted only as repair hints. Generate the canonical material type, never the alias.')
    for (const [alias, canonical] of Object.entries(config.materialAliases)) {
      lines.push(`- ${alias} -> ${canonical}`)
    }
    lines.push('')
  }

  if (config.generationRules && Object.keys(config.generationRules).length > 0) {
    lines.push('## Generation Rules From Material Config')
    for (const [name, rule] of Object.entries(config.generationRules)) {
      lines.push(`- ${name}: ${rule}`)
    }
    lines.push('')
  }

  lines.push('## Binding Rules')
  lines.push(`- Field paths use "${config.bindingRules.fieldPathFormat}"`)
  lines.push(`- Source IDs use "${config.bindingRules.sourceIdFormat}"`)
  lines.push('')
  lines.push('### Binding Types')
  for (const bt of config.bindingRules.bindingTypes) {
    lines.push(`- **${bt.type}**: ${bt.description}`)
    lines.push(`  Fields: ${bt.fields.join(', ')}`)
  }
  lines.push('')
  lines.push('### Table Rules')
  lines.push(`- ${config.bindingRules.tableRules.repeatTemplateBinding}`)
  lines.push(`- ${config.bindingRules.tableRules.staticBindingUsage}`)

  return lines.join('\n')
}

export function getMaterialTypes(config: MaterialConfig): Set<string> {
  return new Set(Object.keys(config.materialTypes))
}

export function getMaterialAliases(config: MaterialConfig): Record<string, string> {
  return config.materialAliases ?? {}
}
