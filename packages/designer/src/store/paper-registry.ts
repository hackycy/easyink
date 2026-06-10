import type { PaperPreset } from '@easyink/shared'
import type { DesignerPaperConfig } from '../runtime-config'
import { PAPER_PRESETS } from '@easyink/shared'
import { markRaw } from 'vue'

function getPresetKey(preset: PaperPreset): string {
  return preset.name
}

function normalizePreset(preset: PaperPreset): PaperPreset {
  return markRaw({
    name: preset.name,
    width: preset.width,
    height: preset.height,
  })
}

export class PaperRegistry {
  private presets = markRaw(new Map<string, PaperPreset>())
  private defaultPresetName: string | undefined

  constructor(config?: DesignerPaperConfig) {
    this.configure(config)
  }

  configure(config?: DesignerPaperConfig): void {
    this.presets.clear()

    const mode = config?.mode ?? 'append'
    const basePresets = mode === 'replace' ? [] : PAPER_PRESETS
    for (const preset of basePresets)
      this.registerPreset(preset)

    for (const preset of config?.presets ?? [])
      this.registerPreset(preset)

    this.defaultPresetName = config?.defaultPreset
  }

  registerPreset(preset: PaperPreset): void {
    this.presets.set(getPresetKey(preset), normalizePreset(preset))
  }

  listPresets(): PaperPreset[] {
    return Array.from(this.presets.values())
  }

  getDefaultPreset(): PaperPreset | undefined {
    if (!this.defaultPresetName)
      return undefined
    return this.getPreset(this.defaultPresetName)
  }

  getPreset(name: string): PaperPreset | undefined {
    return this.presets.get(name)
  }

  resolveBySize(width: number, height: number): PaperPreset | undefined {
    return this.listPresets().find(preset => preset.width === width && preset.height === height)
  }

  clear(): void {
    this.presets.clear()
    this.defaultPresetName = undefined
  }
}
