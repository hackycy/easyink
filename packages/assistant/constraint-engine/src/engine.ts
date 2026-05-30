import type {
  ConstraintContext,
  MaterialKnowledgeRegistry,
} from '@easyink/assistant-material-knowledge'
import type { MaterialNode } from '@easyink/schema'
import type {
  AutoFixResult,
  ConstraintEngineOptions,
  ConstraintViolation,
  EngineValidationResult,
} from './types'

export class ConstraintEngine {
  private readonly registry: MaterialKnowledgeRegistry

  constructor(registry: MaterialKnowledgeRegistry) {
    this.registry = registry
  }

  validateElement(
    node: MaterialNode,
    context: ConstraintContext,
    options: ConstraintEngineOptions = {},
  ): EngineValidationResult {
    const knowledge = this.registry.get(node.type)
    if (!knowledge) {
      return {
        passed: false,
        errors: [{
          constraintId: 'material-type-registered',
          materialType: node.type,
          elementId: node.id,
          severity: 'error',
          message: `Unknown material type: ${node.type}`,
        }],
        warnings: [],
        autoFixed: [],
      }
    }

    const errors: ConstraintViolation[] = []
    const warnings: ConstraintViolation[] = []
    const autoFixed: AutoFixResult[] = []
    let currentNode = node

    for (const constraint of knowledge.constraints) {
      const result = constraint.check(currentNode, context)
      if (result.passed)
        continue

      const violation: ConstraintViolation = {
        constraintId: constraint.id,
        materialType: node.type,
        elementId: node.id,
        severity: constraint.severity,
        message: constraint.message,
        details: result.details,
      }

      if (options.autoFix && constraint.autoFix) {
        const fixed = constraint.autoFix(currentNode, context)
        if (fixed) {
          autoFixed.push({
            constraintId: constraint.id,
            elementId: node.id,
            reason: constraint.message,
            original: currentNode,
            fixed,
          })
          currentNode = fixed
          continue
        }
      }

      if (constraint.severity === 'error') {
        errors.push(violation)
        if (options.stopOnFirstError)
          break
      }
      else {
        warnings.push(violation)
      }
    }

    return { passed: errors.length === 0, errors, warnings, autoFixed }
  }

  validateSchema(
    elements: MaterialNode[],
    context: ConstraintContext,
    options: ConstraintEngineOptions = {},
  ): EngineValidationResult {
    const allErrors: ConstraintViolation[] = []
    const allWarnings: ConstraintViolation[] = []
    const allAutoFixed: AutoFixResult[] = []

    for (const element of elements) {
      const result = this.validateElement(element, context, options)
      allErrors.push(...result.errors)
      allWarnings.push(...result.warnings)
      allAutoFixed.push(...result.autoFixed)
      if (options.stopOnFirstError && result.errors.length > 0)
        break
    }

    const boundsResult = this.checkBounds(elements, context)
    allErrors.push(...boundsResult.errors)
    allWarnings.push(...boundsResult.warnings)

    return {
      passed: allErrors.length === 0,
      errors: allErrors,
      warnings: allWarnings,
      autoFixed: allAutoFixed,
    }
  }

  validateAndFix(
    elements: MaterialNode[],
    context: ConstraintContext,
  ): { elements: MaterialNode[], result: EngineValidationResult } {
    const fixedElements: MaterialNode[] = []
    const allErrors: ConstraintViolation[] = []
    const allWarnings: ConstraintViolation[] = []
    const allAutoFixed: AutoFixResult[] = []

    for (const element of elements) {
      const result = this.validateElement(element, context, { autoFix: true })
      allErrors.push(...result.errors)
      allWarnings.push(...result.warnings)
      allAutoFixed.push(...result.autoFixed)

      if (result.autoFixed.length > 0) {
        const lastFix = result.autoFixed[result.autoFixed.length - 1]
        fixedElements.push(lastFix.fixed)
      }
      else {
        fixedElements.push(element)
      }
    }

    return {
      elements: fixedElements,
      result: {
        passed: allErrors.length === 0,
        errors: allErrors,
        warnings: allWarnings,
        autoFixed: allAutoFixed,
      },
    }
  }

  private checkBounds(
    elements: MaterialNode[],
    context: ConstraintContext,
  ): { errors: ConstraintViolation[], warnings: ConstraintViolation[] } {
    const errors: ConstraintViolation[] = []
    const warnings: ConstraintViolation[] = []

    for (const el of elements) {
      if (el.x + el.width > context.pageWidth) {
        errors.push({
          constraintId: 'bounds-horizontal',
          materialType: el.type,
          elementId: el.id,
          severity: 'error',
          message: `Element exceeds page width: x(${el.x}) + width(${el.width}) > ${context.pageWidth}`,
        })
      }
      if (context.pageMode === 'fixed' && el.y + el.height > context.pageHeight) {
        errors.push({
          constraintId: 'bounds-vertical',
          materialType: el.type,
          elementId: el.id,
          severity: 'error',
          message: `Element exceeds page height: y(${el.y}) + height(${el.height}) > ${context.pageHeight}`,
        })
      }
    }

    return { errors, warnings }
  }
}
