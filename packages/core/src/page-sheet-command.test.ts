import type { DocumentSchema } from '@easyink/schema'
import { describe, expect, it } from 'vitest'
import { CommandManager } from './command'
import { AddPageSheetCommand, RemovePageSheetCommand } from './commands/document'
import { createEditorSurfacePlan } from './editor-surface-plan'

describe('page sheet commands', () => {
  it('inserts a fixed sheet and keeps page count fields synchronized', () => {
    const schema = fixedSchema()
    const commands = new CommandManager()

    commands.execute(new AddPageSheetCommand(schema, createEditorSurfacePlan(schema), 0))

    expect(schema.page.pages).toBe(3)
    expect(schema.page.pagination?.pageCount).toBe(3)
    expect(schema.elements.find(el => el.id === 'second')?.y).toBe(210)

    commands.undo()

    expect(schema.page.pages).toBe(2)
    expect(schema.page.pagination?.pageCount).toBe(2)
    expect(schema.elements.find(el => el.id === 'second')?.y).toBe(110)
  })

  it('removes a target sheet, deletes intersecting elements, and shifts following sheets', () => {
    const schema = fixedSchema()
    schema.page.pages = 3
    schema.page.pagination = { strategy: 'fixed-sheets', pageCount: 3 }
    schema.elements.push({ id: 'third', type: 'text', x: 0, y: 210, width: 10, height: 10, props: {} })
    const commands = new CommandManager()

    commands.execute(new RemovePageSheetCommand(schema, createEditorSurfacePlan(schema), 1))

    expect(schema.page.pages).toBe(2)
    expect(schema.page.pagination?.pageCount).toBe(2)
    expect(schema.elements.map(el => el.id)).toEqual(['first', 'third'])
    expect(schema.elements.find(el => el.id === 'third')?.y).toBe(110)

    commands.undo()

    expect(schema.page.pages).toBe(3)
    expect(schema.page.pagination?.pageCount).toBe(3)
    expect(schema.elements.map(el => el.id)).toEqual(['first', 'second', 'third'])
    expect(schema.elements.find(el => el.id === 'third')?.y).toBe(210)
  })
})

function fixedSchema(): DocumentSchema {
  return {
    version: '1.0.0',
    unit: 'mm',
    page: {
      mode: 'fixed',
      width: 100,
      height: 100,
      pages: 2,
      pageModel: { kind: 'paged-paper', paper: { width: 100, height: 100 } },
      layout: { strategy: 'absolute' },
      pagination: { strategy: 'fixed-sheets', pageCount: 2 },
      reflow: { strategy: 'measure-only' },
    },
    guides: { x: [], y: [] },
    elements: [
      { id: 'first', type: 'text', x: 0, y: 10, width: 10, height: 10, props: {} },
      { id: 'second', type: 'text', x: 0, y: 110, width: 10, height: 10, props: {} },
    ],
  }
}
