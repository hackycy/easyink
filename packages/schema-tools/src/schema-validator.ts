import type { BindingRef, DocumentSchema, MaterialNode } from '@easyink/schema'
import { BLOCKED_PATH_KEYS, deepClone, FIELD_PATH_SEPARATOR, generateId } from '@easyink/shared'

/**
 * Validation error.
 */
export interface ValidationError {
  code: string
  message: string
  location?: string
  path?: string
  autoFixable?: boolean
}

/**
 * Validation warning.
 */
export interface ValidationWarning {
  code: string
  message: string
  location?: string
}

/**
 * Auto-fixed issue.
 */
export interface AutoFixedIssue {
  original: unknown
  fixed: unknown
  reason: string
  path: string
}

/**
 * Validation result.
 */
export interface ValidationResult {
  valid: boolean
  errors: ValidationError[]
  warnings: ValidationWarning[]
  autoFixed: AutoFixedIssue[]
}

/**
 * Schema validator options.
 */
export interface SchemaValidatorOptions {
  strictMode: boolean
  allowedMaterialTypes?: Set<string>
  allowedDataSourceIds?: Set<string>
  autoFix?: boolean
}

/**
 * Default validator options.
 */
const DEFAULT_OPTIONS: SchemaValidatorOptions = {
  strictMode: false,
  autoFix: true,
}

/**
 * Schema validator with auto-fix capabilities.
 */
export class SchemaValidator {
  private options: SchemaValidatorOptions

  constructor(options: Partial<SchemaValidatorOptions> = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options }
  }

  /**
   * Perform full validation on a schema.
   */
  validate(schema: unknown): ValidationResult {
    const errors: ValidationError[] = []
    const warnings: ValidationWarning[] = []
    const autoFixed: AutoFixedIssue[] = []

    // Step 1: Structure validation
    const structResult = this.validateStructure(schema)
    errors.push(...structResult.errors)
    warnings.push(...structResult.warnings)
    autoFixed.push(...structResult.autoFixed)

    // Step 2: Semantic validation (only if structure is valid)
    if (structResult.valid) {
      const schemaObj = schema as DocumentSchema
      const semanticResult = this.validateSemantics(schemaObj)
      errors.push(...semanticResult.errors)
      warnings.push(...semanticResult.warnings)

      // Step 3: Binding validation
      const bindingResult = this.validateBindings(schemaObj)
      errors.push(...bindingResult.errors)
      warnings.push(...bindingResult.warnings)
    }

    // Filter out auto-fixed errors if autoFix is enabled
    const criticalErrors = this.options.autoFix
      ? errors.filter(e => !e.autoFixable)
      : errors

    return {
      valid: criticalErrors.length === 0,
      errors: criticalErrors,
      warnings,
      autoFixed,
    }
  }

  /**
   * Validate schema structure.
   */
  validateStructure(schema: unknown): ValidationResult {
    const errors: ValidationError[] = []
    const warnings: ValidationWarning[] = []
    const autoFixed: AutoFixedIssue[] = []

    if (schema === null || schema === undefined) {
      errors.push({ code: 'SCHEMA_NULL', message: 'Schema cannot be null or undefined' })
      return { valid: false, errors, warnings, autoFixed }
    }

    if (typeof schema !== 'object') {
      errors.push({ code: 'SCHEMA_NOT_OBJECT', message: 'Schema must be an object' })
      return { valid: false, errors, warnings, autoFixed }
    }

    const s = schema as Record<string, unknown>

    // Check required top-level fields
    if (!s.version) {
      autoFixed.push({
        original: s.version,
        fixed: '1.0.0',
        reason: 'Added missing version field with default value',
        path: 'version',
      })
      errors.push({
        code: 'MISSING_VERSION',
        message: 'Missing required field: version',
        path: 'version',
        autoFixable: true,
      })
    }

    if (!s.page) {
      errors.push({
        code: 'MISSING_PAGE',
        message: 'Missing required field: page',
        path: 'page',
        autoFixable: true,
      })
    }

    if (!Array.isArray(s.elements)) {
      autoFixed.push({
        original: s.elements,
        fixed: [],
        reason: 'Initialized elements array',
        path: 'elements',
      })
      errors.push({
        code: 'INVALID_ELEMENTS',
        message: 'elements must be an array',
        path: 'elements',
        autoFixable: true,
      })
    }

    // Check page structure
    if (s.page && typeof s.page === 'object') {
      const page = s.page as Record<string, unknown>
      if (!page.mode) {
        warnings.push({
          code: 'MISSING_PAGE_MODE',
          message: 'Page mode not specified, assuming fixed',
          location: 'page.mode',
        })
        autoFixed.push({
          original: page.mode,
          fixed: 'fixed',
          reason: 'Added default page mode',
          path: 'page.mode',
        })
      }
    }

    return {
      valid: errors.filter(e => !e.autoFixable).length === 0,
      errors,
      warnings,
      autoFixed,
    }
  }

  /**
   * Validate schema semantics.
   */
  validateSemantics(schema: DocumentSchema): ValidationResult {
    const errors: ValidationError[] = []
    const warnings: ValidationWarning[] = []

    // Validate elements
    for (let i = 0; i < schema.elements.length; i++) {
      const element = schema.elements[i]

      // Check element has required fields
      if (!element.id) {
        errors.push({
          code: 'ELEMENT_NO_ID',
          message: `Element at index ${i} missing required field: id`,
          location: `elements[${i}]`,
        })
      }

      if (!element.type) {
        errors.push({
          code: 'ELEMENT_NO_TYPE',
          message: `Element "${element.id || i}" missing required field: type`,
          location: `elements[${i}]`,
        })
      }
      else if (this.options.allowedMaterialTypes && !this.options.allowedMaterialTypes.has(element.type)) {
        errors.push({
          code: 'UNKNOWN_MATERIAL_TYPE',
          message: `Unknown material type: "${element.type}"`,
          location: `elements[${i}].type`,
        })
      }

      // Check geometry
      if (typeof element.x !== 'number' || typeof element.y !== 'number') {
        errors.push({
          code: 'INVALID_POSITION',
          message: `Element "${element.id || i}" has invalid position`,
          location: `elements[${i}]`,
        })
      }

      if (typeof element.width !== 'number' || typeof element.height !== 'number') {
        errors.push({
          code: 'INVALID_DIMENSIONS',
          message: `Element "${element.id || i}" has invalid dimensions`,
          location: `elements[${i}]`,
        })
      }
    }

    return { valid: errors.length === 0, errors, warnings, autoFixed: [] }
  }

  /**
   * Validate binding references.
   */
  validateBindings(schema: DocumentSchema): ValidationResult {
    const errors: ValidationError[] = []
    const warnings: ValidationWarning[] = []

    // Extract all binding refs from elements
    const allBindings = this.extractAllBindings(schema)

    for (const binding of allBindings) {
      // Check fieldPath format
      if (!binding.fieldPath) {
        errors.push({
          code: 'BINDING_NO_PATH',
          message: 'Binding missing fieldPath',
          location: `binding`,
        })
      }
      else if (!binding.fieldPath.startsWith(FIELD_PATH_SEPARATOR) && !/^[a-z_]/i.test(binding.fieldPath)) {
        warnings.push({
          code: 'BINDING_PATH_FORMAT',
          message: `fieldPath "${binding.fieldPath}" should start with "/" or a letter`,
          location: `binding.fieldPath`,
        })
      }

      // Check fieldPath doesn't contain blocked keys
      const segments = binding.fieldPath.split(FIELD_PATH_SEPARATOR)
      for (const segment of segments) {
        if (BLOCKED_PATH_KEYS.has(segment)) {
          errors.push({
            code: 'BINDING_BLOCKED_PATH',
            message: `fieldPath contains blocked key: "${segment}"`,
            location: `binding.fieldPath`,
          })
        }
      }

      // Check sourceId exists (if provided)
      if (binding.sourceId && this.options.allowedDataSourceIds && !this.options.allowedDataSourceIds.has(binding.sourceId)) {
        warnings.push({
          code: 'BINDING_UNKNOWN_SOURCE',
          message: `Binding references unknown data source: "${binding.sourceId}"`,
          location: `binding.sourceId`,
        })
      }
    }

    return { valid: errors.length === 0, errors, warnings, autoFixed: [] }
  }

  /**
   * Extract all binding references from a schema.
   */
  private extractAllBindings(schema: DocumentSchema): BindingRef[] {
    const bindings: BindingRef[] = []

    const traverse = (elements: MaterialNode[]): void => {
      for (const element of elements) {
        if (element.binding) {
          if (Array.isArray(element.binding)) {
            bindings.push(...element.binding)
          }
          else {
            bindings.push(element.binding)
          }
        }

        // Check table cells
        if ('table' in element) {
          const table = element as MaterialNode & { table: { topology?: { rows?: Array<{ cells?: Array<{ binding?: BindingRef, staticBinding?: BindingRef }> }> } } }
          if (table.table?.topology?.rows) {
            for (const row of table.table.topology.rows) {
              if (row.cells) {
                for (const cell of row.cells) {
                  if (cell.binding)
                    bindings.push(cell.binding)
                  if (cell.staticBinding)
                    bindings.push(cell.staticBinding)
                }
              }
            }
          }
        }

        // Traverse children
        if (element.children) {
          traverse(element.children)
        }
      }
    }

    traverse(schema.elements)
    return bindings
  }

  /**
   * Auto-fix a schema.
   */
  autoFix(schema: DocumentSchema): { fixed: DocumentSchema, issues: AutoFixedIssue[] } {
    const fixed = deepClone(schema)
    const issues: AutoFixedIssue[] = []
    if (!fixed.version) {
      const original = fixed.version
      fixed.version = '1.0.0'
      issues.push({
        original,
        fixed: fixed.version,
        reason: 'Added missing version field',
        path: 'version',
      })
    }

    // Fix elements array
    if (!Array.isArray(fixed.elements)) {
      issues.push({
        original: fixed.elements,
        fixed: [],
        reason: 'Initialized elements array',
        path: 'elements',
      })
      fixed.elements = []
    }

    // Fix element IDs
    for (let i = 0; i < fixed.elements.length; i++) {
      const el = fixed.elements[i]
      if (!el.id) {
        issues.push({
          original: el.id,
          fixed: generateId('el'),
          reason: 'Added missing element ID',
          path: `elements[${i}].id`,
        })
        el.id = generateId('el')
      }
    }

    return { fixed, issues }
  }
}

/**
 * Normalize all field paths in a schema to use canonical separator.
 */
export function normalizeAllFieldPaths(schema: DocumentSchema): DocumentSchema {
  const fixed = deepClone(schema)

  const traverse = (elements: MaterialNode[]): void => {
    for (const element of elements) {
      // Fix binding paths
      if (element.binding) {
        const bindings = Array.isArray(element.binding) ? element.binding : [element.binding]
        for (const binding of bindings) {
          if (binding.fieldPath && binding.fieldPath.includes('.')) {
            binding.fieldPath = binding.fieldPath.replace(/\./g, FIELD_PATH_SEPARATOR)
          }
        }
      }

      // Fix table cells
      if ('table' in element) {
        const table = element as MaterialNode & { table: { topology?: { rows?: Array<{ cells?: Array<{ binding?: BindingRef, staticBinding?: BindingRef }> }> } } }
        if (table.table?.topology?.rows) {
          for (const row of table.table.topology.rows) {
            if (row.cells) {
              for (const cell of row.cells) {
                if (cell.binding?.fieldPath && cell.binding.fieldPath.includes('.')) {
                  cell.binding.fieldPath = cell.binding.fieldPath.replace(/\./g, FIELD_PATH_SEPARATOR)
                }
                if (cell.staticBinding?.fieldPath && cell.staticBinding.fieldPath.includes('.')) {
                  cell.staticBinding.fieldPath = cell.staticBinding.fieldPath.replace(/\./g, FIELD_PATH_SEPARATOR)
                }
              }
            }
          }
        }
      }

      if (element.children) {
        traverse(element.children)
      }
    }
  }

  traverse(fixed.elements)
  return fixed
}
