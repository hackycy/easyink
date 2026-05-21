export function formatPageNumberDisplay(format: string, current: number, total: number): string {
  return (format || '{current}/{total}')
    .replace(/\{current\}/g, String(current))
    .replace(/\{total\}/g, String(total))
}
