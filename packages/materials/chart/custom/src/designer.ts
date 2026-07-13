import type { DatasourceDropHandler, MaterialDesignerExtension, MaterialExtensionContext } from '@easyink/core'
import type { BindingRef, MaterialNode } from '@easyink/schema'
import type { ChartCustomProps } from './schema'
import { createTransactionOperationDescriptor } from '@easyink/core'
import { createChartDesignerRenderHost, mountFullECharts } from '@easyink/material-chart-kernel/full'
import { getBindingRefs, getNodeModel } from '@easyink/schema'
import { resolveChartCustomOption, resolveChartCustomProps } from './options'

export function createChartCustomExtension(context: MaterialExtensionContext): MaterialDesignerExtension {
  return {
    renderContent(nodeSignal, container) {
      container.replaceChildren()
      const { chartEl } = createChartDesignerRenderHost(container)

      const initialNode = nodeSignal.get()
      const unit = context.getSchema().unit
      const mount = mountFullECharts(chartEl, createDesignerOption(initialNode, unit))
      const unsubscribe = nodeSignal.subscribe((node) => {
        mount.update(createDesignerOption(node, unit))
      })

      return () => {
        unsubscribe()
        mount.dispose()
        container.replaceChildren()
      }
    },
    datasourceDrop: createDatasourceDropHandler(context),
  }
}

function createDesignerOption(node: MaterialNode, unit: string) {
  const props = resolveChartCustomProps(getNodeModel<ChartCustomProps>(node))
  return resolveChartCustomOption(props, {
    data: {},
    boundOption: props.option,
    hasBinding: getBindingRefs(node.bindings.value).length > 0,
    node,
    width: node.width,
    height: node.height,
    unit,
  }).option
}

function createDatasourceDropHandler(context: MaterialExtensionContext): DatasourceDropHandler {
  return {
    onDragOver(_field, _point, node) {
      return {
        status: 'accepted',
        rect: { x: 0, y: 0, w: node.width, h: node.height },
        label: context.t('materials.chartCustom.datasource.bindOption'),
      }
    },
    onDrop(field, _point, node) {
      const binding = createBinding(field)
      context.tx.run<MaterialNode>(node.id, (draft) => {
        draft.bindings.value = binding
      }, { label: 'designer.history.bindField', operation: createTransactionOperationDescriptor(context.tx, { kind: 'chart.binding', targetIds: [`node:${node.id}`], fieldPaths: ['/bindings/value'], structural: false }) })
    },
  }
}

function createBinding(field: {
  sourceId: string
  sourceName?: string
  sourceTag?: string
  path?: string
  fieldPath?: string
  key?: string
  fieldKey?: string
  title?: string
  fieldLabel?: string
  tag?: string
  format?: BindingRef['format']
}): BindingRef {
  return {
    sourceId: field.sourceId,
    sourceName: field.sourceName,
    sourceTag: field.sourceTag,
    fieldPath: field.fieldPath ?? field.path ?? field.key ?? '',
    fieldKey: field.fieldKey ?? field.key,
    fieldLabel: field.fieldLabel ?? field.title,
    format: field.format,
  }
}
