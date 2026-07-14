import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { syncDocumentPresentation, VideoEditorWorkbench } from '../src/webview/app.js'
import type { EditorController } from '../src/webview/controller.js'
import { INITIAL_EDITOR_STATE, editorReducer, type EditorState } from '../src/webview/model.js'
import { makeArtifact, makeJob, makeSubtitleArtifact, makeViewProject } from './webview-fixtures.js'

describe('video editor docked workbench', () => {
  it('renders every editing region with accessible landmarks and supported boundaries', () => {
    const project = makeViewProject()
    const job = {
      ...makeJob('completed'),
      result: {
        schemaVersion: 1 as const,
        generatedArtifacts: [makeArtifact('job_12345678'), makeSubtitleArtifact('job_12345678')]
      }
    }
    const state = editorReducer(
      editorReducer(INITIAL_EDITOR_STATE, { type: 'initialized' }),
      { type: 'project', value: project }
    )
    const html = renderToStaticMarkup(<VideoEditorWorkbench controller={stubController({ ...state, jobs: [job] })} />)
    for (const label of ['Media library', 'Player', 'Transcript', 'Timeline', 'Inspector', 'Captions', 'Revisions', 'Preview and proof', 'Agent sync', 'Export jobs']) {
      expect(html).toContain(label)
    }
    expect(html).toContain('href="#video-editor-main"')
    expect(html).toContain('aria-live="polite"')
    expect(html).toContain('aria-label="Ordered timeline tracks"')
    for (const manualControl of ['Split at playhead', 'Apply trim', 'Move to track', 'Reorder', 'Add caption', 'Canvas and fit']) {
      expect(html).toContain(manualControl)
    }
    expect(html).toContain('does not perform arbitrary visual-scene understanding')
    expect(html).toContain('Technically validated by FFmpeg/ffprobe; not visually reviewed.')
    expect(html).toContain('Preview')
    expect(html).toContain('Open with system app')
    expect(html).toContain('Show in folder')
    expect(html).toContain('local path stays hidden from the extension View')
    expect(html).toContain('Edit with the main Kun Agent')
    expect(html).toContain('video-project · active')
    expect(html).not.toContain('Creative brief and review checkpoint')
  })

  it('renders explicit empty, interaction-required, reconnect and legacy-run states', () => {
    let state: EditorState = editorReducer(INITIAL_EDITOR_STATE, { type: 'initialized' })
    state = {
      ...state,
      connection: 'reconnecting',
      notices: [{ id: 'picker', severity: 'warning', message: 'Select a file', interactionRequired: true }]
    }
    const emptyHtml = renderToStaticMarkup(<VideoEditorWorkbench controller={stubController(state)} />)
    expect(emptyHtml).toContain('Create or open a project')
    expect(emptyHtml).toContain('A protected Kun desktop interaction is required.')

    const project = makeViewProject()
    const waitingState: EditorState = {
      ...editorReducer(state, { type: 'project', value: project }),
      jobs: [makeJob('running')],
      agentRun: {
        id: 'run-1',
        threadId: 'thread-1',
        ownerExtensionId: 'kun-examples.kun-video-editor',
        ownerExtensionVersion: '0.1.0',
        extensionVisibility: 'private',
        extensionBudget: {},
        toolCatalogEpoch: 'epoch-1',
        state: 'waiting-approval',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:01:00.000Z'
      }
    }
    const waitingHtml = renderToStaticMarkup(<VideoEditorWorkbench controller={stubController(waitingState)} />)
    expect(waitingHtml).toContain('Existing private run')
    expect(waitingHtml).toContain('Waiting for approval')
    expect(waitingHtml).toContain('Ready for main-Agent edits')
    expect(waitingHtml).toContain('Cancel job')
  })

  it('renders the workbench in Simplified Chinese and follows the Kun theme', () => {
    const project = makeViewProject()
    const initialized = editorReducer(
      editorReducer(INITIAL_EDITOR_STATE, { type: 'initialized' }),
      { type: 'project', value: project }
    )
    const state: EditorState = {
      ...initialized,
      theme: { kind: 'light', tokens: {}, zoomFactor: 1, reducedMotion: false },
      locale: { language: 'zh-CN', direction: 'ltr', messages: {} }
    }
    const html = renderToStaticMarkup(<VideoEditorWorkbench controller={stubController(state)} />)

    expect(html).toContain('data-theme="light"')
    expect(html).toContain('lang="zh-CN"')
    for (const label of ['Kun 视频剪辑', '媒体库', '播放器', '逐字稿', '时间线', '检查器', '字幕', '版本', '预览与校样', 'Agent 协作', '导出任务']) {
      expect(html).toContain(label)
    }
    for (const control of ['在播放头处拆分', '应用裁剪', '移动到轨道', '重新排序', '添加字幕', '画布与适配']) {
      expect(html).toContain(control)
    }
    expect(html).not.toContain('Transcript-first workbench')
    expect(html).not.toContain('Select a project')
  })

  it('propagates presentation state to the document root and keeps light colors theme-driven', () => {
    const documentRoot = { dataset: {}, dir: '', lang: '' } as unknown as Pick<HTMLElement, 'dataset' | 'dir' | 'lang'>
    syncDocumentPresentation(
      documentRoot,
      { kind: 'light', tokens: {}, zoomFactor: 1, reducedMotion: false },
      { language: 'zh-CN', direction: 'ltr', messages: {} }
    )

    expect(documentRoot.dataset.theme).toBe('light')
    expect(documentRoot.lang).toBe('zh-CN')
    expect(documentRoot.dir).toBe('ltr')

    const css = readFileSync(new URL('../src/webview/styles.css', import.meta.url), 'utf8')
    expect(css).toMatch(/:root\[data-theme="light"\],\s*\.editor-app\[data-theme="light"\]/u)
    expect(css).toMatch(/\.editor-app\s*\{[^}]*color: var\(--text\);[^}]*var\(--app-glow\)/su)
    expect(css).toContain('body { min-height: 100vh; overflow-x: hidden; background: var(--bg); color: var(--text); }')
    expect(css).not.toContain('#222b3c 0')
    expect(css).not.toContain('background: #0b0f16')
  })
})

function stubController(state: EditorState): EditorController {
  const asynchronous = vi.fn(async () => undefined)
  const synchronous = vi.fn()
  return {
    state,
    refreshAll: asynchronous,
    createProject: asynchronous,
    openProject: asynchronous,
    importMedia: asynchronous,
    openAsset: asynchronous,
    refreshActiveLease: asynchronous,
    recoverMedia: asynchronous,
    applyOperations: asynchronous,
    undo: asynchronous,
    redo: asynchronous,
    readScript: asynchronous,
    editScript: synchronous,
    applyScript: asynchronous,
    seek: synchronous,
    togglePlaying: synchronous,
    selectItem: synchronous,
    selectCaption: synchronous,
    setTranscriptWindow: synchronous,
    setTimelineWindow: synchronous,
    startAgent: asynchronous,
    steerAgent: asynchronous,
    cancelAgent: asynchronous,
    startRender: asynchronous,
    cancelJob: asynchronous,
    openArtifact: asynchronous,
    revealArtifact: asynchronous,
    dismissNotice: synchronous
  }
}
