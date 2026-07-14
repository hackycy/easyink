import type { ViewerElementTree, ViewerTextTree } from '@easyink/core'
import { createTestViewerRenderContext } from '@easyink/core/testing'
import { describe, expect, it } from 'vitest'
import { getRatingCharacterFills } from './rendering'
import { createRatingNode } from './schema'
import { renderRating } from './viewer'

describe('renderRating', () => {
  it('renders resolved value and characters semantically', () => {
    const tree = renderRating(createRatingNode({ model: { character: '<x>' } }), { resolvedModel: { value: 80 } } as never).tree as ViewerElementTree
    expect(tree.attributes['aria-label']).toBe('80/100')
    expect((tree.children[0] as ViewerElementTree).children[0]).toMatchObject({ kind: 'text', value: '<' } satisfies Partial<ViewerTextTree>)
  })

  it('calculates partial fills', () => {
    expect(getRatingCharacterFills(50, 5).map(item => item.fillPercent)).toEqual([100, 100, 50, 0, 0])
  })

  it('uses the CSS in unit for an inch document', () => {
    const context = createTestViewerRenderContext({ unit: 'inch' })
    const tree = renderRating(createRatingNode({}, 'inch'), context).tree as ViewerElementTree
    const character = tree.children[0] as ViewerElementTree

    expect(context.cssUnit).toBe('in')
    expect(character.style['font-size']).toMatch(/in$/)
    expect(JSON.stringify(tree)).not.toContain('inch')
  })
})
