export function createReadonlyMap<K, V>(source: ReadonlyMap<K, V>): ReadonlyMap<K, V> {
  const contents = new Map(source)
  const view: ReadonlyMap<K, V> = Object.freeze({
    [Symbol.toStringTag]: 'ReadonlyMap',
    get size() { return contents.size },
    has: (key: K) => contents.has(key),
    get: (key: K) => contents.get(key),
    entries: () => contents.entries(),
    keys: () => contents.keys(),
    values: () => contents.values(),
    forEach: (callback: (value: V, key: K, map: ReadonlyMap<K, V>) => void, thisArg?: unknown) => {
      contents.forEach((value, key) => callback.call(thisArg, value, key, view))
    },
    [Symbol.iterator]: () => contents[Symbol.iterator](),
  })
  return view
}
