const OPERATION_LABELS: Readonly<Record<string, string>> = {
  'material.insert': 'designer.history.addMaterial',
  'material.drop': 'designer.history.addMaterial',
  'drag.material': 'designer.history.addMaterial',
  'clipboard.delete': 'designer.history.removeMaterial',
  'clipboard.cut': 'designer.history.removeMaterial',
  'material.delete': 'designer.history.removeMaterial',
  'toolbar.align': 'designer.history.moveMaterial',
  'toolbar.distribute': 'designer.history.moveMaterial',
  'toolbar.layer-up': 'designer.history.updateGeometry',
  'toolbar.layer-down': 'designer.history.updateGeometry',
  'toolbar.group': 'designer.history.addElementGroup',
  'toolbar.ungroup': 'designer.history.removeElementGroup',
}

export function resolveHistoryOperationLabel(operationKind: string | undefined): string | undefined {
  if (!operationKind)
    return undefined
  const exact = OPERATION_LABELS[operationKind]
  if (exact)
    return exact
  if (/^(?:geometry|property\.geometry)\./.test(operationKind))
    return 'designer.history.updateGeometry'
  if (/^keyboard\./.test(operationKind))
    return 'designer.history.updateGeometry'
  if (/^clipboard\.(?:paste|duplicate)/.test(operationKind))
    return 'designer.history.addMaterial'
  if (/^structure\.insert/.test(operationKind))
    return 'designer.history.addMaterial'
  if (/^structure\.remove/.test(operationKind))
    return 'designer.history.removeMaterial'
  if (/^structure\.group|^context\.group/.test(operationKind))
    return 'designer.history.addElementGroup'
  if (/^(?:structure\.(?:remove|ungroup)|context\.ungroup)/.test(operationKind))
    return 'designer.history.removeElementGroup'
  if (/^(?:property\.(?:binding|render)|datasource\.|drag\.bind)/.test(operationKind))
    return 'designer.history.bindField'
  if (/^property\.image/.test(operationKind))
    return 'designer.history.updateProps'
  if (/^property\.editor-state|^material\.editor-state|^context\.editor-state/.test(operationKind))
    return 'designer.history.updateMeta'
  if (/^material\.property/.test(operationKind))
    return 'designer.history.updateProps'
  if (/^material\./.test(operationKind))
    return 'designer.history.updateProps'
  if (/^(?:page\.|document\.|assistant\.)/.test(operationKind))
    return 'designer.history.updateDocument'
  if (/^template\./.test(operationKind))
    return 'designer.history.importTemplate'
  if (/^extension\./.test(operationKind))
    return 'designer.history.updateDocument'
  if (/^(?:guide|toolbar\.guides)/.test(operationKind))
    return 'designer.history.updateGuides'
  if (/^toolbar\.(?:font|editor-state)/.test(operationKind))
    return 'designer.history.updateProps'
  if (/^toolbar\./.test(operationKind))
    return 'designer.history.updateDocument'
  if (/^context\.layer/.test(operationKind))
    return 'designer.history.updateGeometry'
  return undefined
}
