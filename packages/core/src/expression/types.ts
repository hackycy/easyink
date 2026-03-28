/**
 * 编译后的表达式 — compile() 的返回值，结构由引擎实现自定义。
 * 核心只持有引用，不检查内部结构。
 */
export interface CompiledExpression {
  /** 原始表达式字符串 */
  readonly source: string
  /** 引擎自定义的编译产物（AST、函数引用等） */
  readonly compiled: unknown
}

/**
 * 表达式上下文 — 传递给 execute() 的沙箱化数据上下文
 */
export interface ExpressionContext {
  /** 数据源数据（标量 + 对象数组混合） */
  data: Record<string, unknown>
  /** 白名单工具函数（由引擎实现者控制可访问范围） */
  helpers: Record<string, (...args: unknown[]) => unknown>
}

/**
 * 表达式校验结果
 */
export interface ValidationResult {
  /** 是否有效 */
  valid: boolean
  /** 错误列表（valid 为 false 时） */
  errors: ValidationError[]
}

/**
 * 单条校验错误
 */
export interface ValidationError {
  /** 错误消息 */
  message: string
  /** 错误起始位置（字符偏移，可选） */
  offset?: number
  /** 错误长度（字符数，可选） */
  length?: number
}

/**
 * 沙箱配置 — 表达式引擎的安全约束
 */
export interface SandboxConfig {
  /** 允许访问的全局对象白名单 */
  allowedGlobals: string[]
  /** 禁止的语法结构（AST 节点类型名） */
  disallowedSyntax: string[]
  /** 最大执行时间（ms） */
  timeout: number
  /** 最大递归深度 */
  maxDepth: number
}

/** 默认沙箱配置 */
export const DEFAULT_SANDBOX_CONFIG: Readonly<SandboxConfig> = Object.freeze({
  allowedGlobals: ['Array', 'Date', 'JSON', 'Math', 'Number', 'Object', 'String'],
  disallowedSyntax: ['ArrowFunctionExpression', 'FunctionExpression', 'ImportExpression', 'NewExpression'],
  maxDepth: 10,
  timeout: 100,
})

/**
 * 表达式引擎接口 — 由插件实现
 *
 * 核心不内置表达式引擎。路径解析（`key` 取值 + `arrayKey.field` 点路径）
 * 由 DataResolver 负责。表达式引擎用于更复杂的动态计算场景，
 * 如 `price * quantity`、条件表达式等。
 *
 * @example
 * ```ts
 * const engine: ExpressionEngine = createMyExpressionEngine({ sandbox: DEFAULT_SANDBOX_CONFIG })
 * const compiled = engine.compile('price * quantity')
 * const result = engine.execute(compiled, { data: { price: 10, quantity: 3 }, helpers: {} })
 * // result === 30
 * ```
 */
export interface ExpressionEngine {
  /** 引擎标识 */
  readonly name: string

  /**
   * 编译表达式为可执行对象
   * @param expression - 表达式字符串，如 "price * quantity"
   * @returns 编译后的表达式
   * @throws 表达式语法错误时
   */
  compile: (expression: string) => CompiledExpression

  /**
   * 执行已编译的表达式
   * @param compiled - compile() 返回的编译结果
   * @param context - 沙箱化数据上下文
   * @returns 表达式求值结果
   */
  execute: (compiled: CompiledExpression, context: ExpressionContext) => unknown

  /**
   * 校验表达式语法（不执行）
   * @param expression - 表达式字符串
   * @returns 校验结果
   */
  validate: (expression: string) => ValidationResult
}
