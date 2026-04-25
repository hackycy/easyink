import type { InjectionKey } from 'vue'
import type { ContributionRegistry } from './contribution-registry'
import type { ContributionContext } from './types'

export interface ContributionInjection {
  registry: ContributionRegistry
  context: ContributionContext
}

export const CONTRIBUTION_REGISTRY_KEY: InjectionKey<ContributionInjection> = Symbol('EasyInkContributionRegistry')
