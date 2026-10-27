export type DeepReadonly<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends object ? { readonly [K in keyof T]: DeepReadonly<T[K]> } : T

export type Dispose = () => void | Promise<void>

/** Framework-owned lifetime; implementations register resources as they acquire them. */
export interface ResourceContext {
  readonly signal: AbortSignal
  readonly onDispose: (dispose: Dispose) => void
}
