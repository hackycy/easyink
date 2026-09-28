import { afterAll, beforeAll } from 'vitest'

export function installCanvasTextMeasurement(): void {
  const getContext = HTMLCanvasElement.prototype.getContext

  beforeAll(() => {
    HTMLCanvasElement.prototype.getContext = (() => ({
      font: '',
      measureText: (value: string) => ({ width: value.length * 10 }),
    } as unknown as CanvasRenderingContext2D)) as unknown as typeof HTMLCanvasElement.prototype.getContext
  })

  afterAll(() => {
    HTMLCanvasElement.prototype.getContext = getContext
  })
}
