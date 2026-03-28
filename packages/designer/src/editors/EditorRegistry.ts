import type { Component } from 'vue'

const registry = new Map<string, Component>()

export function registerEditor(name: string, component: Component): void {
  registry.set(name, component)
}

export function getEditor(name: string): Component | undefined {
  return registry.get(name)
}

export function hasEditor(name: string): boolean {
  return registry.has(name)
}
