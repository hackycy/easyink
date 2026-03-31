import { describe, expect, it } from 'vitest'
import {
  barcodeMaterialType,
  builtinMaterialTypes,
  dataTableMaterialType,
  imageMaterialType,
  lineMaterialType,
  rectMaterialType,
  tableMaterialType,
  textMaterialType,
} from '../builtins'
import { MaterialRegistry } from '../registry'

describe('built-in element types', () => {
  describe('builtinMaterialTypes', () => {
    it('should contain exactly 7 built-in types', () => {
      expect(builtinMaterialTypes).toHaveLength(7)
    })

    it('should include all expected types', () => {
      const types = builtinMaterialTypes.map(d => d.type)

      expect(types).toContain('text')
      expect(types).toContain('image')
      expect(types).toContain('rect')
      expect(types).toContain('line')
      expect(types).toContain('table')
      expect(types).toContain('data-table')
      expect(types).toContain('barcode')
    })

    it('should all be registrable without error', () => {
      const registry = new MaterialRegistry()

      expect(() => registry.registerAll(builtinMaterialTypes)).not.toThrow()
      expect(registry.list()).toHaveLength(7)
    })

    it('should all have non-empty type and name', () => {
      for (const def of builtinMaterialTypes) {
        expect(def.type).toBeTruthy()
        expect(def.name).toBeTruthy()
        expect(def.icon).toBeTruthy()
      }
    })

    it('should all have defaultProps and defaultLayout', () => {
      for (const def of builtinMaterialTypes) {
        expect(def.defaultProps).toBeDefined()
        expect(def.defaultLayout).toBeDefined()
        expect(def.defaultLayout.position).toBeDefined()
      }
    })
  })

  describe('textMaterialType', () => {
    it('should have correct type and name', () => {
      expect(textMaterialType.type).toBe('text')
      expect(textMaterialType.name).toBe('文本')
    })

    it('should have content prop definition', () => {
      const contentProp = textMaterialType.propSchemas.find(p => p.key === 'content')

      expect(contentProp).toBeDefined()
      expect(contentProp!.type).toBe('string')
    })

    it('should default to absolute positioning', () => {
      expect(textMaterialType.defaultLayout.position).toBe('absolute')
    })

    it('should have default font style', () => {
      expect(textMaterialType.defaultStyle).toBeDefined()
      expect(textMaterialType.defaultStyle!.fontSize).toBe(14)
      expect(textMaterialType.defaultStyle!.color).toBe('#000000')
    })
  })

  describe('imageMaterialType', () => {
    it('should have correct type and name', () => {
      expect(imageMaterialType.type).toBe('image')
      expect(imageMaterialType.name).toBe('图片')
    })

    it('should have src and fit prop definitions', () => {
      const srcProp = imageMaterialType.propSchemas.find(p => p.key === 'src')
      const fitProp = imageMaterialType.propSchemas.find(p => p.key === 'fit')

      expect(srcProp).toBeDefined()
      expect(fitProp).toBeDefined()
      expect(fitProp!.defaultValue).toBe('contain')
    })
  })

  describe('rectMaterialType', () => {
    it('should have correct type and name', () => {
      expect(rectMaterialType.type).toBe('rect')
      expect(rectMaterialType.name).toBe('矩形')
    })

    it('should have borderRadius and fill props', () => {
      const radiusProp = rectMaterialType.propSchemas.find(p => p.key === 'borderRadius')
      const fillProp = rectMaterialType.propSchemas.find(p => p.key === 'fill')

      expect(radiusProp).toBeDefined()
      expect(fillProp).toBeDefined()
      expect(radiusProp!.defaultValue).toBe(0)
      expect(fillProp!.defaultValue).toBe('transparent')
    })
  })

  describe('lineMaterialType', () => {
    it('should have correct type and name', () => {
      expect(lineMaterialType.type).toBe('line')
      expect(lineMaterialType.name).toBe('线条')
    })

    it('should have direction and stroke props', () => {
      const directionProp = lineMaterialType.propSchemas.find(p => p.key === 'direction')
      const strokeWidthProp = lineMaterialType.propSchemas.find(p => p.key === 'strokeWidth')

      expect(directionProp).toBeDefined()
      expect(directionProp!.defaultValue).toBe('horizontal')
      expect(strokeWidthProp).toBeDefined()
    })

    it('should hide endX/endY props when direction is not custom', () => {
      const endXProp = lineMaterialType.propSchemas.find(p => p.key === 'endX')
      const endYProp = lineMaterialType.propSchemas.find(p => p.key === 'endY')

      expect(endXProp?.visible).toBeDefined()
      expect(endXProp!.visible!({ direction: 'horizontal' })).toBe(false)
      expect(endXProp!.visible!({ direction: 'custom' })).toBe(true)
      expect(endYProp!.visible!({ direction: 'custom' })).toBe(true)
    })
  })

  describe('tableMaterialType', () => {
    it('should have correct type and name', () => {
      expect(tableMaterialType.type).toBe('table')
      expect(tableMaterialType.name).toBe('表格')
    })

    it('should be in table category', () => {
      expect(tableMaterialType.category).toBe('table')
    })

    it('should not be a container and not support repeat', () => {
      expect(tableMaterialType.isContainer).toBe(false)
      expect(tableMaterialType.supportsRepeat).toBe(false)
    })

    it('should default to flow positioning', () => {
      expect(tableMaterialType.defaultLayout.position).toBe('flow')
    })

    it('should have default columns and rowCount', () => {
      expect(tableMaterialType.defaultProps.columns).toBeDefined()
      expect((tableMaterialType.defaultProps.columns as unknown[]).length).toBe(2)
      expect(tableMaterialType.defaultProps.rowCount).toBe(3)
      expect(tableMaterialType.defaultProps.cells).toEqual({})
    })

    it('should have bordered and borderStyle props', () => {
      const borderedProp = tableMaterialType.propSchemas.find(p => p.key === 'bordered')
      const borderStyleProp = tableMaterialType.propSchemas.find(p => p.key === 'borderStyle')

      expect(borderedProp).toBeDefined()
      expect(borderStyleProp).toBeDefined()
      expect(borderStyleProp!.defaultValue).toBe('solid')
    })
  })

  describe('dataTableMaterialType', () => {
    it('should have correct type and name', () => {
      expect(dataTableMaterialType.type).toBe('data-table')
      expect(dataTableMaterialType.name).toBe('数据表格')
    })

    it('should be in table category', () => {
      expect(dataTableMaterialType.category).toBe('table')
    })

    it('should be a container that supports repeat', () => {
      expect(dataTableMaterialType.isContainer).toBe(true)
      expect(dataTableMaterialType.supportsRepeat).toBe(true)
    })

    it('should default to flow positioning', () => {
      expect(dataTableMaterialType.defaultLayout.position).toBe('flow')
    })

    it('should default to empty columns array', () => {
      expect(dataTableMaterialType.defaultProps.columns).toEqual([])
    })

    it('should have showHeader prop defaulting to true', () => {
      expect(dataTableMaterialType.defaultProps.showHeader).toBe(true)
    })

    it('should not have emptyBehavior or summary props', () => {
      const emptyProp = dataTableMaterialType.propSchemas.find(p => p.key === 'emptyBehavior')
      const summaryProp = dataTableMaterialType.propSchemas.find(p => p.key === 'summary')
      expect(emptyProp).toBeUndefined()
      expect(summaryProp).toBeUndefined()
    })
  })

  describe('barcodeMaterialType', () => {
    it('should have correct type and name', () => {
      expect(barcodeMaterialType.type).toBe('barcode')
      expect(barcodeMaterialType.name).toBe('条形码')
    })

    it('should have format prop with all barcode formats', () => {
      const formatProp = barcodeMaterialType.propSchemas.find(p => p.key === 'format')

      expect(formatProp).toBeDefined()
      expect(formatProp!.defaultValue).toBe('CODE128')
      const values = formatProp!.enum!.map(e => e.value)
      expect(values).toContain('QR')
      expect(values).toContain('CODE128')
      expect(values).toContain('EAN13')
    })

    it('should hide errorCorrectionLevel when format is not QR', () => {
      const ecProp = barcodeMaterialType.propSchemas.find(p => p.key === 'errorCorrectionLevel')

      expect(ecProp?.visible).toBeDefined()
      expect(ecProp!.visible!({ format: 'CODE128' })).toBe(false)
      expect(ecProp!.visible!({ format: 'QR' })).toBe(true)
    })
  })
})
