import type { MaterialNode } from '@easyink/schema'
import type { Point } from './geometry'

export interface Matrix2D {
  a: number
  b: number
  c: number
  d: number
  e: number
  f: number
}

export const IDENTITY_MATRIX: Matrix2D = Object.freeze({
  a: 1,
  b: 0,
  c: 0,
  d: 1,
  e: 0,
  f: 0,
})

const ORTHOGONAL_EPSILON = 1e-8
const ZERO_EPSILON = 1e-12

export function multiplyMatrix(left: Matrix2D, right: Matrix2D): Matrix2D {
  assertFiniteMatrix(left)
  assertFiniteMatrix(right)

  return finiteMatrix({
    a: left.a * right.a + left.c * right.b,
    b: left.b * right.a + left.d * right.b,
    c: left.a * right.c + left.c * right.d,
    d: left.b * right.c + left.d * right.d,
    e: left.a * right.e + left.c * right.f + left.e,
    f: left.b * right.e + left.d * right.f + left.f,
  })
}

export function invertMatrix(matrix: Matrix2D): Matrix2D {
  assertFiniteMatrix(matrix)
  const determinant = matrix.a * matrix.d - matrix.b * matrix.c
  if (!Number.isFinite(determinant) || Math.abs(determinant) <= Number.EPSILON)
    throw new Error('Cannot invert a singular transform matrix')

  return finiteMatrix({
    a: matrix.d / determinant,
    b: -matrix.b / determinant,
    c: -matrix.c / determinant,
    d: matrix.a / determinant,
    e: (matrix.c * matrix.f - matrix.d * matrix.e) / determinant,
    f: (matrix.b * matrix.e - matrix.a * matrix.f) / determinant,
  })
}

export function applyMatrixToPoint(matrix: Matrix2D, point: Point): Point {
  assertFiniteMatrix(matrix)
  assertFiniteValues('Matrix point coordinates', point.x, point.y)

  const result = {
    x: matrix.a * point.x + matrix.c * point.y + matrix.e,
    y: matrix.b * point.x + matrix.d * point.y + matrix.f,
  }
  assertFiniteValues('Transformed point coordinates', result.x, result.y)
  return result
}

export function nodeLocalMatrix(node: MaterialNode): Matrix2D {
  const rotation = node.rotation ?? 0
  assertFiniteValues(
    'Node geometry',
    node.x,
    node.y,
    node.width,
    node.height,
    rotation,
  )

  const radians = (rotation * Math.PI) / 180
  const cos = normalizeFloating(Math.cos(radians))
  const sin = normalizeFloating(Math.sin(radians))
  const cx = node.width / 2
  const cy = node.height / 2
  return finiteMatrix({
    a: cos,
    b: sin,
    c: -sin,
    d: cos,
    e: node.x + cx - cos * cx + sin * cy,
    f: node.y + cy - sin * cx - cos * cy,
  })
}

export function matrixToNodeGeometry(matrix: Matrix2D, width: number, height: number) {
  assertFiniteMatrix(matrix)
  assertFiniteValues('Node dimensions', width, height)

  const scaleX = Math.hypot(matrix.a, matrix.b)
  const scaleY = Math.hypot(matrix.c, matrix.d)
  if (scaleX <= Number.EPSILON || scaleY <= Number.EPSILON)
    throw new Error('Reparent transform is singular')

  const determinant = matrix.a * matrix.d - matrix.b * matrix.c
  if (!Number.isFinite(determinant) || Math.abs(determinant) <= Number.EPSILON)
    throw new Error('Reparent transform is singular')
  if (determinant < 0)
    throw new Error('Reparent transform reflection cannot be represented by common node geometry')

  const dot = matrix.a * matrix.c + matrix.b * matrix.d
  if (Math.abs(dot / (scaleX * scaleY)) > ORTHOGONAL_EPSILON)
    throw new Error('Reparent transform shear cannot be represented by common node geometry')

  const rotation = Math.atan2(matrix.b, matrix.a) * 180 / Math.PI
  const nextWidth = width * scaleX
  const nextHeight = height * scaleY
  const transformedCenter = applyMatrixToPoint(matrix, { x: width / 2, y: height / 2 })
  assertFiniteValues('Transformed node geometry', nextWidth, nextHeight)

  return {
    x: normalizeFloating(transformedCenter.x - nextWidth / 2),
    y: normalizeFloating(transformedCenter.y - nextHeight / 2),
    width: normalizeFloating(nextWidth),
    height: normalizeFloating(nextHeight),
    rotation: normalizeFloating(rotation),
  }
}

function assertFiniteMatrix(matrix: Matrix2D): void {
  assertFiniteValues(
    'Matrix components',
    matrix.a,
    matrix.b,
    matrix.c,
    matrix.d,
    matrix.e,
    matrix.f,
  )
}

function finiteMatrix(matrix: Matrix2D): Matrix2D {
  assertFiniteMatrix(matrix)
  return matrix
}

function assertFiniteValues(label: string, ...values: number[]): void {
  if (values.some(value => !Number.isFinite(value)))
    throw new Error(`${label} must be finite numbers`)
}

function normalizeFloating(value: number): number {
  if (Math.abs(value) <= ZERO_EPSILON)
    return 0
  return value
}
