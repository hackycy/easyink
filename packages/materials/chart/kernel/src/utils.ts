export function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value))
    return min
  return Math.min(max, Math.max(min, value))
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isNumericString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))
}
