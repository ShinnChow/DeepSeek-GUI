import type { ExtensionHostClient, JsonValue, Locale, Theme } from '@kun/extension-api'
import { createElement } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { artifactUsesPlayer, useEditorController, type EditorController } from '../src/webview/controller.js'
import { makeArtifact, makeSubtitleArtifact } from './webview-fixtures.js'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true

let renderer: ReactTestRenderer | undefined

afterEach(async () => {
  if (!renderer) return
  await act(async () => renderer?.unmount())
  renderer = undefined
})

describe('video editor artifact controller integration', () => {
  it('keeps player media on leases and routes subtitle open/reveal through the trusted Host action', async () => {
    const openViewResource = vi.fn(async ({ handleId }: { handleId: string }) => ({
      leaseId: `lease_${handleId}`,
      handleId,
      url: `kun-media://lease/${handleId}`,
      mimeType: 'image/png',
      expiresAt: '2099-01-01T00:00:00.000Z'
    }))
    const performArtifactAction = vi.fn(async () => ({ performed: true as const }))
    const executeCommand = vi.fn(async (_id: string, args?: JsonValue) => {
      const action = isRecord(args) ? args.action : undefined
      if (action === 'project.list') return { content: { projects: [] } }
      return { content: {} }
    })
    const { client } = fakeClient({ openViewResource, performArtifactAction, executeCommand })
    let controller: EditorController | undefined

    await act(async () => {
      renderer = create(createElement(CaptureController, {
        client,
        capture: (value: EditorController) => { controller = value }
      }))
      await Promise.resolve()
      await Promise.resolve()
    })

    const proof = makeArtifact('job_12345678')
    const subtitle = makeSubtitleArtifact('job_12345678')
    expect(artifactUsesPlayer(proof)).toBe(true)
    expect(artifactUsesPlayer(subtitle)).toBe(false)

    await act(async () => controller!.openArtifact(proof))
    expect(openViewResource).toHaveBeenCalledWith({
      handleId: proof.mediaHandleId,
      contributionId: 'editor'
    })
    expect(performArtifactAction).not.toHaveBeenCalled()

    await act(async () => controller!.openArtifact(subtitle))
    await act(async () => controller!.revealArtifact(subtitle))
    expect(performArtifactAction).toHaveBeenNthCalledWith(1, {
      artifactId: subtitle.artifactId,
      action: 'open'
    })
    expect(performArtifactAction).toHaveBeenNthCalledWith(2, {
      artifactId: subtitle.artifactId,
      action: 'reveal'
    })
    expect(openViewResource).toHaveBeenCalledTimes(1)
    expect(executeCommand).not.toHaveBeenCalledWith('reveal-artifact', expect.anything())
  })

  it('keeps Kun theme and locale when project initialization fails', async () => {
    const executeCommand = vi.fn(async (_id: string, args?: JsonValue) => {
      const action = isRecord(args) ? args.action : undefined
      if (action === 'project.list') {
        await Promise.resolve()
        throw new Error('Extension operation failed')
      }
      return { content: {} }
    })
    const { client } = fakeClient({
      executeCommand,
      getTheme: async () => lightTheme(),
      getLocale: async () => zhLocale()
    })
    let controller: EditorController | undefined

    await act(async () => {
      renderer = create(createElement(CaptureController, {
        client,
        capture: (value: EditorController) => { controller = value }
      }))
      await flushAsync()
    })

    expect(controller?.state.initialized).toBe(true)
    expect(controller?.state.connection).toBe('offline')
    expect(controller?.state.theme?.kind).toBe('light')
    expect(controller?.state.locale?.language).toBe('zh-CN')
    expect(controller?.state.notices.at(-1)?.message).toBe('视频编辑器初始化失败。')
  })

  it('applies live Kun theme and language changes', async () => {
    const { client, emitTheme, emitLocale } = fakeClient()
    let controller: EditorController | undefined

    await act(async () => {
      renderer = create(createElement(CaptureController, {
        client,
        capture: (value: EditorController) => { controller = value }
      }))
      await flushAsync()
    })
    expect(controller?.state.theme?.kind).toBe('dark')
    expect(controller?.state.locale?.language).toBe('en')

    await act(async () => {
      emitTheme(lightTheme())
      emitLocale(zhLocale())
      await flushAsync()
    })

    expect(controller?.state.theme?.kind).toBe('light')
    expect(controller?.state.locale?.language).toBe('zh-CN')
  })

  it('does not let delayed initial values overwrite newer Kun events', async () => {
    let resolveTheme!: (value: Theme) => void
    let resolveLocale!: (value: Locale) => void
    const { client, emitTheme, emitLocale } = fakeClient({
      getTheme: () => new Promise<Theme>((resolve) => { resolveTheme = resolve }),
      getLocale: () => new Promise<Locale>((resolve) => { resolveLocale = resolve })
    })
    let controller: EditorController | undefined

    await act(async () => {
      renderer = create(createElement(CaptureController, {
        client,
        capture: (value: EditorController) => { controller = value }
      }))
      await flushAsync()
    })
    await act(async () => {
      emitTheme(lightTheme())
      emitLocale(zhLocale())
      resolveTheme(darkTheme())
      resolveLocale(enLocale())
      await flushAsync()
    })

    expect(controller?.state.theme?.kind).toBe('light')
    expect(controller?.state.locale?.language).toBe('zh-CN')
  })
})

function CaptureController(props: {
  client: ExtensionHostClient
  capture(controller: EditorController): void
}): null {
  props.capture(useEditorController(props.client))
  return null
}

function fakeClient(input: {
  openViewResource?: ReturnType<typeof vi.fn>
  performArtifactAction?: ReturnType<typeof vi.fn>
  executeCommand?: ReturnType<typeof vi.fn>
  getTheme?: () => Promise<Theme>
  getLocale?: () => Promise<Locale>
} = {}): {
  client: ExtensionHostClient
  emitTheme(value: Theme): void
  emitLocale(value: Locale): void
} {
  const themeListeners = new Set<(value: Theme) => void>()
  const localeListeners = new Set<(value: Locale) => void>()
  const event = () => ({ dispose: () => undefined })
  const executeCommand = input.executeCommand ?? vi.fn(async (_id: string, args?: JsonValue) => {
    const action = isRecord(args) ? args.action : undefined
    return action === 'project.list' ? { content: { projects: [] } } : { content: {} }
  })
  const client = {
    commands: { executeCommand },
    media: {
      openViewResource: input.openViewResource ?? vi.fn(),
      performArtifactAction: input.performArtifactAction ?? vi.fn(),
      release: vi.fn(async () => ({ released: true }))
    },
    jobs: {
      list: vi.fn(async () => ({ items: [] }))
    },
    agent: {},
    ui: {
      getTheme: vi.fn(input.getTheme ?? (async () => darkTheme())),
      getLocale: vi.fn(input.getLocale ?? (async () => enLocale())),
      getViewState: vi.fn(async () => undefined),
      setViewState: vi.fn(async () => undefined),
      onDidChangeTheme: (listener: (value: Theme) => void) => {
        themeListeners.add(listener)
        return { dispose: () => themeListeners.delete(listener) }
      },
      onDidChangeLocale: (listener: (value: Locale) => void) => {
        localeListeners.add(listener)
        return { dispose: () => localeListeners.delete(listener) }
      },
      onDidReceiveMessage: event
    },
    onDidError: event
  } as unknown as ExtensionHostClient
  return {
    client,
    emitTheme: (value) => { for (const listener of themeListeners) listener(value) },
    emitLocale: (value) => { for (const listener of localeListeners) listener(value) }
  }
}

function darkTheme(): Theme {
  return { kind: 'dark', tokens: {}, zoomFactor: 1, reducedMotion: false }
}

function lightTheme(): Theme {
  return { kind: 'light', tokens: {}, zoomFactor: 1, reducedMotion: false }
}

function enLocale(): Locale {
  return { language: 'en', direction: 'ltr', messages: {} }
}

function zhLocale(): Locale {
  return { language: 'zh-CN', direction: 'ltr', messages: {} }
}

async function flushAsync(): Promise<void> {
  for (let index = 0; index < 8; index += 1) await Promise.resolve()
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
