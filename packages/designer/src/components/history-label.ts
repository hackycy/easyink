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
  if (/^clipboard\.(?:paste|duplicate)/.test(operationKind))
    return 'designer.history.addMaterial'
  if (/^(?:structure\.(?:insert|group)|context\.group)/.test(operationKind))
    return 'designer.history.addElementGroup'
  if (/^(?:structure\.(?:remove|ungroup)|context\.ungroup)/.test(operationKind))
    return 'designer.history.removeElementGroup'
  if (/^(?:property\.(?:binding|render)|datasource\.|drag\.bind)/.test(operationKind))
    return 'designer.history.bindField'
  if (/^(?:page\.|document\.|assistant\.)/.test(operationKind))
    return 'designer.history.updateDocument'
  if (/^(?:guide|toolbar\.guides)/.test(operationKind))
    return 'designer.history.updateGuides'
  if (/^toolbar\.(?:font|editor-state)/.test(operationKind))
    return 'designer.history.updateProps'
  return undefined
}
