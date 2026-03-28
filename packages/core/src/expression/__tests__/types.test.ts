import type {
  CompiledExpression,
  ExpressionContext,
  ExpressionEngine,
  SandboxConfig,
  ValidationError,
  ValidationResult,
} from '../types'
import { describe, expect, it } from 'vitest'
import { DEFAULT_SANDBOX_CONFIG } from '../types'

describe('expression types', () => {
  describe('dEFAULT_SANDBOX_CONFIG', () => {
    it('should have correct allowedGlobals', () => {
      expect(DEFAULT_SANDBOX_CONFIG.allowedGlobals).toEqual([
        'Array',
        'Date',
        'JSON',
        'Math',
        'Number',
        'Object',
        'String',
      ])
    })

    it('should have correct disallowedSyntax', () => {
      expect(DEFAULT_SANDBOX_CONFIG.disallowedSyntax).toEqual([
        'ArrowFunctionExpression',
        'FunctionExpression',
        'ImportExpression',
        'NewExpression',
      ])
    })

    it('should have timeout of 100ms', () => {
      expect(DEFAULT_SANDBOX_CONFIG.timeout).toBe(100)
    })

    it('should have maxDepth of 10', () => {
      expect(DEFAULT_SANDBOX_CONFIG.maxDepth).toBe(10)
    })

    it('should be frozen (readonly)', () => {
      expect(Object.isFrozen(DEFAULT_SANDBOX_CONFIG)).toBe(true)
    })
  })

  describe('expressionEngine interface', () => {
    it('should be implementable as a mock engine', () => {
      const mockEngine: ExpressionEngine = {
        name: 'mock',
        compile(expression: string): CompiledExpression {
          return { source: expression, compiled: null }
        },
        execute(compiled: CompiledExpression, context: ExpressionContext): unknown {
          return context.data[compiled.source]
        },
        validate(expression: string): ValidationResult {
          return expression
            ? { valid: true, errors: [] }
            : { valid: false, errors: [{ message: 'Empty expression' }] }
        },
      }

      expect(mockEngine.name).toBe('mock')

      const compiled = mockEngine.compile('price')
      expect(compiled.source).toBe('price')

      const ctx: ExpressionContext = {
        data: { price: 42 },
        helpers: {},
      }
      expect(mockEngine.execute(compiled, ctx)).toBe(42)

      expect(mockEngine.validate('price')).toEqual({ valid: true, errors: [] })
      expect(mockEngine.validate('')).toEqual({
        valid: false,
        errors: [{ message: 'Empty expression' }],
      })
    })
  })

  describe('validationError', () => {
    it('should support offset and length', () => {
      const error: ValidationError = {
        length: 3,
        message: 'Unexpected token',
        offset: 5,
      }
      expect(error.message).toBe('Unexpected token')
      expect(error.offset).toBe(5)
      expect(error.length).toBe(3)
    })

    it('should work with message only', () => {
      const error: ValidationError = { message: 'Syntax error' }
      expect(error.message).toBe('Syntax error')
      expect(error.offset).toBeUndefined()
      expect(error.length).toBeUndefined()
    })
  })

  describe('sandboxConfig', () => {
    it('should be constructable as a custom config', () => {
      const config: SandboxConfig = {
        allowedGlobals: ['Math'],
        disallowedSyntax: [],
        maxDepth: 5,
        timeout: 50,
      }
      expect(config.allowedGlobals).toEqual(['Math'])
      expect(config.timeout).toBe(50)
      expect(config.maxDepth).toBe(5)
    })
  })

  describe('expressionContext', () => {
    it('should support helpers with typed function signatures', () => {
      const ctx: ExpressionContext = {
        data: { total: 100 },
        helpers: {
          round: (v: unknown) => Math.round(v as number),
          sum: (...args: unknown[]) => (args as number[]).reduce((a, b) => a + b, 0),
        },
      }
      expect(ctx.helpers.round(3.7)).toBe(4)
      expect(ctx.helpers.sum(1, 2, 3)).toBe(6)
    })
  })
})
