export { DataSourceAligner } from './datasource-aligner'
export type { AlignmentResult, UnalignedBinding } from './datasource-aligner'
export { buildDataSourceDescriptor } from './datasource-descriptor'
export type { BuildDataSourceDescriptorOptions } from './datasource-descriptor'
export {
  coerceLLMPlan,
  getDomainProfile,
  inferAIGenerationPlan,
  listDomainProfiles,
  registerDomainProfile,
} from './domain-profile'
export type { DomainFieldSpec, DomainProfile } from './domain-profile'
export { repairGeneratedSchema, validateGeneratedSchemaAccuracy } from './generation-accuracy'
export type { GenerationAccuracyIssue, GenerationAccuracyOptions, GenerationRepairIssue } from './generation-accuracy'
export { normalizeAllFieldPaths, SchemaValidator } from './schema-validator'
export type {
  AutoFixedIssue,
  SchemaValidatorOptions,
  ValidationError,
  ValidationResult,
  ValidationWarning,
} from './schema-validator'
export { buildSchemaFromTemplateIntent, normalizeTemplateIntent } from './template-intent'
export type { TemplateBuildOptions, TemplateBuildResult, TemplateGenerationIntent, TemplateIntentColumn, TemplateIntentField, TemplateIntentSection, TemplateIntentSectionKind } from './template-intent'
