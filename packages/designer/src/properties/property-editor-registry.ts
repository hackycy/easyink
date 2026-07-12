import type { Component } from 'vue'
import { markRaw } from 'vue'

export interface PropertyEditorRegistration {
  readonly id: string
  readonly ownerPackageId: string
  readonly component: Component
}

export class PropertyEditorRegistryError extends Error {
  constructor(readonly code: 'PROPERTY_EDITOR_ID_INVALID' | 'PROPERTY_EDITOR_DUPLICATE', id: string) {
    super(`${code}: ${id}`)
    this.name = 'PropertyEditorRegistryError'
  }
}

const ID_PATTERN = /^[a-z][a-z0-9-]*\/[a-z][a-z0-9-]*$/

/** Registry for package-owned property editor components. */
export class PropertyEditorRegistry {
  private readonly registrations = new Map<string, PropertyEditorRegistration>()

  register(input: PropertyEditorRegistration): () => void {
    if (!ID_PATTERN.test(input.id))
      throw new PropertyEditorRegistryError('PROPERTY_EDITOR_ID_INVALID', input.id)
    if (this.registrations.has(input.id))
      throw new PropertyEditorRegistryError('PROPERTY_EDITOR_DUPLICATE', input.id)
    const id = input.id
    const registration: PropertyEditorRegistration = Object.freeze({
      id,
      ownerPackageId: input.ownerPackageId,
      component: markRaw(input.component),
    })
    this.registrations.set(input.id, registration)
    return () => {
      if (this.registrations.get(id) !== registration)
        return
      this.registrations.delete(id)
    }
  }

  unregister(id: string, ownerPackageId: string): boolean {
    const current = this.registrations.get(id)
    if (!current || current.ownerPackageId !== ownerPackageId)
      return false
    this.registrations.delete(id)
    return true
  }

  get(id: string): Component | undefined {
    return this.registrations.get(id)?.component
  }

  getRegistration(id: string): PropertyEditorRegistration | undefined {
    return this.registrations.get(id)
  }

  list(): readonly PropertyEditorRegistration[] {
    return Object.freeze([...this.registrations.values()])
  }
}
