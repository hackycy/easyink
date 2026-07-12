import type { ErrorObject, ValidateFunction } from 'ajv'
import type { JsonObject } from './json-value'
import Ajv from 'ajv'
import { appendRfc6901Token } from './json-pointer'
import { assertJsonValue } from './json-value'

export interface JsonSchemaValidationIssue {
  instancePath: `/${string}` | ''
  keyword: string
  schemaPath: string
  message: string
}

export interface CompiledJsonSchema {
  validate: (value: unknown) => readonly JsonSchemaValidationIssue[]
}

export class JsonSchemaCompileError extends Error {
  constructor(readonly issues: readonly JsonSchemaValidationIssue[]) {
    super(issues.map(issue => `${issue.keyword} ${issue.schemaPath}: ${issue.message}`).join('\n'))
    this.name = 'JsonSchemaCompileError'
  }
}

const ajv = new Ajv({
  addUsedSchema: false,
  allErrors: true,
  strict: false,
  strictSchema: true,
  allowUnionTypes: true,
  ownProperties: true,
  validateSchema: true,
})
const cache = new WeakMap<JsonObject, CompiledJsonSchema>()

export function compileJsonSchema(schema: JsonObject): CompiledJsonSchema {
  assertJsonValue(schema)
  const cached = cache.get(schema)
  if (cached)
    return cached
  let validate: ValidateFunction
  try {
    validate = ajv.compile(schema)
  }
  catch (error) {
    const message = error instanceof Error ? error.message : 'JSON Schema compilation failed'
    throw new JsonSchemaCompileError([{ instancePath: '', keyword: 'schema', schemaPath: '', message }])
  }
  const compiled = Object.freeze({
    validate(value: unknown): readonly JsonSchemaValidationIssue[] {
      return validate(value) ? [] : normalizeErrors(validate.errors ?? [])
    },
  })
  cache.set(schema, compiled)
  return compiled
}

export function validateJsonSchema(schema: JsonObject, value: unknown): readonly JsonSchemaValidationIssue[] {
  return compileJsonSchema(schema).validate(value)
}

export function jsonSchemaDiagnosticCode(prefix: 'MODEL' | 'BINDING', keyword: string): string {
  const normalized = keyword
    .replace(/([a-z0-9])([A-Z])/gu, '$1_$2')
    .replace(/[^a-z0-9]+/giu, '_')
    .toUpperCase()
  return `${prefix}_SCHEMA_${normalized}`
}

function normalizeErrors(errors: ErrorObject[]): readonly JsonSchemaValidationIssue[] {
  return Object.freeze(errors.map((error) => {
    let instancePath = error.instancePath as `/${string}` | ''
    if (error.keyword === 'required' && typeof error.params.missingProperty === 'string')
      instancePath = appendRfc6901Token(instancePath, error.params.missingProperty)
    if (error.keyword === 'additionalProperties' && typeof error.params.additionalProperty === 'string')
      instancePath = appendRfc6901Token(instancePath, error.params.additionalProperty)
    return Object.freeze({
      instancePath,
      keyword: error.keyword,
      schemaPath: error.schemaPath,
      message: error.message ?? 'JSON Schema validation failed',
    })
  }).sort(compareIssues))
}

function compareIssues(left: JsonSchemaValidationIssue, right: JsonSchemaValidationIssue): number {
  return compareText(left.instancePath, right.instancePath)
    || compareText(left.keyword, right.keyword)
    || compareText(left.schemaPath, right.schemaPath)
    || compareText(left.message, right.message)
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}
