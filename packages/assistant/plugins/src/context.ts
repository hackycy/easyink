import type {
  AssistantPluginContextItem,
  AssistantPluginContribution,
  AssistantPluginScope,
  AssistantPluginSelection,
  AssistantPluginSelectionEntry,
} from './types'

export interface BuildAssistantPluginContextOptions {
  target: AssistantPluginScope
}

export function buildAssistantPluginContext(
  selection: AssistantPluginSelection | undefined,
  options: BuildAssistantPluginContextOptions,
): string {
  const entries = selection?.plugins.filter(plugin => plugin.enabled) ?? []
  if (!entries.length)
    return ''

  const contributions = entries
    .flatMap(plugin => normalizeContributions(plugin, options.target))
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
  const contextItems = entries.flatMap(plugin => normalizeContextItems(plugin.contextItems, plugin.pluginId))
  const warnings = entries.flatMap(plugin => plugin.warnings?.map(warning => `${plugin.pluginId}: ${warning}`) ?? [])

  if (!contributions.length && !contextItems.length && !warnings.length)
    return ''

  const lines: string[] = ['## Enabled Assistant Plugins']

  if (contributions.length) {
    lines.push('### Prompt contributions')
    for (const item of contributions) {
      lines.push(`- ${item.title ? `${item.title}: ` : ''}${item.content}`)
    }
  }

  if (contextItems.length) {
    lines.push('### Context items')
    for (const item of contextItems) {
      lines.push(`- [${item.kind}] ${item.title ?? item.id}${item.url ? ` ${item.url}` : ''}${item.content ? ` - ${item.content}` : ''}${formatMetadata(item.metadata)}`)
    }
  }

  if (warnings.length) {
    lines.push('### Plugin warnings')
    for (const warning of warnings)
      lines.push(`- ${warning}`)
  }

  return lines.join('\n')
}

function normalizeContributions(
  plugin: AssistantPluginSelectionEntry,
  target: AssistantPluginScope,
): AssistantPluginContribution[] {
  return (plugin.contributions ?? []).filter((contribution) => {
    return contribution.target === 'all' || contribution.target === target
  })
}

function normalizeContextItems(items: AssistantPluginContextItem[] | undefined, pluginId: string): AssistantPluginContextItem[] {
  return (items ?? []).map(item => ({
    ...item,
    id: item.id || `${pluginId}-context`,
  }))
}

function formatMetadata(metadata: Record<string, unknown> | undefined): string {
  if (!metadata || Object.keys(metadata).length === 0)
    return ''
  return ` (${JSON.stringify(metadata)})`
}
