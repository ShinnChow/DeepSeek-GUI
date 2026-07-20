import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { defaultModelProviderSettings, type ModelProviderSettingsV1 } from '@shared/app-settings'
import { ModelRoutesSettings } from './settings-section-model-routes'

function settings(): ModelProviderSettingsV1 {
  const defaults = defaultModelProviderSettings()
  return {
    ...defaults,
    localGateway: { enabled: true },
    routePools: [{
      id: 'kimi-pool', name: 'Kimi 容量池', modelId: 'kimi-auto', enabled: true, strategy: 'adaptive',
      targets: [{ id: 'target', providerId: defaults.providers[0].id, modelId: defaults.providers[0].models[0], enabled: true, weight: 2 }],
      failurePolicy: { failoverHttpStatusCodes: [429, 503], failoverOnNetworkError: true, failoverOnTimeout: true, failoverOnAuthError: true },
      healthPolicy: { failureThreshold: 3, cooldownMs: 60_000, halfOpenMaxAttempts: 1 }
    }]
  }
}

describe('ModelRoutesSettings', () => {
  it('renders the route master-detail controls and safety policy', () => {
    const html = renderToStaticMarkup(createElement(ModelRoutesSettings, { settings: settings(), onChange: () => undefined }))
    expect(html).toContain('Kimi 容量池')
    expect(html).toContain('kimi-auto')
    expect(html).toContain('稳定性优先自适应')
    expect(html).toContain('流式输出开始后固定停止')
    expect(html).toContain('127.0.0.1 · 无鉴权')
  })
})
