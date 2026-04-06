import type {
  CanvasViewportState,
  PanelToggleState,
  PreviewWorkbenchState,
  SaveBranchMenuState,
  SnapState,
  StatusBarState,
  TableEditingState,
  TemplateLibraryState,
  ToolbarLayoutState,
  WorkbenchState,
  WorkspaceWindowState,
} from '../types'

export function createDefaultWorkbenchState(): WorkbenchState {
  return {
    windows: createDefaultWindows(),
    toolbar: createDefaultToolbarLayout(),
    viewport: createDefaultViewport(),
    panels: createDefaultPanels(),
    preview: createDefaultPreview(),
    templateLibrary: createDefaultTemplateLibrary(),
    status: createDefaultStatus(),
    snap: createDefaultSnap(),
  }
}

function createDefaultWindows(): WorkspaceWindowState[] {
  return [
    {
      id: 'datasource',
      kind: 'datasource',
      visible: true,
      collapsed: false,
      x: 32,
      y: 32,
      width: 240,
      height: 400,
      zIndex: 10,
    },
    {
      id: 'properties',
      kind: 'properties',
      visible: true,
      collapsed: false,
      x: -1,
      y: 32,
      width: 280,
      height: 500,
      zIndex: 11,
    },
    {
      id: 'structure-tree',
      kind: 'structure-tree',
      visible: false,
      collapsed: false,
      x: -1,
      y: 520,
      width: 240,
      height: 300,
      zIndex: 12,
    },
    {
      id: 'history',
      kind: 'history',
      visible: false,
      collapsed: false,
      x: 260,
      y: 32,
      width: 240,
      height: 300,
      zIndex: 13,
    },
    {
      id: 'minimap',
      kind: 'minimap',
      visible: false,
      collapsed: false,
      x: -1,
      y: -1,
      width: 200,
      height: 160,
      zIndex: 14,
    },
    {
      id: 'toolbar-manager',
      kind: 'toolbar-manager',
      visible: false,
      collapsed: false,
      x: 32,
      y: 32,
      width: 240,
      height: 380,
      zIndex: 15,
    },
  ]
}

function createDefaultToolbarLayout(): ToolbarLayoutState {
  return {
    align: 'start',
    groups: [
      { id: 'undo-redo', hidden: false, hideDivider: false, order: 0 },
      { id: 'new-clear', hidden: false, hideDivider: false, order: 1 },
      { id: 'font', hidden: false, hideDivider: false, order: 2 },
      { id: 'rotation', hidden: false, hideDivider: false, order: 3 },
      { id: 'visibility', hidden: false, hideDivider: false, order: 4 },
      { id: 'select', hidden: false, hideDivider: false, order: 5 },
      { id: 'distribute', hidden: false, hideDivider: false, order: 6 },
      { id: 'align', hidden: false, hideDivider: false, order: 7 },
      { id: 'layer', hidden: false, hideDivider: false, order: 8 },
      { id: 'group', hidden: false, hideDivider: false, order: 9 },
      { id: 'lock', hidden: false, hideDivider: false, order: 10 },
      { id: 'clipboard', hidden: false, hideDivider: false, order: 11 },
      { id: 'snap', hidden: false, hideDivider: false, order: 12 },
    ],
  }
}

function createDefaultViewport(): CanvasViewportState {
  return {
    zoom: 1,
    scrollLeft: 0,
    scrollTop: 0,
  }
}

function createDefaultPanels(): PanelToggleState {
  return {
    dataSource: true,
    minimap: false,
    properties: true,
    structureTree: false,
    history: false,
    animation: false,
    assets: false,
    debug: false,
    draft: false,
  }
}

function createDefaultPreview(): PreviewWorkbenchState {
  return {
    visible: false,
  }
}

function createDefaultTemplateLibrary(): TemplateLibraryState {
  return {
    phase: 'closed',
    query: '',
    page: 1,
    pageSize: 20,
    backendMode: 'static-demo',
  }
}

function createDefaultStatus(): StatusBarState {
  return {
    focus: 'none',
    network: 'idle',
    draft: 'clean',
    autoSave: 'idle',
  }
}

export function createDefaultTableEditing(): TableEditingState {
  return { phase: 'idle' }
}

export function createDefaultSaveBranchMenu(): SaveBranchMenuState {
  return {
    open: false,
    autoSaveEnabled: false,
  }
}

function createDefaultSnap(): SnapState {
  return {
    enabled: true,
    gridSnap: true,
    guideSnap: true,
    elementSnap: true,
    threshold: 3,
    activeLines: [],
  }
}
