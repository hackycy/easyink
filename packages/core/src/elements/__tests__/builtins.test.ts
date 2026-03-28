import { describe, expect, it } from 'vitest'
import {
  barcodeElementType,
  builtinElementTypes,
  imageElementType,
  lineElementType,
  rectElementType,
  tableElementType,
  textElementType,
} from '../builtins'
import { ElementRegistry } from '../registry'

describe('built-in element types', () => {
  describe('builtinElementTypes', () => {
    it('should contain exactly 6 built-in types', () => {
      expect(builtinElementTypes).toHaveLength(6)
    })

    it('should include all expected types', () => {
      const types = builtinElementTypes.map(d => d.type)

      expect(types).toContain('text')
      expect(types).toContain('image')
      expect(types).toContain('rect')
      expect(types).toContain('line')
      expect(types).toContain('table')
      expect(types).toContain('barcode')
    })

    it('should all be registrable without error', () => {
      const registry = new ElementRegistry()

      expect(() => registry.registerAll(builtinElementTypes)).not.toThrow()
      expect(registry.list()).toHaveLength(6)
    })

    it('should all have non-empty type and name', () => {
      for (const def of builtinElementTypes) {
        expect(def.type).toBeTruthy()
        expect(def.name).toBeTruthy()
        expect(def.icon).toBeTruthy()
      }
    })

    it('should all have defaultProps and defaultLayout', () => {
      for (const def of builtinElementTypes) {
        expect(def.defaultProps).toBeDefined()
        expect(def.defaultLayout).toBeDefined()
        expect(def.defaultLayout.position).toBeDefined()
      }
    })
  })

  describe('textElementType', () => {
    it('should have correct type and name', () => {
      expect(textElementType.type).toBe('text')
      expect(textElementType.name).toBe('文本')
    })

    it('should have content prop definition', () => {
      const contentProp = textElementType.propDefinitions.find(p => p.key === 'content')

      expect(contentProp).toBeDefined()
      expect(contentProp!.editor).toBe('text')
    })

    it('should default to absolute positioning', () => {
      expect(textElementType.defaultLayout.position).toBe('absolute')
    })

    it('should have default font style', () => {
      expect(textElementType.defaultStyle).toBeDefined()
      expect(textElementType.defaultStyle!.fontSize).toBe(14)
      expect(textElementType.defaultStyle!.color).toBe('#000000')
    })
  })

  describe('imageElementType', () => {
    it('should have correct type and name', () => {
      expect(imageElementType.type).toBe('image')
      expect(imageElementType.name).toBe('图片')
    })

    it('should have src and fit prop definitions', () => {
      const srcProp = imageElementType.propDefinitions.find(p => p.key === 'src')
      const fitProp = imageElementType.propDefinitions.find(p => p.key === 'fit')

      expect(srcProp).toBeDefined()
      expect(fitProp).toBeDefined()
      expect(fitProp!.defaultValue).toBe('contain')
    })
  })

  describe('rectElementType', () => {
    it('should have correct type and name', () => {
      expect(rectElementType.type).toBe('rect')
      expect(rectElementType.name).toBe('矩形')
    })

    it('should have borderRadius and fill props', () => {
      const radiusProp = rectElementType.propDefinitions.find(p => p.key === 'borderRadius')
      const fillProp = rectElementType.propDefinitions.find(p => p.key === 'fill')

      expect(radiusProp).toBeDefined()
      expect(fillProp).toBeDefined()
      expect(radiusProp!.defaultValue).toBe(0)
      expect(fillProp!.defaultValue).toBe('transparent')
    })
  })

  describe('lineElementType', () => {
    it('should have correct type and name', () => {
      expect(lineElementType.type).toBe('line')
      expect(lineElementType.name).toBe('线条')
    })

    it('should have direction and stroke props', () => {
      const directionProp = lineElementType.propDefinitions.find(p => p.key === 'direction')
      const strokeWidthProp = lineElementType.propDefinitions.find(p => p.key === 'strokeWidth')

      expect(directionProp).toBeDefined()
      expect(directionProp!.defaultValue).toBe('horizontal')
      expect(strokeWidthProp).toBeDefined()
    })

    it('should hide endX/endY props when direction is not custom', () => {
      const endXProp = lineElementType.propDefinitions.find(p => p.key === 'endX')
      const endYProp = lineElementType.propDefinitions.find(p => p.key === 'endY')

      expect(endXProp?.visible).toBeDefined()
      expect(endXProp!.visible!({ direction: 'horizontal' })).toBe(false)
      expect(endXProp!.visible!({ direction: 'custom' })).toBe(true)
      expect(endYProp!.visible!({ direction: 'custom' })).toBe(true)
    })
  })

  describe('tableElementType', () => {
    it('should have correct type and name', () => {
      expect(tableElementType.type).toBe('table')
      expect(tableElementType.name).toBe('表格')
    })

    it('should be a container that supports repeat', () => {
      expect(tableElementType.isContainer).toBe(true)
      expect(tableElementType.supportsRepeat).toBe(true)
    })

    it('should default to flow positioning', () => {
      expect(tableElementType.defaultLayout.position).toBe('flow')
    })

    it('should have emptyBehavior prop with conditional minRows visibility', () => {
      const emptyProp = tableElementType.propDefinitions.find(p => p.key === 'emptyBehavior')
      const minRowsProp = tableElementType.propDefinitions.find(p => p.key === 'minRows')

      expect(emptyProp).toBeDefined()
      expect(minRowsProp?.visible).toBeDefined()
      expect(minRowsProp!.visible!({ emptyBehavior: 'placeholder' })).toBe(false)
      expect(minRowsProp!.visible!({ emptyBehavior: 'min-rows' })).toBe(true)
    })

    it('should default to empty columns array', () => {
      expect(tableElementType.defaultProps.columns).toEqual([])
    })
  })

  describe('barcodeElementType', () => {
    it('should have correct type and name', () => {
      expect(barcodeElementType.type).toBe('barcode')
      expect(barcodeElementType.name).toBe('条形码')
    })

    it('should have format prop with all barcode formats', () => {
      const formatProp = barcodeElementType.propDefinitions.find(p => p.key === 'format')

      expect(formatProp).toBeDefined()
      expect(formatProp!.defaultValue).toBe('CODE128')
      const options = (formatProp!.editorOptions as { options: string[] }).options
      expect(options).toContain('QR')
      expect(options).toContain('CODE128')
      expect(options).toContain('EAN13')
    })

    it('should hide errorCorrectionLevel when format is not QR', () => {
      const ecProp = barcodeElementType.propDefinitions.find(p => p.key === 'errorCorrectionLevel')

      expect(ecProp?.visible).toBeDefined()
      expect(ecProp!.visible!({ format: 'CODE128' })).toBe(false)
      expect(ecProp!.visible!({ format: 'QR' })).toBe(true)
    })
  })
})
