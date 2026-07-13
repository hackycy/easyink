import type { JsonValue } from '@easyink/shared'

export interface StableIdSelectionRegion<T extends JsonValue = JsonValue> {
  regionId: string
  itemIds: readonly string[]
  anchorId: string
  focusId: string
  data?: T
}

export function rebaseStableIdSelectionRegion<T extends JsonValue>(
  region: StableIdSelectionRegion<T>,
  exists: (itemId: string) => boolean,
): StableIdSelectionRegion<T> | null {
  const itemIds = region.itemIds.filter(exists)
  if (itemIds.length === 0)
    return null
  return {
    ...region,
    itemIds,
    anchorId: exists(region.anchorId) ? region.anchorId : itemIds[0]!,
    focusId: exists(region.focusId) ? region.focusId : itemIds[itemIds.length - 1]!,
  }
}
