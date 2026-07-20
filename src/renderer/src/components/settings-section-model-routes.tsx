import { useEffect, useMemo, useState, type DragEvent, type ReactElement } from 'react'
import type { ModelProviderSettingsV1, ModelRoutePoolV1, ModelRouteStrategy } from '@shared/app-settings'
import { DEFAULT_MODEL_ROUTE_FAILURE_POLICY, DEFAULT_MODEL_ROUTE_HEALTH_POLICY } from '@shared/app-settings'
import { Activity, AlertTriangle, GripVertical, Loader2, Plus, Play, Route, Trash2 } from 'lucide-react'
import { Toggle } from './settings-controls'

type RouteStatus = {
  metrics?: Record<string, { successes: number; failures: number; ewmaLatencyMs?: number; lastError?: string }>
  events?: Array<{ at: string; poolId: string; providerId: string; modelId: string; result: string; latencyMs: number; category?: string }>
}

const strategies: Array<{ id: ModelRouteStrategy; label: string }> = [
  { id: 'priority', label: '优先级故障转移' },
  { id: 'round-robin', label: '轮询' },
  { id: 'weighted-round-robin', label: '加权轮询' },
  { id: 'least-latency', label: '最低延迟' },
  { id: 'adaptive', label: '稳定性优先自适应' }
]

export function ModelRoutesSettings({
  settings,
  onChange
}: {
  settings: ModelProviderSettingsV1
  onChange: (next: ModelProviderSettingsV1) => void
}): ReactElement {
  const [selectedId, setSelectedId] = useState(settings.routePools[0]?.id ?? '')
  const [status, setStatus] = useState<RouteStatus>({})
  const [testing, setTesting] = useState(false)
  const [testMessage, setTestMessage] = useState('')
  const selected = settings.routePools.find((pool) => pool.id === selectedId) ?? settings.routePools[0]

  useEffect(() => {
    if (!selected && settings.routePools[0]) setSelectedId(settings.routePools[0].id)
  }, [selected, settings.routePools])

  const refreshStatus = async (): Promise<void> => {
    try {
      const response = await window.kunGui.runtimeRequest('/v1/model-routes', 'GET')
      if (response.ok) setStatus(JSON.parse(response.body) as RouteStatus)
    } catch {
      // Runtime may be stopped while settings are edited.
    }
  }
  useEffect(() => { void refreshStatus() }, [settings.routePools.length])

  const updatePool = (patch: Partial<ModelRoutePoolV1>): void => {
    if (!selected) return
    onChange({ ...settings, routePools: settings.routePools.map((pool) => pool.id === selected.id ? { ...pool, ...patch } : pool) })
  }

  const addPool = (): void => {
    const provider = settings.providers.find((candidate) => candidate.models.length > 0)
    const ordinal = settings.routePools.length + 1
    const id = uniqueValue(`route-pool-${ordinal}`, new Set(settings.routePools.map((pool) => pool.id)))
    const modelId = uniqueValue(`local-route-${ordinal}`, new Set([
      ...settings.providers.flatMap((item) => item.models),
      ...settings.routePools.map((pool) => pool.modelId)
    ]))
    const pool: ModelRoutePoolV1 = {
      id,
      name: `新建容量池 ${ordinal}`,
      modelId,
      enabled: false,
      strategy: 'priority',
      targets: provider ? [{ id: `${id}-target-1`, providerId: provider.id, modelId: provider.models[0], enabled: true, weight: 1 }] : [],
      failurePolicy: { ...DEFAULT_MODEL_ROUTE_FAILURE_POLICY, failoverHttpStatusCodes: [...DEFAULT_MODEL_ROUTE_FAILURE_POLICY.failoverHttpStatusCodes] },
      healthPolicy: { ...DEFAULT_MODEL_ROUTE_HEALTH_POLICY }
    }
    onChange({ ...settings, routePools: [...settings.routePools, pool] })
    setSelectedId(id)
  }

  const removePool = (): void => {
    if (!selected) return
    const next = settings.routePools.filter((pool) => pool.id !== selected.id)
    onChange({ ...settings, routePools: next })
    setSelectedId(next[0]?.id ?? '')
  }

  const runTest = async (): Promise<void> => {
    if (!selected) return
    setTesting(true)
    setTestMessage('')
    try {
      const response = await window.kunGui.runtimeRequest(`/v1/model-routes/${encodeURIComponent(selected.id)}/test`, 'POST')
      const body = JSON.parse(response.body) as { ok?: boolean; text?: string; error?: { message?: string } }
      setTestMessage(response.ok && body.ok ? `链路测试成功${body.text ? `：${body.text}` : ''}` : body.error?.message ?? '链路测试失败')
      await refreshStatus()
    } catch (error) {
      setTestMessage(error instanceof Error ? error.message : String(error))
    } finally {
      setTesting(false)
    }
  }

  const events = useMemo(() => (status.events ?? []).filter((event) => !selected || event.poolId === selected.id).slice(-8).reverse(), [selected, status.events])

  return (
    <div className="grid min-h-[620px] gap-4 p-4 lg:grid-cols-[280px_minmax(0,1fr)]">
      <aside className="grid min-w-0 content-start gap-3 border-r border-ds-border-muted pr-4">
        <div>
          <h3 className="text-[14px] font-semibold text-ds-ink">本地中转站</h3>
          <p className="mt-1 text-[12px] leading-5 text-ds-faint">把多个供应商模型合并为一个稳定入口。</p>
        </div>
        <button type="button" onClick={addPool} className="inline-flex h-9 items-center justify-center gap-2 rounded-xl bg-accent text-[12.5px] font-semibold text-white">
          <Plus className="h-4 w-4" /> 新建路由
        </button>
        <div className="flex items-center justify-between rounded-xl border border-ds-border bg-ds-card px-3 py-2.5">
          <div><div className="text-[12px] font-medium text-ds-ink">开放本地 API</div><div className="mt-0.5 text-[10.5px] text-ds-faint">127.0.0.1 · 无鉴权</div></div>
          <Toggle checked={settings.localGateway.enabled} onChange={(enabled) => onChange({ ...settings, localGateway: { enabled } })} ariaLabel="开放本地 API" />
        </div>
        <div className="grid gap-2">
          {settings.routePools.map((pool) => {
            const available = pool.targets.filter((target) => target.enabled).length
            return (
              <button key={pool.id} type="button" onClick={() => setSelectedId(pool.id)} className={`rounded-xl border px-3 py-3 text-left transition ${selected?.id === pool.id ? 'border-accent bg-accent/5' : 'border-ds-border bg-ds-card hover:bg-ds-hover'}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-[13.5px] font-semibold text-ds-ink">{pool.name}</span>
                  <span className={`h-2 w-2 rounded-full ${pool.enabled ? 'bg-emerald-500' : 'bg-ds-faint'}`} />
                </div>
                <div className="mt-1 truncate font-mono text-[11px] text-ds-faint">{pool.modelId}</div>
                <div className="mt-2 flex items-center justify-between text-[11px] text-ds-muted"><span>{available}/{pool.targets.length} 目标</span><span>{strategies.find((item) => item.id === pool.strategy)?.label}</span></div>
              </button>
            )
          })}
          {settings.routePools.length === 0 ? <div className="rounded-xl border border-dashed border-ds-border px-3 py-8 text-center text-[12px] text-ds-faint">还没有路由池</div> : null}
        </div>
      </aside>

      {selected ? (
        <main className="grid min-w-0 content-start gap-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <input value={selected.name} onChange={(event) => updatePool({ name: event.target.value })} className="w-full bg-transparent text-[20px] font-semibold text-ds-ink outline-none" />
              <p className="mt-1 text-[12px] text-ds-faint">配置保存后会热更新到当前 Kun Runtime。</p>
            </div>
            <div className="flex items-center gap-3"><span className="text-[12px] text-ds-muted">启用</span><Toggle checked={selected.enabled} onChange={(enabled) => updatePool({ enabled })} ariaLabel="启用路由池" /></div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <Field label="模型代号"><input value={selected.modelId} onChange={(event) => updatePool({ modelId: event.target.value })} className={inputClass} spellCheck={false} /></Field>
            <Field label="负载策略"><select value={selected.strategy} onChange={(event) => updatePool({ strategy: event.target.value as ModelRouteStrategy })} className={inputClass}>{strategies.map((strategy) => <option key={strategy.id} value={strategy.id}>{strategy.label}</option>)}</select></Field>
          </div>

          <section className="grid gap-3">
            <div className="flex items-center justify-between"><h3 className="text-[13px] font-semibold text-ds-ink">路由目标</h3><button type="button" onClick={() => {
              const provider = settings.providers.find((candidate) => candidate.models.length > 0)
              if (!provider) return
              updatePool({ targets: [...selected.targets, { id: `${selected.id}-target-${Date.now().toString(36)}`, providerId: provider.id, modelId: provider.models[0], enabled: true, weight: 1 }] })
            }} className="inline-flex items-center gap-1 rounded-full border border-ds-border px-3 py-1.5 text-[12px] text-ds-muted"><Plus className="h-3.5 w-3.5" /> 添加目标</button></div>
            <div className="grid gap-2">
              {selected.targets.map((target, index) => {
                const provider = settings.providers.find((candidate) => candidate.id === target.providerId) ?? settings.providers[0]
                const metric = status.metrics?.[`${selected.id}:${target.id}`]
                return (
                  <div key={target.id} draggable onDragStart={(event) => event.dataTransfer.setData('text/route-target-index', String(index))} onDragOver={(event) => event.preventDefault()} onDrop={(event) => reorderTarget(event, index, selected, updatePool)} className="grid items-center gap-2 rounded-xl border border-ds-border bg-ds-card p-3 md:grid-cols-[24px_28px_minmax(150px,1fr)_minmax(150px,1fr)_80px_110px_32px]">
                    <GripVertical className="h-4 w-4 cursor-grab text-ds-faint" />
                    <span className="grid h-6 w-6 place-items-center rounded-full bg-ds-main text-[11px] text-ds-muted">{index + 1}</span>
                    <select value={target.providerId} onChange={(event) => {
                      const nextProvider = settings.providers.find((candidate) => candidate.id === event.target.value)
                      updatePool({ targets: selected.targets.map((item) => item.id === target.id ? { ...item, providerId: event.target.value, modelId: nextProvider?.models[0] ?? '' } : item) })
                    }} className={compactInputClass}>{settings.providers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
                    <select value={target.modelId} onChange={(event) => updatePool({ targets: selected.targets.map((item) => item.id === target.id ? { ...item, modelId: event.target.value } : item) })} className={compactInputClass}>{(provider?.models ?? []).map((model) => <option key={model} value={model}>{model}</option>)}</select>
                    <input type="number" min={1} max={100} title="权重" value={target.weight} onChange={(event) => updatePool({ targets: selected.targets.map((item) => item.id === target.id ? { ...item, weight: Number(event.target.value) || 1 } : item) })} className={compactInputClass} />
                    <div className="text-[11px] text-ds-muted">{metric?.ewmaLatencyMs ? `${Math.round(metric.ewmaLatencyMs)} ms` : '未探测'}<br /><span className="text-ds-faint">{metric ? `${metric.successes}/${metric.successes + metric.failures} 成功` : ''}</span></div>
                    <button type="button" onClick={() => updatePool({ targets: selected.targets.filter((item) => item.id !== target.id) })} className="rounded-full p-1.5 text-ds-faint hover:bg-red-50 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
                  </div>
                )
              })}
            </div>
          </section>

          <div className="grid gap-3 xl:grid-cols-2">
            <section className="rounded-xl border border-ds-border p-4"><h3 className="flex items-center gap-2 text-[13px] font-semibold text-ds-ink"><AlertTriangle className="h-4 w-4 text-amber-500" />故障转移规则</h3><div className="mt-3 grid gap-3 text-[12px] text-ds-muted"><ToggleRow label="网络错误" checked={selected.failurePolicy.failoverOnNetworkError} onChange={(value) => updatePool({ failurePolicy: { ...selected.failurePolicy, failoverOnNetworkError: value } })} /><ToggleRow label="请求超时" checked={selected.failurePolicy.failoverOnTimeout} onChange={(value) => updatePool({ failurePolicy: { ...selected.failurePolicy, failoverOnTimeout: value } })} /><ToggleRow label="401 / 403 凭据错误" checked={selected.failurePolicy.failoverOnAuthError} onChange={(value) => updatePool({ failurePolicy: { ...selected.failurePolicy, failoverOnAuthError: value } })} /><Field label="切换 HTTP 状态码"><input value={selected.failurePolicy.failoverHttpStatusCodes.join(', ')} onChange={(event) => updatePool({ failurePolicy: { ...selected.failurePolicy, failoverHttpStatusCodes: parseCodes(event.target.value) } })} className={compactInputClass} /></Field><p className="text-[11px] text-ds-faint">流式输出开始后固定停止，不会重复请求或执行工具。</p></div></section>
            <section className="rounded-xl border border-ds-border p-4"><h3 className="flex items-center gap-2 text-[13px] font-semibold text-ds-ink"><Activity className="h-4 w-4 text-emerald-500" />健康与熔断</h3><div className="mt-3 grid grid-cols-3 gap-3"><Field label="连续失败"><input type="number" min={1} max={20} value={selected.healthPolicy.failureThreshold} onChange={(event) => updatePool({ healthPolicy: { ...selected.healthPolicy, failureThreshold: Number(event.target.value) } })} className={compactInputClass} /></Field><Field label="冷却秒数"><input type="number" min={1} value={Math.round(selected.healthPolicy.cooldownMs / 1000)} onChange={(event) => updatePool({ healthPolicy: { ...selected.healthPolicy, cooldownMs: Number(event.target.value) * 1000 } })} className={compactInputClass} /></Field><Field label="半开探测"><input type="number" min={1} max={10} value={selected.healthPolicy.halfOpenMaxAttempts} onChange={(event) => updatePool({ healthPolicy: { ...selected.healthPolicy, halfOpenMaxAttempts: Number(event.target.value) } })} className={compactInputClass} /></Field></div></section>
          </div>

          <section className="grid gap-3 border-t border-ds-border-muted pt-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-[13px] font-semibold text-ds-ink">路由验证</h3><p className="mt-1 text-[11px] text-ds-faint">本地 API 默认无鉴权，仅允许回环地址访问。</p></div><button type="button" disabled={testing || !selected.enabled} onClick={() => void runTest()} className="inline-flex h-9 items-center gap-2 rounded-full border border-accent px-4 text-[12px] font-medium text-accent disabled:opacity-40">{testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}{testing ? '测试中' : '测试完整链路'}</button></div>{testMessage ? <div className="rounded-lg bg-ds-main px-3 py-2 text-[12px] text-ds-muted">{testMessage}</div> : null}<div className="overflow-hidden rounded-xl border border-ds-border"><table className="w-full text-left text-[11.5px]"><thead className="bg-ds-main text-ds-faint"><tr><th className="px-3 py-2">时间</th><th className="px-3 py-2">目标</th><th className="px-3 py-2">结果</th><th className="px-3 py-2">延迟</th></tr></thead><tbody>{events.map((event) => <tr key={`${event.at}-${event.providerId}-${event.modelId}`} className="border-t border-ds-border-muted text-ds-muted"><td className="px-3 py-2">{new Date(event.at).toLocaleTimeString()}</td><td className="px-3 py-2">{event.providerId} / {event.modelId}</td><td className="px-3 py-2">{event.result}{event.category ? ` · ${event.category}` : ''}</td><td className="px-3 py-2">{event.latencyMs} ms</td></tr>)}</tbody></table>{events.length === 0 ? <div className="px-3 py-6 text-center text-[11px] text-ds-faint">暂无路由事件</div> : null}</div></section>

          <div className="flex justify-end"><button type="button" onClick={removePool} className="inline-flex items-center gap-2 rounded-full border border-red-200 px-3 py-2 text-[12px] text-red-600"><Trash2 className="h-3.5 w-3.5" /> 删除路由池</button></div>
        </main>
      ) : <main className="grid place-items-center text-center"><div><Route className="mx-auto h-10 w-10 text-ds-faint" /><h3 className="mt-3 text-[14px] font-semibold text-ds-ink">创建第一个本地路由池</h3><p className="mt-1 text-[12px] text-ds-faint">组合多个供应商模型，提高可用容量。</p></div></main>}
    </div>
  )
}

const inputClass = 'w-full rounded-xl border border-ds-border bg-ds-card px-3 py-2 text-[13px] text-ds-ink outline-none focus:border-accent/50'
const compactInputClass = 'w-full min-w-0 rounded-lg border border-ds-border bg-ds-card px-2 py-1.5 text-[12px] text-ds-ink outline-none focus:border-accent/50'
function Field({ label, children }: { label: string; children: ReactElement }): ReactElement { return <label className="grid gap-1.5 text-[11.5px] font-medium text-ds-muted"><span>{label}</span>{children}</label> }
function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }): ReactElement { return <div className="flex items-center justify-between"><span>{label}</span><Toggle checked={checked} onChange={onChange} ariaLabel={label} /></div> }
function uniqueValue(base: string, values: Set<string>): string { let value = base; let i = 2; while (values.has(value)) value = `${base}-${i++}`; return value }
function parseCodes(value: string): number[] { return [...new Set(value.split(/[\s,]+/).map(Number).filter((code) => Number.isInteger(code) && code >= 400 && code <= 599))] }
function reorderTarget(event: DragEvent, destination: number, pool: ModelRoutePoolV1, update: (patch: Partial<ModelRoutePoolV1>) => void): void { event.preventDefault(); const source = Number(event.dataTransfer.getData('text/route-target-index')); if (!Number.isInteger(source) || source === destination) return; const targets = [...pool.targets]; const [moved] = targets.splice(source, 1); targets.splice(destination, 0, moved); update({ targets }) }
