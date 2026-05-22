import { describe, expect, it } from 'vitest'
import { resolvePageBackgroundStyle } from './page-background-style'

describe('page background style', () => {
  it('falls back to a white page background', () => {
    expect(resolvePageBackgroundStyle(undefined, 'mm')).toEqual({
      backgroundColor: '#fff',
    })
  })

  it('maps page background image settings to canvas CSS', () => {
    expect(resolvePageBackgroundStyle({
      color: '#ffeeaa',
      image: 'https://example.com/bg image.png',
      repeat: 'repeat-x',
      width: 120,
      offsetY: 8,
    }, 'mm')).toEqual({
      backgroundColor: '#ffeeaa',
      backgroundImage: 'url("https://example.com/bg image.png")',
      backgroundRepeat: 'repeat-x',
      backgroundSize: '120mm auto',
      backgroundPosition: '0mm 8mm',
    })
  })

  it('stretches full-page backgrounds to the paper frame', () => {
    expect(resolvePageBackgroundStyle({
      image: 'data:image/png;base64,abc',
      repeat: 'full',
    }, 'px')).toEqual({
      backgroundColor: '#fff',
      backgroundImage: 'url("data:image/png;base64,abc")',
      backgroundRepeat: 'no-repeat',
      backgroundSize: '100% 100%',
    })
  })
})
