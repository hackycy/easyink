import { describe, expect, it } from 'vitest'
import {
  applyMatrixToPoint,
  IDENTITY_MATRIX,
  invertMatrix,
  matrixToNodeGeometry,
  multiplyMatrix,
  nodeLocalMatrix,
} from './matrix-chain'
import { createTestCompiledMaterialProfile } from './testing/material-profile'

describe('matrix chain', () => {
  it('provides an immutable identity transform', () => {
    expect(IDENTITY_MATRIX).toEqual({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 })
    expect(Object.isFrozen(IDENTITY_MATRIX)).toBe(true)
  })

  it('round-trips a point through a center-origin rotated node matrix', () => {
    const node = createTestCompiledMaterialProfile().createNode('box', {
      id: 'n',
      x: 20,
      y: 30,
      width: 10,
      height: 20,
      rotation: 90,
    })
    const matrix = nodeLocalMatrix(node)
    const point = { x: 2, y: 3 }
    const world = applyMatrixToPoint(matrix, point)
    const local = applyMatrixToPoint(invertMatrix(matrix), world)

    expect(world).toEqual({ x: 32, y: 37 })
    expect(local.x).toBeCloseTo(point.x)
    expect(local.y).toBeCloseTo(point.y)
  })

  it('multiplies parent before child', () => {
    const parent = { a: 1, b: 0, c: 0, d: 1, e: 10, f: 0 }
    const child = { a: 1, b: 0, c: 0, d: 1, e: 5, f: 0 }

    expect(applyMatrixToPoint(multiplyMatrix(parent, child), { x: 0, y: 0 }))
      .toEqual({ x: 15, y: 0 })
  })

  it('decomposes positive orthogonal scale into node dimensions around the transformed center', () => {
    expect(matrixToNodeGeometry(
      { a: 0, b: 0.5, c: -0.25, d: 0, e: 10, f: 20 },
      20,
      40,
    )).toEqual({ x: 0, y: 20, width: 10, height: 10, rotation: 90 })
  })

  it('normalizes negative zero and insignificant floating-point noise', () => {
    const geometry = matrixToNodeGeometry(
      { a: Math.cos(Math.PI / 2), b: 1, c: -1, d: Math.cos(Math.PI / 2), e: 10, f: 0 },
      10,
      10,
    )

    expect(geometry).toEqual({ x: 0, y: 0, width: 10, height: 10, rotation: 90 })
    expect(Object.is(geometry.x, -0)).toBe(false)
    expect(Object.is(geometry.y, -0)).toBe(false)
  })

  it('rejects singular, shear, and reflection transforms', () => {
    expect(() => invertMatrix({ a: 1, b: 0, c: 0, d: Number.EPSILON, e: 0, f: 0 }))
      .toThrow(/singular/)
    expect(() => matrixToNodeGeometry({ a: 0, b: 0, c: 0, d: 1, e: 0, f: 0 }, 10, 10))
      .toThrow(/singular/)
    expect(() => matrixToNodeGeometry({ a: 1, b: 0, c: 0.2, d: 1, e: 0, f: 0 }, 10, 10))
      .toThrow(/shear/)
    expect(() => matrixToNodeGeometry({ a: -1, b: 0, c: 0, d: 1, e: 0, f: 0 }, 10, 10))
      .toThrow(/reflection/)
  })

  it('rejects non-finite matrix, point, node, and geometry inputs', () => {
    expect(() => multiplyMatrix(
      { ...IDENTITY_MATRIX, e: Number.NaN },
      IDENTITY_MATRIX,
    )).toThrow(/finite/)
    expect(() => invertMatrix({ ...IDENTITY_MATRIX, a: Number.POSITIVE_INFINITY })).toThrow(/finite/)
    expect(() => applyMatrixToPoint(IDENTITY_MATRIX, { x: Number.NaN, y: 0 })).toThrow(/finite/)

    const node = createTestCompiledMaterialProfile().createNode('box', {
      id: 'n',
      x: 0,
      y: 0,
      width: 10,
      height: 10,
    })
    node.rotation = Number.NaN
    expect(() => nodeLocalMatrix(node)).toThrow(/finite/)
    expect(() => matrixToNodeGeometry(IDENTITY_MATRIX, Number.POSITIVE_INFINITY, 10)).toThrow(/finite/)
  })
})
