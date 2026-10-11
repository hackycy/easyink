import type { ViewerOptions } from '../types'
import { materials } from '@easyink/builtin/all/viewer'
import { createViewer } from '../index'

export function createBuiltinViewer(options: ViewerOptions = {}) {
  return createViewer({ ...options, materials })
}
