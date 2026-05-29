import { createMachine } from 'xstate'

export const assistantWorkbenchMachine = createMachine({
  id: 'easyinkAssistantWorkbench',
  initial: 'intake',
  states: {
    intake: {
      on: { SUBMIT: 'running' },
    },
    running: {
      on: {
        RESULT_READY: 'review',
        FAIL: 'failed',
        CANCEL: 'intake',
      },
    },
    review: {
      on: {
        APPLY: 'applying',
        SUBMIT: 'running',
      },
    },
    applying: {
      on: {
        DONE: 'done',
        FAIL: 'failed',
      },
    },
    done: {
      on: { SUBMIT: 'running' },
    },
    failed: {
      on: { SUBMIT: 'running' },
    },
  },
})
