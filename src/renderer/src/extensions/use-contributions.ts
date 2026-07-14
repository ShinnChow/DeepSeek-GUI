import { useEffect, useSyncExternalStore } from 'react'
import type { AppRoute } from '../store/chat-store-types'
import {
  workbenchContributionRegistry,
  type RegisteredContribution,
  type WorkbenchContributionPoint
} from './contribution-registry'
import { extensionWorkbenchClient } from './extension-workbench-client'
import type { WorkbenchContext } from './when-expression'

export type ExtensionContributionLoadState =
  | { status: 'idle' }
  | { status: 'loading' | 'ready'; workspaceRoot: string }
  | { status: 'error'; workspaceRoot: string; message: string }

let contributionLoadState: ExtensionContributionLoadState = { status: 'idle' }
const contributionLoadListeners = new Set<() => void>()

function setContributionLoadState(next: ExtensionContributionLoadState): void {
  contributionLoadState = next
  for (const listener of contributionLoadListeners) listener()
}

export function useExtensionContributionLoadState(): ExtensionContributionLoadState {
  return useSyncExternalStore(
    (listener) => {
      contributionLoadListeners.add(listener)
      return () => contributionLoadListeners.delete(listener)
    },
    () => contributionLoadState,
    () => contributionLoadState
  )
}

export function isExtensionContributionSnapshotReady(
  state: ExtensionContributionLoadState,
  workspaceRoot: string
): boolean {
  return state.status === 'ready' && state.workspaceRoot === workspaceRoot
}

export function workbenchContextForRoute(
  route: AppRoute,
  workspaceRoot: string,
  extra: WorkbenchContext = {}
): WorkbenchContext {
  return {
    workspaceOpen: Boolean(workspaceRoot),
    'workbench.mode': route === 'chat' ? 'code' : route,
    'workbench.code': route === 'chat',
    'workbench.design': route === 'design',
    'workbench.write': route === 'write',
    'workbench.connect': route === 'claw',
    'workbench.settings': route === 'settings',
    ...extra
  }
}

export function useExtensionContributionBootstrap(
  workspaceRoot: string,
  refreshKey?: unknown
): ExtensionContributionLoadState {
  const state = useExtensionContributionLoadState()

  useEffect(() => {
    let cancelled = false
    const load = async (): Promise<void> => {
      setContributionLoadState({ status: 'loading', workspaceRoot })
      workbenchContributionRegistry.replaceExtensions({
        schemaVersion: 1,
        revision: 0,
        ...(workspaceRoot ? { workspaceRoot } : {}),
        extensions: []
      })
      try {
        const snapshot = await extensionWorkbenchClient.loadContributions(workspaceRoot || undefined)
        if (cancelled) return
        workbenchContributionRegistry.replaceExtensions(snapshot)
        setContributionLoadState({ status: 'ready', workspaceRoot })
      } catch (error) {
        if (cancelled) return
        // Older runtimes do not expose the endpoint. Built-ins remain usable,
        // and a later runtime-ready/change event retries discovery.
        setContributionLoadState({
          status: 'error',
          workspaceRoot,
          message: error instanceof Error ? error.message : String(error)
        })
      }
    }
    void load()
    const onChanged = (): void => void load()
    window.addEventListener('kun:extensions-changed', onChanged)
    return () => {
      cancelled = true
      window.removeEventListener('kun:extensions-changed', onChanged)
    }
  }, [refreshKey, workspaceRoot])

  return state
}

export function useWorkbenchContributions<K extends WorkbenchContributionPoint>(
  point: K,
  context: WorkbenchContext,
  ready = true
): RegisteredContribution<K>[] {
  useSyncExternalStore(
    workbenchContributionRegistry.subscribe,
    workbenchContributionRegistry.getRevision,
    workbenchContributionRegistry.getRevision
  )
  return ready ? workbenchContributionRegistry.list(point, context) : []
}
