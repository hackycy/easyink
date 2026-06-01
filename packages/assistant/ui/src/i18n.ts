export type AssistantTranslate = (key: string) => string

const fallbackMessages: Record<string, string> = {
  'designer.assistant.title': 'EasyInk Assistant',
  'designer.assistant.description': '描述你要的票据、标签或表单，确认后再应用到设计器。',
  'designer.assistant.toolbar.label': 'Assistant',
  'designer.assistant.dialog.label': 'EasyInk Assistant',
  'designer.assistant.action.close': '关闭',
  'designer.assistant.action.retry': '重试',
  'designer.assistant.action.apply': '应用到设计器',
  'designer.assistant.action.send': '发送',
  'designer.assistant.action.stop': '停止生成',
  'designer.assistant.action.reparseSource': '重新解析数据源',
  'designer.assistant.action.removeSource': '删除数据源',
  'designer.assistant.action.attachSourceHint': '粘贴 JSON、URL 或 curl 可自动识别数据源',
  'designer.assistant.placeholder.prompt': '帮我生成一张 80mm 小票',
  'designer.assistant.placeholder.clarification': '输入你的选择或补充信息',
  'designer.assistant.message.welcome': '你好，我可以帮你生成 EasyInk 模板。试试输入“帮我生成一张 80mm 小票”。',
  'designer.assistant.message.applied': '已应用到设计器。',
  'designer.assistant.message.cancelled': '已停止生成，你可以调整描述后重新发送。',
  'designer.assistant.card.errorTitle': '处理失败',
  'designer.assistant.card.clarificationTitle': '需要确认一下',
  'designer.assistant.card.summary': '分析摘要',
  'designer.assistant.card.doneTitle': '生成完成，可以应用',
  'designer.assistant.card.doneDescription': '已为你生成模板，确认后应用到设计器。',
  'designer.assistant.checklist.understand': '理解需求',
  'designer.assistant.checklist.data': '解析数据',
  'designer.assistant.checklist.layout': '规划版式',
  'designer.assistant.checklist.compose': '生成模板',
  'designer.assistant.checklist.validate': '校验结果',
  'designer.assistant.status.pending': '等待中',
  'designer.assistant.status.running': '执行中',
  'designer.assistant.status.done': '已完成',
  'designer.assistant.status.failed': '失败',
  'designer.assistant.source.json': 'JSON 数据源',
  'designer.assistant.source.curl': 'curl 接口',
  'designer.assistant.source.http': 'HTTP 接口',
  'designer.assistant.source.file': '文件数据源',
  'designer.assistant.progress.generating': '正在生成',
  'designer.assistant.progress.understand': '我在梳理票据目标和关键内容。',
  'designer.assistant.progress.data': '正在识别数据字段，准备放到合适位置。',
  'designer.assistant.progress.layout': '正在安排信息层级和版面节奏。',
  'designer.assistant.progress.compose': '正在生成可以直接应用的设计结果。',
  'designer.assistant.progress.validate': '正在做最后检查，尽量减少手动调整。',
  'designer.assistant.progress.started': '生成流程已开始，我会持续同步进度。',
  'designer.assistant.progress.needsClarification': '我需要再确认几个细节，避免生成方向跑偏。',
  'designer.assistant.progress.scenarioSuffix': '，继续细化模板结构。',
  'designer.assistant.progress.confirmedGoal': '已确认主要目标，开始安排版面。',
  'designer.assistant.progress.contract': '正在整理字段关系，确保内容能正确填入。',
  'designer.assistant.progress.skeleton': '正在搭出版面的主要区域。',
  'designer.assistant.progress.repair': '发现细节问题，正在自动修正。',
  'designer.assistant.progress.issueFound': '已发现问题：{error}',
  'designer.assistant.error.unauthorized': '请求未授权（HTTP 401），请检查登录状态或 Assistant 服务凭据后重试。',
}

export function translateAssistant(key: string, t?: AssistantTranslate): string {
  const translated = t?.(key)
  if (translated && translated !== key)
    return translated
  return fallbackMessages[key] ?? key
}

export function formatAssistantMessage(key: string, params: Record<string, string>, t?: AssistantTranslate): string {
  return translateAssistant(key, t).replace(/\{(\w+)\}/g, (_, name: string) => params[name] ?? '')
}
