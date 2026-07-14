import type { GeneratedArtifact, JobSnapshot } from '@kun/extension-api'
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type PropsWithChildren,
  type ReactNode
} from 'react'
import { artifactUsesPlayer, artifactsForJobs, type EditorController } from './controller.js'
import { formatMessage, messagesFor, type Messages } from './i18n.js'
import {
  VIEW_LIMITS,
  activeTranscriptSegment,
  frameToSeconds,
  proofIsStale,
  type CaptionProjection,
  type EditorState,
  type ItemProjection,
  type ProjectProjection,
  type RenderTicket,
  type TimelineOperation,
  type TrackProjection
} from './model.js'

export type VideoEditorWorkbenchProps = {
  controller: EditorController
}

export function VideoEditorWorkbench({ controller }: VideoEditorWorkbenchProps): React.JSX.Element {
  const { state } = controller
  const messages = useMemo(() => messagesFor(state.locale), [state.locale])
  const alertRef = useRef<HTMLDivElement>(null)
  const project = state.project
  const selectedItem = project?.items.find(({ id }) => id === state.selectedItemId)
  const selectedCaption = project?.captions.find(({ id }) => id === state.selectedCaptionId)
  const artifacts = useMemo(() => artifactsForJobs(state.jobs), [state.jobs])
  const activeArtifact = artifacts.find(({ mediaHandleId }) => mediaHandleId === state.activeMediaHandleId)
  const activeAsset = project?.assets.find(({ mediaHandleId }) => mediaHandleId === state.activeMediaHandleId)

  useEffect(() => {
    if (state.notices.at(-1)?.severity === 'error') alertRef.current?.focus()
  }, [state.notices])

  useEffect(() => {
    syncDocumentPresentation(document.documentElement, state.theme, state.locale)
    document.title = messages.appName
  }, [messages.appName, state.locale, state.theme])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const target = event.target
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return
      if (event.key === ' ' && project) {
        event.preventDefault()
        controller.togglePlaying()
      } else if (event.key.toLowerCase() === 's' && selectedItem && project) {
        event.preventDefault()
        void splitAtPlayhead(controller, project, selectedItem, messages)
      } else if ((event.key === 'Delete' || event.key === 'Backspace') && selectedItem) {
        event.preventDefault()
        if (window.confirm(messages.deleteItemConfirm)) {
          void controller.applyOperations(
            [{ type: 'delete-item', itemId: selectedItem.id }],
            formatMessage(messages.deleteSummary, { id: selectedItem.id })
          )
        }
      } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        void (event.shiftKey ? controller.redo() : controller.undo())
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [controller, messages, project, selectedItem])

  return (
    <div
      className="editor-app"
      data-theme={state.theme?.kind ?? 'dark'}
      data-reduced-motion={state.theme?.reducedMotion ? 'true' : 'false'}
      dir={state.locale?.direction ?? 'ltr'}
      lang={state.locale?.language ?? 'en'}
    >
      <a className="skip-link" href="#video-editor-main">{messages.skipEditor}</a>
      <ProjectBar controller={controller} messages={messages} />
      <div className="notice-stack" aria-live="polite" aria-relevant="additions">
        {state.connection === 'reconnecting' && <StatusNotice severity="warning">{messages.reconnecting}</StatusNotice>}
        {state.conflict && <StatusNotice severity="warning">{messages.conflict}</StatusNotice>}
        {state.notices.map((notice, index) => (
          <div
            className={`notice notice-${notice.severity}`}
            key={notice.id}
            role={notice.severity === 'error' ? 'alert' : 'status'}
            tabIndex={notice.severity === 'error' && index === state.notices.length - 1 ? -1 : undefined}
            ref={notice.severity === 'error' && index === state.notices.length - 1 ? alertRef : undefined}
          >
            <span>{notice.message}</span>
            {notice.interactionRequired && <strong>{messages.interactionRequired}</strong>}
            <button type="button" className="quiet-button" onClick={() => controller.dismissNotice(notice.id)}>
              {messages.dismiss}
            </button>
          </div>
        ))}
      </div>

      {!state.initialized ? (
        <main className="center-state" aria-busy="true"><Spinner /> {messages.loadingEditor}</main>
      ) : !project ? (
        <EmptyProject controller={controller} messages={messages} />
      ) : (
        <main id="video-editor-main" className="workbench" aria-label={messages.appName} aria-busy={state.busy}>
          <aside className="left-column" aria-label={messages.sourceMaterial}>
            <MediaLibrary controller={controller} messages={messages} />
            <TranscriptPanel controller={controller} messages={messages} />
          </aside>

          <section className="center-column" aria-label={messages.editCanvas}>
            <Panel title={messages.player} className="player-panel" actions={
              <span className="subtle">{formatTime(frameToSeconds(project, state.playheadFrame))} / {formatTime(frameToSeconds(project, project.durationFrames))}</span>
            }>
              <MediaPlayer
                url={state.activeMediaUrl}
                kind={activeArtifact?.mediaKind ?? activeAsset?.kind}
                title={activeArtifact?.displayName ?? activeAsset?.name}
                project={project}
                playheadFrame={state.playheadFrame}
                playing={state.playing}
                onSeek={controller.seek}
                onPlaybackChange={(playing) => playing !== state.playing && controller.togglePlaying()}
                onResourceError={() => void controller.refreshActiveLease()}
                messages={messages}
              />
              <PlayerControls controller={controller} project={project} messages={messages} />
            </Panel>
            <TimelinePanel controller={controller} messages={messages} />
          </section>

          <aside className="right-column" aria-label={messages.inspectorAndAgent}>
            <InspectorPanel controller={controller} item={selectedItem} caption={selectedCaption} messages={messages} />
            <AgentSyncPanel controller={controller} messages={messages} />
          </aside>

          <section className="bottom-strip" aria-label={messages.projectOutputAndHistory}>
            <CaptionPanel controller={controller} messages={messages} />
            <RevisionPanel controller={controller} messages={messages} />
            <PreviewPanel controller={controller} artifacts={artifacts} messages={messages} />
            <ExportPanel controller={controller} messages={messages} />
          </section>
        </main>
      )}

      <footer className="editor-footer">
        <span>{messages.localOnly}</span>
        <span>{messages.keyboardHelp}</span>
      </footer>
    </div>
  )
}

export function syncDocumentPresentation(
  documentRoot: Pick<HTMLElement, 'dataset' | 'dir' | 'lang'>,
  theme: EditorState['theme'],
  locale: EditorState['locale']
): void {
  documentRoot.dataset.theme = theme?.kind ?? 'dark'
  documentRoot.lang = locale?.language ?? 'en'
  documentRoot.dir = locale?.direction ?? 'ltr'
}

function ProjectBar({ controller, messages }: { controller: EditorController; messages: Messages }): React.JSX.Element {
  const { state } = controller
  const [name, setName] = useState(messages.untitledInterview)
  const previousDefaultName = useRef(messages.untitledInterview)
  const [preset, setPreset] = useState<'16:9' | '9:16' | '1:1'>('16:9')
  useEffect(() => {
    setName((current) => current === previousDefaultName.current ? messages.untitledInterview : current)
    previousDefaultName.current = messages.untitledInterview
  }, [messages.untitledInterview])
  const create = (event: FormEvent): void => {
    event.preventDefault()
    void controller.createProject(name, preset)
  }
  return (
    <header className="project-bar">
      <div className="brand-block">
        <span className="brand-mark" aria-hidden="true">K</span>
        <div><strong>{messages.appName}</strong><small>{messages.workbenchSubtitle}</small></div>
      </div>
      <nav className="project-controls" aria-label={messages.projects}>
        <label>
          <span>{messages.projects}</span>
          <select
            value={state.project?.id ?? ''}
            onChange={(event) => event.target.value && void controller.openProject(event.target.value)}
            disabled={state.busy}
          >
            <option value="">{messages.selectProject}</option>
            {state.projects.map((project) => <option key={project.id} value={project.id}>{project.name} · r{project.currentRevision}</option>)}
          </select>
        </label>
        <form className="new-project-form" onSubmit={create}>
          <label><span>{messages.projectName}</span><input value={name} maxLength={160} onChange={(event) => setName(event.target.value)} required /></label>
          <label><span>{messages.canvas}</span><select value={preset} onChange={(event) => setPreset(event.target.value as typeof preset)}>
            <option value="16:9">16:9</option><option value="9:16">9:16</option><option value="1:1">1:1</option>
          </select></label>
          <button type="submit" disabled={state.busy}>{messages.createProject}</button>
        </form>
      </nav>
      <div className="project-actions">
        <span className={`connection connection-${state.connection}`}>{connectionLabel(messages, state.connection)}</span>
        {state.project && <span className="revision-badge">r{state.project.currentRevision}</span>}
        <button type="button" onClick={() => void controller.importMedia()} disabled={!state.project || state.busy}>{messages.importMedia}</button>
        <button type="button" onClick={() => void controller.undo()} disabled={!(state.project?.canUndo ?? Boolean(state.project && state.project.currentRevision > 0)) || state.busy}>{messages.undo}</button>
        <button type="button" onClick={() => void controller.redo()} disabled={!(state.project?.canRedo ?? Boolean(state.project && state.project.currentRevision > 0)) || state.busy}>{messages.redo}</button>
        <button type="button" className="quiet-button" onClick={() => void controller.refreshAll()} disabled={state.busy}>{messages.refresh}</button>
      </div>
    </header>
  )
}

function EmptyProject({ controller, messages }: { controller: EditorController; messages: Messages }): React.JSX.Element {
  return (
    <main id="video-editor-main" className="empty-project">
      <div className="empty-illustration" aria-hidden="true"><span>01:24</span><i /><i /><i /></div>
      <div>
        <p className="eyebrow">{messages.localFirstEditing}</p>
        <h1>{messages.emptyProjectTitle}</h1>
        <p>{messages.noProject}</p>
        <p className="boundary-note">{messages.unsupported}</p>
        <div className="button-row">
          {controller.state.projects.slice(0, 3).map((project) => (
            <button type="button" key={project.id} onClick={() => void controller.openProject(project.id)}>
              {formatMessage(messages.openProject, { name: project.name })}
            </button>
          ))}
        </div>
      </div>
    </main>
  )
}

function MediaLibrary({ controller, messages }: { controller: EditorController; messages: Messages }): React.JSX.Element {
  const project = controller.state.project!
  const assets = project.assets.slice(0, VIEW_LIMITS.virtualWindow)
  return (
    <Panel title={messages.mediaLibrary} actions={<button type="button" className="quiet-button" onClick={() => void controller.importMedia()}>{messages.importMedia}</button>}>
      {assets.length === 0 ? <EmptyState>{messages.noMedia}</EmptyState> : (
        <ul className="media-list" aria-label={messages.importedMedia}>
          {assets.map((asset) => {
            const revoked = Boolean(asset.mediaHandleId && controller.state.revokedHandles.includes(asset.mediaHandleId))
            return (
              <li key={asset.id}>
                <button
                  type="button"
                  className={controller.state.selectedAssetId === asset.id ? 'selected media-card' : 'media-card'}
                  onClick={() => void controller.openAsset(asset.id)}
                  aria-pressed={controller.state.selectedAssetId === asset.id}
                >
                  <span className={`media-kind media-kind-${asset.kind}`}>{asset.kind === 'video' ? messages.videoAbbreviation : messages.audioAbbreviation}</span>
                  <span><strong>{asset.name}</strong><small>{formatTime(asset.durationUs / 1_000_000)} · {asset.container}</small></span>
                  {revoked && <em>{messages.reauthorize}</em>}
                </button>
              </li>
            )
          })}
        </ul>
      )}
      {project.assets.length > assets.length && (
        <p className="subtle">{formatMessage(messages.boundedAssets, { visible: assets.length, total: project.assets.length })}</p>
      )}
    </Panel>
  )
}

function TranscriptPanel({ controller, messages }: { controller: EditorController; messages: Messages }): React.JSX.Element {
  const { state } = controller
  const project = state.project!
  const transcripts = state.selectedAssetId
    ? project.transcripts.filter(({ assetId }) => assetId === state.selectedAssetId)
    : project.transcripts
  const segments = transcripts.flatMap((transcript) => transcript.segments.map((segment) => ({ ...segment, assetId: transcript.assetId })))
  const start = Math.min(state.transcriptWindowStart, Math.max(0, segments.length - 1))
  const visible = segments.slice(start, start + VIEW_LIMITS.virtualWindow)
  const active = activeTranscriptSegment(project, state.selectedAssetId, state.playheadFrame)
  return (
    <Panel title={messages.transcript} actions={<VirtualControls start={start} total={segments.length} onChange={controller.setTranscriptWindow} messages={messages} />}>
      {segments.length === 0 ? <EmptyState>{messages.noTranscript}</EmptyState> : (
        <ol className="transcript-list" start={start + 1} aria-label={messages.timedTranscriptSegments}>
          {visible.map((segment) => (
            <li key={`${segment.assetId}:${segment.id}`}>
              <button
                type="button"
                className={active?.id === segment.id ? 'transcript-segment active' : 'transcript-segment'}
                aria-current={active?.id === segment.id ? 'true' : undefined}
                onClick={() => controller.seek(segmentTimelineFrame(project, segment.assetId, segment.startUs))}
              >
                <time>{formatTime(segment.startUs / 1_000_000)}</time>
                <span>{segment.text}</span>
                {segment.tags?.map((tag) => <em key={tag}>{tag}</em>)}
              </button>
            </li>
          ))}
        </ol>
      )}
      <p className="boundary-note">{messages.transcriptEvidenceBoundary}</p>
      <ScriptReview controller={controller} messages={messages} />
    </Panel>
  )
}

function ScriptReview({ controller, messages }: { controller: EditorController; messages: Messages }): React.JSX.Element {
  const script = controller.state.script
  const [ranges, setRanges] = useState('[]')
  const apply = (): void => {
    try {
      const parsed: unknown = JSON.parse(ranges)
      if (!Array.isArray(parsed)) throw new Error(messages.rangesRequired)
      void controller.applyScript(parsed as Array<{ assetId: string; startUs: number; endUs: number; reason?: 'filler' | 'silence' | 'selection' }>)
    } catch {
      // Keep validation local and non-destructive; the button is paired with
      // explanatory helper text and Host validation remains authoritative.
    }
  }
  return (
    <details className="script-review">
      <summary>{messages.readScript}</summary>
      {!script ? (
        <button type="button" onClick={() => void controller.readScript()}>{messages.readScript}</button>
      ) : (
        <div className="field-stack">
          <span className="subtle">{messages.revisionLabel} {script.revision} · {messages.digestLabel} {script.digest.slice(0, 12) || messages.unavailable}{script.dirty ? ` · ${messages.edited}` : ''}</span>
          <label><span>{messages.revisionBoundTimeline}</span><textarea rows={12} value={script.markdown} onChange={(event) => controller.editScript(event.target.value)} /></label>
          <label><span>{messages.explicitSourceRanges} (JSON)</span><textarea rows={4} value={ranges} onChange={(event) => setRanges(event.target.value)} aria-describedby="range-help" /></label>
          <small id="range-help">{messages.example}: [{`{"assetId":"asset-1","startUs":1000000,"endUs":1300000,"reason":"filler"}`}]</small>
          <div className="button-row"><button type="button" onClick={apply} disabled={controller.state.busy}>{messages.apply}</button><button type="button" className="quiet-button" onClick={() => void controller.readScript()}>{messages.reload}</button></div>
        </div>
      )}
    </details>
  )
}

function MediaPlayer(props: {
  url?: string
  kind?: string
  title?: string
  project: ProjectProjection
  playheadFrame: number
  playing: boolean
  onSeek(frame: number): void
  onPlaybackChange(playing: boolean): void
  onResourceError(): void
  messages: Messages
}): React.JSX.Element {
  const mediaRef = useRef<HTMLMediaElement | null>(null)
  const seconds = frameToSeconds(props.project, props.playheadFrame)
  useEffect(() => {
    const media = mediaRef.current
    if (media && Math.abs(media.currentTime - seconds) > 0.2) media.currentTime = seconds
  }, [props.url, seconds])
  useEffect(() => {
    const media = mediaRef.current
    if (!media) return
    if (props.playing) void media.play().catch(() => props.onPlaybackChange(false))
    else media.pause()
  }, [props.playing, props.url])
  const bind = (element: HTMLMediaElement | null): void => { mediaRef.current = element }
  const update = (): void => {
    const media = mediaRef.current
    if (media) props.onSeek(Math.round(media.currentTime * props.project.fps.numerator / props.project.fps.denominator))
  }
  if (!props.url) {
    return <div className={`player-stage aspect-${props.project.canvas.preset.replace(':', '-')}`}><EmptyState>{props.messages.selectMediaPreview}</EmptyState></div>
  }
  if (props.kind === 'image') {
    return <div className={`player-stage aspect-${props.project.canvas.preset.replace(':', '-')}`}><img src={props.url} alt={props.title ? `${props.messages.proofFrame}: ${props.title}` : props.messages.generatedProofFrame} onError={props.onResourceError} /></div>
  }
  if (props.kind === 'audio') {
    return <div className="player-stage audio-stage"><div className="audio-visual" aria-hidden="true">{props.messages.audioAbbreviation}</div><audio ref={bind} src={props.url} controls onTimeUpdate={update} onPlay={() => props.onPlaybackChange(true)} onPause={() => props.onPlaybackChange(false)} onError={props.onResourceError} aria-label={props.title ?? props.messages.audioPreview} /></div>
  }
  return <div className={`player-stage aspect-${props.project.canvas.preset.replace(':', '-')}`}><video ref={bind} src={props.url} controls playsInline onTimeUpdate={update} onPlay={() => props.onPlaybackChange(true)} onPause={() => props.onPlaybackChange(false)} onError={props.onResourceError} aria-label={props.title ?? props.messages.videoPreview} /></div>
}

function PlayerControls({ controller, project, messages }: { controller: EditorController; project: ProjectProjection; messages: Messages }): React.JSX.Element {
  return (
    <div className="transport" aria-label={messages.playerControls}>
      <button type="button" onClick={() => controller.seek(Math.max(0, controller.state.playheadFrame - Math.round(project.fps.numerator / project.fps.denominator * 5)))}>-5s</button>
      <button type="button" className="primary-transport" onClick={controller.togglePlaying}>{controller.state.playing ? messages.pause : messages.play}</button>
      <button type="button" onClick={() => controller.seek(Math.min(project.durationFrames, controller.state.playheadFrame + Math.round(project.fps.numerator / project.fps.denominator * 5)))}>+5s</button>
      <label className="scrubber"><span>{messages.timelinePosition}</span><input type="range" min={0} max={Math.max(1, project.durationFrames)} value={controller.state.playheadFrame} onChange={(event) => controller.seek(Number(event.target.value))} /></label>
      <output>{controller.state.playheadFrame}f</output>
    </div>
  )
}

function TimelinePanel({ controller, messages }: { controller: EditorController; messages: Messages }): React.JSX.Element {
  const { state } = controller
  const project = state.project!
  const ordered = [...project.items].sort((left, right) => left.timelineStartFrame - right.timelineStartFrame || left.id.localeCompare(right.id))
  const start = Math.min(state.timelineWindowStart, Math.max(0, ordered.length - 1))
  const visibleIds = new Set(ordered.slice(start, start + VIEW_LIMITS.virtualWindow).map(({ id }) => id))
  return (
    <Panel title={messages.timeline} className="timeline-panel" actions={<VirtualControls start={start} total={ordered.length} onChange={controller.setTimelineWindow} messages={messages} />}>
      <div className="timeline-ruler" aria-hidden="true"><span>00:00</span><span>25%</span><span>50%</span><span>75%</span><span>{formatTime(frameToSeconds(project, project.durationFrames))}</span></div>
      <div className="tracks" role="list" aria-label={messages.orderedTimelineTracks}>
        {[...project.tracks].sort((a, b) => a.order - b.order).map((track) => (
          <div className="track-row" role="listitem" key={track.id}>
            <div className="track-header"><strong>{track.name}</strong><small>{trackKindLabel(messages, track.kind)}{track.locked ? ` · ${messages.locked}` : ''}</small></div>
            <div className={`track-lane track-${track.kind}`} aria-label={`${track.name} · ${formatMessage(messages.trackItems, { count: project.items.filter((item) => item.trackId === track.id).length })}`}>
              {project.items.filter((item) => item.trackId === track.id && visibleIds.has(item.id)).map((item) => (
                <button
                  type="button"
                  key={item.id}
                  className={state.selectedItemId === item.id ? 'clip selected' : 'clip'}
                  data-duration={durationBand(item.durationFrames, project.durationFrames)}
                  aria-pressed={state.selectedItemId === item.id}
                  onClick={() => { controller.selectItem(item.id); controller.seek(item.timelineStartFrame) }}
                >
                  <strong>{project.assets.find(({ id }) => id === item.assetId)?.name ?? item.assetId}</strong>
                  <small>{item.timelineStartFrame}–{item.timelineStartFrame + item.durationFrames}f</small>
                </button>
              ))}
              {track.kind === 'caption' && project.captions.slice(0, VIEW_LIMITS.virtualWindow).map((caption) => (
                <button type="button" key={caption.id} className={state.selectedCaptionId === caption.id ? 'clip caption-clip selected' : 'clip caption-clip'} onClick={() => { controller.selectCaption(caption.id); controller.seek(caption.startFrame) }}>{caption.text}<small>{caption.startFrame}–{caption.endFrame}f</small></button>
              ))}
              {!project.items.some((item) => item.trackId === track.id) && track.kind !== 'caption' && <span className="empty-lane">{messages.dropImportMedia}</span>}
            </div>
          </div>
        ))}
      </div>
      <EditToolbar controller={controller} project={project} messages={messages} />
    </Panel>
  )
}

function EditToolbar({ controller, project, messages }: { controller: EditorController; project: ProjectProjection; messages: Messages }): React.JSX.Element {
  const item = project.items.find(({ id }) => id === controller.state.selectedItemId)
  const [trimStart, setTrimStart] = useState(0)
  const [trimEnd, setTrimEnd] = useState(0)
  const [trackId, setTrackId] = useState('')
  const [beforeItemId, setBeforeItemId] = useState('')
  useEffect(() => {
    if (!item) return
    setTrimStart(item.timelineStartFrame)
    setTrimEnd(item.timelineStartFrame + item.durationFrames)
    setTrackId(item.trackId)
  }, [item])
  return (
    <div className="edit-toolbar" aria-label={messages.manualTimelineEditing}>
      <button type="button" onClick={() => item && void splitAtPlayhead(controller, project, item, messages)} disabled={!item}>{messages.splitAtPlayhead}</button>
      <button type="button" className="danger-button" onClick={() => item && window.confirm(messages.deleteItemConfirm) && void controller.applyOperations([{ type: 'delete-item', itemId: item.id }], formatMessage(messages.deleteSummary, { id: item.id }))} disabled={!item}>{messages.deleteItem}</button>
      <label><span>{messages.trimIn} ({messages.frames})</span><input type="number" min={item?.timelineStartFrame ?? 0} max={trimEnd - 1} value={trimStart} onChange={(event) => setTrimStart(Number(event.target.value))} disabled={!item} /></label>
      <label><span>{messages.trimOut} ({messages.frames})</span><input type="number" min={trimStart + 1} max={item ? item.timelineStartFrame + item.durationFrames : 1} value={trimEnd} onChange={(event) => setTrimEnd(Number(event.target.value))} disabled={!item} /></label>
      <button type="button" disabled={!item} onClick={() => item && void controller.applyOperations([{ type: 'trim-item', itemId: item.id, startFrame: trimStart, endFrame: trimEnd }], formatMessage(messages.trimSummary, { id: item.id }))}>{messages.applyTrim}</button>
      <label><span>{messages.track}</span><select value={trackId} onChange={(event) => setTrackId(event.target.value)} disabled={!item}>{compatibleTracks(project.tracks, item).map((track) => <option key={track.id} value={track.id}>{track.name}</option>)}</select></label>
      <button type="button" disabled={!item || !trackId} onClick={() => item && void controller.applyOperations([{ type: 'move-item', itemId: item.id, trackId, timelineStartFrame: item.timelineStartFrame }], formatMessage(messages.moveSummary, { id: item.id }))}>{messages.moveTrack}</button>
      <label><span>{messages.placeBefore}</span><select value={beforeItemId} onChange={(event) => setBeforeItemId(event.target.value)} disabled={!item}><option value="">{messages.endOfTrack}</option>{project.items.filter((candidate) => candidate.trackId === item?.trackId && candidate.id !== item?.id).map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.id}</option>)}</select></label>
      <button type="button" disabled={!item} onClick={() => item && void controller.applyOperations([{ type: 'reorder-item', itemId: item.id, ...(beforeItemId ? { beforeItemId } : {}) }], formatMessage(messages.reorderSummary, { id: item.id }))}>{messages.reorder}</button>
    </div>
  )
}

function InspectorPanel(props: { controller: EditorController; item?: ItemProjection; caption?: CaptionProjection; messages: Messages }): React.JSX.Element {
  const { controller, item, caption, messages } = props
  const project = controller.state.project!
  const [x, setX] = useState(0)
  const [y, setY] = useState(0)
  const [scale, setScale] = useState(1)
  const [opacity, setOpacity] = useState(1)
  useEffect(() => {
    if (!item) return
    setX(item.transform.x); setY(item.transform.y); setScale(item.transform.scaleX); setOpacity(item.opacity)
  }, [item])
  return (
    <Panel title={messages.inspector}>
      {!item && !caption ? <EmptyState>{messages.noSelection}</EmptyState> : item ? (
        <div className="field-grid">
          <p className="selection-title"><strong>{item.id}</strong><span>{item.durationFrames} {messages.frames} · {item.trackId}</span></p>
          <label><span>X</span><input type="number" value={x} onChange={(event) => setX(Number(event.target.value))} /></label>
          <label><span>Y</span><input type="number" value={y} onChange={(event) => setY(Number(event.target.value))} /></label>
          <label><span>{messages.scale}</span><input type="number" min="0.01" max="10" step="0.05" value={scale} onChange={(event) => setScale(Number(event.target.value))} /></label>
          <label><span>{messages.opacity}</span><input type="number" min="0" max="1" step="0.05" value={opacity} onChange={(event) => setOpacity(Number(event.target.value))} /></label>
          <button type="button" onClick={() => void controller.applyOperations([{ type: 'update-transform', itemId: item.id, transform: { x, y, scaleX: scale, scaleY: scale }, opacity }], formatMessage(messages.compositionSummary, { id: item.id }))}>{messages.applyTransform}</button>
        </div>
      ) : <p>{messages.captionSelected}: <strong>{caption?.id}</strong>. {messages.captions}</p>}
      <fieldset className="aspect-controls"><legend>{messages.canvasAndFit}</legend>{(['16:9', '9:16', '1:1'] as const).map((preset) => <button type="button" key={preset} aria-pressed={project.canvas.preset === preset} onClick={() => void controller.applyOperations([{ type: 'set-canvas', preset, fit: project.canvas.fit }], formatMessage(messages.canvasSummary, { preset }))}>{preset}</button>)}<label><span>{messages.fitPolicy}</span><select value={project.canvas.fit} onChange={(event) => void controller.applyOperations([{ type: 'set-canvas', preset: project.canvas.preset, fit: event.target.value as 'fit' | 'crop' | 'pad' }], messages.fitSummary)}><option value="fit">{messages.fit}</option><option value="crop">{messages.crop}</option><option value="pad">{messages.pad}</option></select></label></fieldset>
      <p className="boundary-note">{messages.canvasBoundary}</p>
    </Panel>
  )
}

function CaptionPanel({ controller, messages }: { controller: EditorController; messages: Messages }): React.JSX.Element {
  const project = controller.state.project!
  const selected = project.captions.find(({ id }) => id === controller.state.selectedCaptionId)
  const [text, setText] = useState('')
  const [start, setStart] = useState(0)
  const [end, setEnd] = useState(30)
  const [placement, setPlacement] = useState<'top' | 'center' | 'bottom'>('bottom')
  useEffect(() => {
    if (!selected) return
    setText(selected.text); setStart(selected.startFrame); setEnd(selected.endFrame); setPlacement(selected.placement)
  }, [selected])
  const save = (): void => {
    const captionTrack = project.tracks.find(({ kind }) => kind === 'caption')
    if (!captionTrack || !text.trim() || end <= start) return
    const operation: TimelineOperation = selected
      ? { type: 'update-caption', captionId: selected.id, patch: { text: text.trim(), startFrame: start, endFrame: end, placement } }
      : { type: 'add-caption', caption: { id: `caption-${Date.now().toString(36)}`, trackId: captionTrack.id, startFrame: start, endFrame: end, text: text.trim(), placement } }
    void controller.applyOperations(
      [operation],
      selected ? formatMessage(messages.updateCaptionSummary, { id: selected.id }) : messages.addCaptionSummary
    )
  }
  return (
    <Panel title={messages.captions}>
      <div className="caption-layout">
        <ul className="caption-list">{project.captions.slice(0, VIEW_LIMITS.virtualWindow).map((caption) => <li key={caption.id}><button type="button" aria-pressed={selected?.id === caption.id} onClick={() => controller.selectCaption(caption.id)}><span>{caption.text}</span><small>{caption.startFrame}–{caption.endFrame}f</small></button></li>)}</ul>
        <div className="field-grid">
          <label className="wide-field"><span>{messages.captionText}</span><textarea rows={3} value={text} maxLength={4096} onChange={(event) => setText(event.target.value)} /></label>
          <label><span>{messages.startFrame}</span><input type="number" min={0} value={start} onChange={(event) => setStart(Number(event.target.value))} /></label>
          <label><span>{messages.endFrame}</span><input type="number" min={start + 1} max={Math.max(start + 1, project.durationFrames)} value={end} onChange={(event) => setEnd(Number(event.target.value))} /></label>
          <label><span>{messages.placement}</span><select value={placement} onChange={(event) => setPlacement(event.target.value as typeof placement)}><option value="top">{messages.top}</option><option value="center">{messages.center}</option><option value="bottom">{messages.bottom}</option></select></label>
          <button type="button" onClick={save}>{selected ? messages.updateCaption : messages.addCaption}</button>
          {selected && <button type="button" className="danger-button" onClick={() => window.confirm(messages.deleteCaptionConfirm) && void controller.applyOperations([{ type: 'delete-caption', captionId: selected.id }], formatMessage(messages.deleteCaptionSummary, { id: selected.id }))}>{messages.deleteCaption}</button>}
        </div>
      </div>
    </Panel>
  )
}

function RevisionPanel({ controller, messages }: { controller: EditorController; messages: Messages }): React.JSX.Element {
  const project = controller.state.project!
  return (
    <Panel title={messages.revisions} actions={<span className="revision-badge">{messages.current} r{project.currentRevision}</span>}>
      <ol className="revision-list" reversed>{[...project.revisions].reverse().map((revision) => <li key={revision.revision} className={revision.revision === project.currentRevision ? 'current' : ''}><strong>r{revision.revision}</strong><span>{revision.summary}</span><small>{revisionAuthorLabel(messages, revision.author)} · {formatTimestamp(revision.timestamp, controller.state.locale?.language)}</small></li>)}</ol>
    </Panel>
  )
}

function AgentSyncPanel({ controller, messages }: { controller: EditorController; messages: Messages }): React.JSX.Element {
  const { project, lastProjectChange, agentRun } = controller.state
  return (
    <Panel title={messages.agent} actions={<span className="revision-badge">r{project?.currentRevision ?? 0}</span>}>
      <div className="agent-sync-callout">
        <strong>{messages.mainAgent}</strong>
        <p>{messages.mainAgentHelp}</p>
      </div>
      <dl className="agent-sync-grid">
        <div><dt>{messages.activeProject}</dt><dd>{project?.name ?? messages.noProject}</dd></div>
        <div><dt>{messages.activeRevision}</dt><dd>{project ? `r${project.currentRevision}` : '—'}</dd></div>
        <div><dt>{messages.agentTool}</dt><dd><code>video-project · active</code></dd></div>
      </dl>
      <div className="agent-sync-status" role="status" aria-live="polite">
        <span className="agent-sync-dot" aria-hidden="true" />
        <span>{lastProjectChange && lastProjectChange.projectId === project?.id
          ? `${messages.lastSync}: ${lastProjectChange.reason} · r${lastProjectChange.revision}`
          : messages.agentReady}</span>
      </div>
      {agentRun ? <p className="subtle">{messages.legacyRun}: {agentStateLabel(messages, agentRun.state)}</p> : null}
      <p className="boundary-note">{messages.unsupported}</p>
    </Panel>
  )
}

function PreviewPanel(props: { controller: EditorController; artifacts: GeneratedArtifact[]; messages: Messages }): React.JSX.Element {
  const { controller, artifacts, messages } = props
  const project = controller.state.project!
  return (
    <Panel title={messages.preview}>
      <div className="button-row"><button type="button" onClick={() => void controller.startRender('proof-frame', 'none')}>{messages.proofFrame}</button><button type="button" onClick={() => void controller.startRender('preview', 'none')}>{messages.previewClip}</button></div>
      {artifacts.length === 0 ? <EmptyState>{messages.noProofArtifacts}</EmptyState> : <ul className="artifact-list">{artifacts.map((artifact) => {
        const ticket = ticketForArtifact(controller.state.renderTickets, artifact)
        const stale = ticket ? proofIsStale(ticket, project) : false
        const usesPlayer = artifactUsesPlayer(artifact)
        return <li key={artifact.artifactId}><div><strong>{artifact.displayName}</strong><small>{formatBytes(artifact.byteSize)} · {mediaKindLabel(messages, artifact.mediaKind)}</small></div>{stale && <span className="stale-badge">{messages.staleProof}</span>}<p>{messages.technicallyValidated}</p>{!usesPlayer && <p className="subtle">{messages.hostArtifactAction}</p>}<div className="button-row"><button type="button" disabled={artifact.availability !== 'available'} onClick={() => void controller.openArtifact(artifact)}>{usesPlayer ? messages.previewMedia : messages.openWithSystem}</button><button type="button" disabled={artifact.availability !== 'available'} onClick={() => void controller.revealArtifact(artifact)}>{messages.showInFolder}</button></div></li>
      })}</ul>}
    </Panel>
  )
}

function ExportPanel({ controller, messages }: { controller: EditorController; messages: Messages }): React.JSX.Element {
  const [captionMode, setCaptionMode] = useState<'none' | 'burned' | 'sidecar' | 'both'>('none')
  const [subtitleFormat, setSubtitleFormat] = useState<'srt' | 'vtt'>('srt')
  return (
    <Panel title={messages.export} actions={<><label className="inline-field"><span>{messages.captionsLabel}</span><select value={captionMode} onChange={(event) => setCaptionMode(event.target.value as typeof captionMode)}><option value="none">{messages.captionModeNone}</option><option value="burned">{messages.captionModeBurned}</option><option value="sidecar">{messages.captionModeSidecar}</option><option value="both">{messages.captionModeBoth}</option></select></label>{(captionMode === 'sidecar' || captionMode === 'both') && <label className="inline-field"><span>{messages.format}</span><select value={subtitleFormat} onChange={(event) => setSubtitleFormat(event.target.value as typeof subtitleFormat)}><option value="srt">SRT</option><option value="vtt">WebVTT</option></select></label>}</>}>
      <div className="button-row"><button type="button" onClick={() => void controller.startRender('h264-mp4', captionMode, subtitleFormat)}>{messages.exportVideo}</button><button type="button" onClick={() => void controller.startRender('audio-aac', 'none')}>{messages.exportAudio}</button></div>
      {controller.state.jobs.length === 0 ? <EmptyState>{messages.emptyJobs}</EmptyState> : <ul className="job-list">{controller.state.jobs.map((job) => <JobRow key={job.id} job={job} controller={controller} messages={messages} />)}</ul>}
    </Panel>
  )
}

function JobRow({ job, controller, messages }: { job: JobSnapshot; controller: EditorController; messages: Messages }): React.JSX.Element {
  const terminal = ['completed', 'failed', 'cancelled', 'interrupted'].includes(job.state)
  const progress = job.progress?.percentage ?? (job.progress?.completed !== undefined && job.progress.total ? job.progress.completed / job.progress.total * 100 : undefined)
  return (
    <li className={`job job-${job.state}`}>
      <div><strong>{jobKindLabel(messages, job.kind)}</strong><small>{job.id} · {formatMessage(messages.attempt, { attempt: job.executionAttempt })}</small></div>
      <span className="job-state">{jobStateLabel(messages, job.state)}</span>
      <progress max={100} value={progress ?? (job.state === 'completed' ? 100 : undefined)} aria-label={formatMessage(messages.progressLabel, { label: jobKindLabel(messages, job.kind), value: Math.round(progress ?? 0) })} />
      <p>{job.progress?.message ?? job.error?.message ?? messages.waitingProgress}</p>
      {!terminal && <button type="button" className="danger-button" onClick={() => void controller.cancelJob(job.id)}>{messages.cancelJob}</button>}
    </li>
  )
}

function Panel(props: PropsWithChildren<{ title: string; actions?: ReactNode; className?: string }>): React.JSX.Element {
  return <section className={`panel ${props.className ?? ''}`}><header className="panel-header"><h2>{props.title}</h2>{props.actions && <div className="panel-actions">{props.actions}</div>}</header><div className="panel-body">{props.children}</div></section>
}

function EmptyState({ children }: PropsWithChildren): React.JSX.Element { return <div className="empty-state"><span aria-hidden="true">--</span><p>{children}</p></div> }
function StatusNotice({ severity, children }: PropsWithChildren<{ severity: 'info' | 'warning' | 'error' }>): React.JSX.Element { return <div className={`status-notice status-${severity}`} role={severity === 'error' ? 'alert' : 'status'}>{children}</div> }
function Spinner(): React.JSX.Element { return <span className="spinner" aria-hidden="true" /> }

function VirtualControls(props: { start: number; total: number; onChange(start: number): void; messages: Messages }): React.JSX.Element | null {
  if (props.total <= VIEW_LIMITS.virtualWindow) return null
  return <div className="virtual-controls" aria-label={props.messages.virtualList}><button type="button" onClick={() => props.onChange(Math.max(0, props.start - VIEW_LIMITS.virtualWindow))} disabled={props.start === 0}>{props.messages.previous}</button><span>{props.start + 1}–{Math.min(props.total, props.start + VIEW_LIMITS.virtualWindow)} / {props.total}</span><button type="button" onClick={() => props.onChange(Math.min(props.total - 1, props.start + VIEW_LIMITS.virtualWindow))} disabled={props.start + VIEW_LIMITS.virtualWindow >= props.total}>{props.messages.next}</button></div>
}

async function splitAtPlayhead(controller: EditorController, project: ProjectProjection, item: ItemProjection, messages: Messages): Promise<void> {
  const frame = controller.state.playheadFrame
  if (frame <= item.timelineStartFrame || frame >= item.timelineStartFrame + item.durationFrames) return
  await controller.applyOperations(
    [{ type: 'split-item', itemId: item.id, atFrame: frame }],
    formatMessage(messages.splitSummary, { id: item.id, frame })
  )
}

function connectionLabel(messages: Messages, state: EditorController['state']['connection']): string {
  if (state === 'online') return messages.connected
  if (state === 'offline') return messages.offline
  if (state === 'reconnecting') return messages.reconnecting
  return messages.connecting
}

function revisionAuthorLabel(messages: Messages, author: string): string {
  if (author === 'agent') return messages.revisionAuthorAgent
  if (author === 'system') return messages.revisionAuthorSystem
  if (author === 'manual' || author === 'user') return messages.revisionAuthorManual
  return author
}

function agentStateLabel(messages: Messages, state: string): string {
  const labels: Record<string, string> = {
    queued: messages.agentStateQueued,
    running: messages.agentStateRunning,
    'waiting-approval': messages.agentStateWaitingApproval,
    'waiting-user-input': messages.agentStateWaitingInput,
    completed: messages.agentStateCompleted,
    failed: messages.agentStateFailed,
    cancelled: messages.agentStateCancelled,
    'budget-exhausted': messages.agentStateBudgetExhausted
  }
  return labels[state] ?? state
}

function jobStateLabel(messages: Messages, state: JobSnapshot['state']): string {
  if (state === 'queued') return messages.jobStateQueued
  if (state === 'running') return messages.jobStateRunning
  if (state === 'completed') return messages.jobStateCompleted
  if (state === 'failed') return messages.jobStateFailed
  if (state === 'cancelled') return messages.jobStateCancelled
  return messages.jobStateInterrupted
}

function jobKindLabel(messages: Messages, kind: string): string {
  if (kind === 'media.ffmpeg') return messages.jobKindRender
  if (kind === 'media.ffprobe') return messages.jobKindProbe
  if (kind.includes('transcri')) return messages.jobKindTranscribe
  return kind
}

function trackKindLabel(messages: Messages, kind: TrackProjection['kind']): string {
  if (kind === 'video') return messages.trackKindVideo
  if (kind === 'audio') return messages.trackKindAudio
  return messages.trackKindCaption
}

function mediaKindLabel(messages: Messages, kind: GeneratedArtifact['mediaKind']): string {
  if (kind === 'video') return messages.mediaKindVideo
  if (kind === 'audio') return messages.mediaKindAudio
  if (kind === 'image') return messages.mediaKindImage
  return messages.mediaKindSubtitle
}

function compatibleTracks(tracks: TrackProjection[], item?: ItemProjection): TrackProjection[] {
  if (!item) return []
  const current = tracks.find(({ id }) => id === item.trackId)
  return tracks.filter(({ kind }) => kind === current?.kind && kind !== 'caption')
}

function segmentTimelineFrame(project: ProjectProjection, assetId: string, startUs: number): number {
  const item = [...project.items].sort((a, b) => a.timelineStartFrame - b.timelineStartFrame).find((candidate) =>
    candidate.assetId === assetId && candidate.sourceStartUs <= startUs && startUs < candidate.sourceEndUs
  )
  if (!item) return Math.max(0, Math.round(startUs * project.fps.numerator / project.fps.denominator / 1_000_000))
  const sourceDelta = startUs - item.sourceStartUs
  const frameDelta = sourceDelta * project.fps.numerator * item.speed.denominator /
    (1_000_000 * project.fps.denominator * item.speed.numerator)
  return item.timelineStartFrame + Math.round(frameDelta)
}

function ticketForArtifact(tickets: RenderTicket[], artifact: GeneratedArtifact): RenderTicket | undefined {
  return artifact.provenance.jobId ? tickets.find(({ jobId }) => jobId === artifact.provenance.jobId) : undefined
}

function durationBand(duration: number, total: number): string {
  const share = total > 0 ? duration / total : 0
  return share > 0.5 ? 'xl' : share > 0.25 ? 'lg' : share > 0.1 ? 'md' : 'sm'
}

function formatTime(seconds: number): string {
  const safe = Math.max(0, Number.isFinite(seconds) ? seconds : 0)
  const minutes = Math.floor(safe / 60)
  const remaining = Math.floor(safe % 60)
  return `${minutes.toString().padStart(2, '0')}:${remaining.toString().padStart(2, '0')}`
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function formatTimestamp(value: string, locale?: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString(locale)
}
