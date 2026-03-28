import { ColorEditor } from './ColorEditor'
import { registerEditor } from './EditorRegistry'
import { NumberEditor } from './NumberEditor'
import { SelectEditor } from './SelectEditor'
import { SwitchEditor } from './SwitchEditor'
import { TextEditor } from './TextEditor'

export { ColorEditor } from './ColorEditor'
export { getEditor, hasEditor, registerEditor } from './EditorRegistry'
export { NumberEditor } from './NumberEditor'
export { SelectEditor } from './SelectEditor'
export { SwitchEditor } from './SwitchEditor'
export { TextEditor } from './TextEditor'

// 注册内置编辑器
registerEditor('color', ColorEditor)
registerEditor('number', NumberEditor)
registerEditor('select', SelectEditor)
registerEditor('switch', SwitchEditor)
registerEditor('text', TextEditor)
