import { z } from 'zod'

export const AssistantPluginScopeSchema = z.enum(['intake', 'planner', 'contract', 'materials', 'layout', 'schema', 'repair', 'all'])
export type AssistantPluginScope = z.infer<typeof AssistantPluginScopeSchema>

export const AssistantPluginContributionSchema = z.object({
  id: z.string().optional(),
  target: AssistantPluginScopeSchema,
  priority: z.number().optional(),
  title: z.string().optional(),
  content: z.string().min(1),
})
export type AssistantPluginContribution = z.infer<typeof AssistantPluginContributionSchema>

export const AssistantPluginContextItemSchema = z.object({
  id: z.string(),
  kind: z.string(),
  title: z.string().optional(),
  content: z.string().optional(),
  url: z.string().optional(),
  mimeType: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
})
export type AssistantPluginContextItem = z.infer<typeof AssistantPluginContextItemSchema>

export const AssistantPluginActionSchema = z.object({
  id: z.string(),
  label: z.string(),
  description: z.string().optional(),
  placement: z.enum(['plugin-center', 'composer', 'auto']).optional(),
})
export type AssistantPluginAction = z.infer<typeof AssistantPluginActionSchema>

export const AssistantPluginManifestSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  version: z.string(),
  category: z.string().optional(),
  defaultEnabled: z.boolean().optional(),
  staticContributions: z.array(AssistantPluginContributionSchema).optional(),
  actions: z.array(AssistantPluginActionSchema).optional(),
})
export type AssistantPluginManifest = z.infer<typeof AssistantPluginManifestSchema>

export const AssistantPluginInvokeRequestSchema = z.object({
  pluginId: z.string(),
  actionId: z.string(),
  prompt: z.string().optional(),
  currentSchema: z.unknown().optional(),
  materialManifest: z.unknown().optional(),
  state: z.unknown().optional(),
})
export type AssistantPluginInvokeRequest = z.infer<typeof AssistantPluginInvokeRequestSchema>

export const AssistantPluginResultSchema = z.object({
  contributions: z.array(AssistantPluginContributionSchema).optional(),
  contextItems: z.array(AssistantPluginContextItemSchema).optional(),
  state: z.unknown().optional(),
  warnings: z.array(z.string()).optional(),
})
export type AssistantPluginResult = z.infer<typeof AssistantPluginResultSchema>

export const AssistantPluginSelectionEntrySchema = z.object({
  pluginId: z.string(),
  enabled: z.boolean(),
  state: z.unknown().optional(),
  contributions: z.array(AssistantPluginContributionSchema).optional(),
  contextItems: z.array(AssistantPluginContextItemSchema).optional(),
  warnings: z.array(z.string()).optional(),
})
export type AssistantPluginSelectionEntry = z.infer<typeof AssistantPluginSelectionEntrySchema>

export const AssistantPluginSelectionSchema = z.object({
  plugins: z.array(AssistantPluginSelectionEntrySchema),
})
export type AssistantPluginSelection = z.infer<typeof AssistantPluginSelectionSchema>

export interface AssistantPlugin {
  manifest: AssistantPluginManifest
  invoke?: (request: AssistantPluginInvokeRequest) => Promise<AssistantPluginResult>
}
