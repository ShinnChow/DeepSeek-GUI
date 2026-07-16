import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { UI_MODE_DEFAULT, UI_MODE_STORAGE_KEY } from '../lib/ui-mode'
import { useUiPluginStore } from './ui-plugin-store'

function createDomFixture(storedMode?: string) {
  const attributes = new Map<string, string>()
  const storage = new Map<string, string>()
  if (storedMode) storage.set(UI_MODE_STORAGE_KEY, storedMode)
  const createElement = vi.fn()
  const documentFixture = {
    documentElement: {
      setAttribute: (name: string, value: string) => attributes.set(name, value),
      removeAttribute: (name: string) => attributes.delete(name)
    },
    getElementById: vi.fn(() => null),
    createElement
  }
  const localStorage = {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value)
  }
  vi.stubGlobal('document', documentFixture)
  return { attributes, createElement, localStorage }
}

function resetStore(): void {
  useUiPluginStore.setState({
    uiMode: UI_MODE_DEFAULT,
    installed: [],
    activeRuntime: null,
    busy: false,
    initialized: false,
    lastError: null
  })
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

describe('UI plugin CDP theme activation', () => {
  beforeEach(() => {
    resetStore()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('deactivates the main-held CDP theme while initializing the default mode', async () => {
    const { attributes, createElement, localStorage } = createDomFixture()
    const deactivateUiPluginTheme = vi.fn(async () => ({ ok: true as const }))
    const listUiPlugins = vi.fn(async () => ({ plugins: [] }))
    vi.stubGlobal('window', {
      localStorage,
      kunGui: { deactivateUiPluginTheme, listUiPlugins }
    })

    await useUiPluginStore.getState().initUiPlugins()

    expect(deactivateUiPluginTheme).toHaveBeenCalledOnce()
    expect(useUiPluginStore.getState().uiMode).toBe(UI_MODE_DEFAULT)
    expect(attributes.has('data-ui-plugin')).toBe(false)
    expect(createElement).not.toHaveBeenCalled()
  })

  it('serializes activation and lets a newer request win without injecting renderer CSS', async () => {
    const { attributes, createElement, localStorage } = createDomFixture()
    const firstActivationResult = deferred<{
      ok: true
      manifest: { id: string; name: string; version: string; figures: {} }
      figures: {}
    }>()
    const activateUiPluginTheme = vi.fn((id: string) => {
      if (id === 'alpha-theme') return firstActivationResult.promise
      return Promise.resolve({
        ok: true as const,
        manifest: { id, name: id, version: '1.0.0', figures: {} },
        figures: {}
      })
    })
    vi.stubGlobal('window', {
      localStorage,
      kunGui: {
        activateUiPluginTheme,
        deactivateUiPluginTheme: vi.fn(async () => ({ ok: true as const }))
      }
    })

    const firstActivation = useUiPluginStore.getState().activateUiMode('alpha-theme')
    await vi.waitFor(() => expect(activateUiPluginTheme).toHaveBeenCalledWith('alpha-theme'))
    const secondActivation = useUiPluginStore.getState().activateUiMode('beta-theme')
    firstActivationResult.resolve({
      ok: true,
      manifest: { id: 'alpha-theme', name: 'Alpha', version: '1.0.0', figures: {} },
      figures: {}
    })
    await Promise.all([firstActivation, secondActivation])

    expect(activateUiPluginTheme).toHaveBeenCalledTimes(2)
    expect(activateUiPluginTheme.mock.calls.map(([id]) => id)).toEqual([
      'alpha-theme',
      'beta-theme'
    ])
    expect(useUiPluginStore.getState().uiMode).toBe('beta-theme')
    expect(attributes.get('data-ui-plugin')).toBe('beta-theme')
    expect(createElement).not.toHaveBeenCalled()
  })
})
