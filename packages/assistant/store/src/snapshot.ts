import type { AssistantSnapshot } from './types'

export type NormalizedAssistantSnapshot = Omit<AssistantSnapshot, 'conversations'> & {
  conversations: NonNullable<AssistantSnapshot['conversations']>
}

export function createEmptySnapshot(): NormalizedAssistantSnapshot {
  return {
    schemaVersion: 2,
    tasks: [],
    runs: [],
    results: [],
    versions: [],
    events: [],
    projectionSnapshots: [],
    sourceSamples: [],
    conversations: [],
  }
}

export function normalizeSnapshot(snapshot: AssistantSnapshot): NormalizedAssistantSnapshot {
  return {
    schemaVersion: 2,
    tasks: clone(snapshot.tasks ?? []),
    runs: clone(snapshot.runs ?? []),
    results: clone(snapshot.results ?? []),
    versions: clone(snapshot.versions ?? []),
    events: clone(snapshot.events ?? []),
    projectionSnapshots: clone(snapshot.projectionSnapshots ?? []),
    sourceSamples: clone(snapshot.sourceSamples ?? []),
    conversations: clone(snapshot.conversations ?? []),
  }
}

export function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}
