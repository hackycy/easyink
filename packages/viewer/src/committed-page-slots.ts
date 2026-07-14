export interface CommittedPageSlotRegistry {
  readonly size: number
  readonly clear: () => void
  readonly get: (pageIndex: number) => HTMLElement | undefined
  readonly register: (pageIndex: number, slot: HTMLElement) => void
}

export function createCommittedPageSlotRegistry(): CommittedPageSlotRegistry {
  const slots = new Map<number, HTMLElement>()
  return Object.freeze({
    get size() {
      return slots.size
    },
    clear() {
      slots.clear()
    },
    get(pageIndex: number) {
      return slots.get(pageIndex)
    },
    register(pageIndex: number, slot: HTMLElement) {
      if (!Number.isSafeInteger(pageIndex) || pageIndex < 0)
        throw new Error('VIEWER_PAGE_SLOT_INDEX_INVALID')
      if (slots.has(pageIndex))
        throw new Error('VIEWER_PAGE_SLOT_INDEX_DUPLICATE')
      slots.set(pageIndex, slot)
    },
  })
}
