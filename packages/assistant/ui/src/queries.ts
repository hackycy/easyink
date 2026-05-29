import type { MaybeRefOrGetter } from 'vue'
import type { AssistantApiClient } from './api'
import { computed, toValue } from 'vue'

export function createAssistantTaskQueryOptions(api: AssistantApiClient, taskId: MaybeRefOrGetter<string | undefined>) {
  return {
    queryKey: computed(() => ['easyink-assistant-task', toValue(taskId)]),
    queryFn: () => api.getTask(toValue(taskId)!),
    enabled: computed(() => !!toValue(taskId)),
    refetchInterval: 900,
  }
}
