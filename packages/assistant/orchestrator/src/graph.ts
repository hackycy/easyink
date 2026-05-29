import type { AssistantTaskInput, AssistantWorkflowStep } from '@easyink/assistant-capabilities'
import { Annotation, END, START, StateGraph } from '@langchain/langgraph'

export interface AssistantGraphState {
  input: AssistantTaskInput
  steps: AssistantWorkflowStep[]
}

const GraphState = Annotation.Root({
  input: Annotation<AssistantTaskInput>(),
  steps: Annotation<AssistantWorkflowStep[]>({
    reducer: (left, right) => [...left, ...right],
    default: () => [],
  }),
})

export function createAssistantWorkflowGraph() {
  return new StateGraph(GraphState)
    .addNode('intake', async () => ({ steps: ['intake' as const] }))
    .addNode('plan', async () => ({ steps: ['plan' as const] }))
    .addNode('source', async () => ({ steps: ['source' as const] }))
    .addNode('compose', async () => ({ steps: ['compose' as const] }))
    .addNode('validate', async () => ({ steps: ['validate' as const] }))
    .addNode('review', async () => ({ steps: ['review' as const] }))
    .addEdge(START, 'intake')
    .addEdge('intake', 'plan')
    .addEdge('plan', 'source')
    .addEdge('source', 'compose')
    .addEdge('compose', 'validate')
    .addEdge('validate', 'review')
    .addEdge('review', END)
    .compile()
}
