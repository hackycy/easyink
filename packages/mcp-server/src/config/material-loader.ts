import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export interface MaterialTypeConfig {
  description: string
  properties: string[]
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
