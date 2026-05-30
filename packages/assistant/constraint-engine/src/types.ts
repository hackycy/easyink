import type { MaterialNode } from '@easyink/schema'

export interface EngineValidationResult {
  passed: boolean
  errors: ConstraintViolation[]
  warnings: ConstraintViolation[]
  autoFixed: AutoFixResult[]
}

export interface ConstraintViolation {
  constraintId: string
  materialType: string
  elementId: string
  severity: 'error' | 'warning'
  message: string
  details?: string
}

export interface AutoFixResult {
  constraintId: string
  elementId: string
  reason: string
  original: MaterialNode
  fixed: MaterialNode
}

export interface ConstraintEngineOptions {
  autoFix?: boolean
  stopOnFirstError?: boolean
}
