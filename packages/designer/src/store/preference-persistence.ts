import type {
  PanelToggleState,
  PreferenceProvider,
  WorkbenchState,
  WorkspaceWindowState,
} from '../types'

const WORKBENCH_KEY = 'workbench'

// ─── Persistable subset ──────────────────────────────────────────

export interface PersistableWorkbenchState {
  windows?: Array<Pick<WorkspaceWindowState, 'id' | 'visible' | 'collapsed' | 'x' | 'y' | 'width' | 'height' | 'zIndex'>>
  toolbar?: {
    align: 'start' | 'center' | 'end'
    groups: Array<{ id: string, hidden: boolean, hideDivider: boolean, order: number }>
  }
  panels?: Partial<PanelToggleState>
  viewport?: { zoom: number }
  snap?: {
    enabled?: boolean
    gridSnap?: boolean
    guideSnap?: boolean
    elementSnap?: boolean
    threshold?: number
  }
}

// ─── Extract ─────────────────────────────────────────────────────

export function extractPersistableWorkbench(state: WorkbenchState): PersistableWorkbenchState {
  return {
    windows: state.windows.map(w => ({
      id: w.id,
      visible: w.visible,
      collapsed: w.collapsed,
      x: w.x,
      y: w.y,
      width: w.width,
      height: w.height,
      zIndex: w.zIndex,
    })),
    toolbar: {
      align: state.toolbar.align,
      groups: state.toolbar.groups.map(g => ({
        id: g.id,
        hidden: g.hidden,
        hideDivider: g.hideDivider,
        order: g.order,
      })),
    },
    panels: { ...state.panels },
    viewport: { zoom: state.viewport.zoom },
    snap: {
      enabled: state.snap.enabled,
      gridSnap: state.snap.gridSnap,
      guideSnap: state.snap.guideSnap,
      elementSnap: state.snap.elementSnap,
      threshold: state.snap.threshold,
    },
  }
}

// ─── Load / Save ─────────────────────────────────────────────────

export function loadWorkbenchPreferences(provider: PreferenceProvider): PersistableWorkbenchState | null {
  try {
    const raw = provider.get(WORKBENCH_KEY)
    if (raw && typeof raw === 'object') {
      return raw as PersistableWorkbenchState
    }
  }
  catch (err) {
    console.warn('[easyink] failed to load workbench preferences', err)
  }
  return null
}

export function saveWorkbenchPreferences(provider: PreferenceProvider, state: WorkbenchState): void {
  try {
    provider.set(WORKBENCH_KEY, extractPersistableWorkbench(state))
  }
  catch (err) {
    console.warn('[easyink] failed to save workbench preferences', err)
  }
}

// ─── Merge persisted state onto defaults ─────────────────────────

export function applyPersistedWorkbench(workbench: WorkbenchState, persisted: PersistableWorkbenchState): void {
  // Windows: merge by id, keep defaults for unknown windows, drop stale
  if (Array.isArray(persisted.windows)) {
    const savedMap = new Map(persisted.windows.map(w => [w.id, w]))
    for (const win of workbench.windows) {
      const saved = savedMap.get(win.id)
      if (saved) {
        win.visible = saved.visible
        win.collapsed = saved.collapsed
        win.x = saved.x
        win.y = saved.y
        win.width = saved.width
        win.height = saved.height
        win.zIndex = saved.zIndex
      }
    }
  }

  // Toolbar: merge groups by id
  if (persisted.toolbar) {
    workbench.toolbar.align = persisted.toolbar.align
    if (Array.isArray(persisted.toolbar.groups)) {
      const savedGroupMap = new Map(persisted.toolbar.groups.map(g => [g.id, g]))
      for (const group of workbench.toolbar.groups) {
        const saved = savedGroupMap.get(group.id)
        if (saved) {
          group.hidden = saved.hidden
          group.hideDivider = saved.hideDivider
          group.order = saved.order
        }
      }
    }
  }

  // Panels: merge known keys only
  if (persisted.panels) {
    for (const key of Object.keys(workbench.panels) as Array<keyof PanelToggleState>) {
      if (typeof persisted.panels[key] === 'boolean') {
        workbench.panels[key] = persisted.panels[key]
      }
    }
  }

  // Viewport: zoom only
  if (persisted.viewport && typeof persisted.viewport.zoom === 'number') {
    workbench.viewport.zoom = persisted.viewport.zoom
  }

  // Snap: persisted settings only (active feedback lines live on the store as a ShallowRef).
  if (persisted.snap) {
    const boolKeys = ['enabled', 'gridSnap', 'guideSnap', 'elementSnap'] as const
    for (const key of boolKeys) {
      if (typeof persisted.snap[key] === 'boolean') {
        workbench.snap[key] = persisted.snap[key]
      }
    }
    if (typeof persisted.snap.threshold === 'number') {
      workbench.snap.threshold = persisted.snap.threshold
    }
  }
}

// ─── Default localStorage provider ──────────────────────────────

export function createLocalStoragePreferenceProvider(namespace = 'easyink'): PreferenceProvider {
  return {
    get(key: string): unknown {
      try {
        const raw = localStorage.getItem(`${namespace}:${key}`)
        return raw ? JSON.parse(raw) : null
      }
      catch {
        return null
      }
    },
    set(key: string, value: unknown): void {
      try {
        localStorage.setItem(`${namespace}:${key}`, JSON.stringify(value))
      }
      catch {
        // Silently ignore quota exceeded or other storage errors
      }
    },
  }
}
