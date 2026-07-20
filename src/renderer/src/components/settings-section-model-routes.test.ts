import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { defaultModelProviderSettings, type ModelProviderSettingsV1 } from '@shared/app-settings'
import { ModelRoutesSettings } from './settings-section-model-routes'

function settings(): ModelProviderSettingsV1 {
  const defaults = defaultModelProviderSettings()
  return {
    ...defaults,
    localGateway: { enabled: true, name: 'Kun API' },
    routePools: [
      {
        id: 'kimi-pool', name: 'Kimi 容量池', modelId: 'kimi-auto', enabled: true, strategy: 'adaptive',
        targets: [{ id: 'target', providerId: defaults.providers[0].id, modelId: defaults.providers[0].models[0], enabled: true, weight: 2 }],
        failurePolicy: { failoverHttpStatusCodes: [429, 503], failoverOnNetworkError: true, failoverOnTimeout: true, failoverOnAuthError: true },
        healthPolicy: { failureThreshold: 3, cooldownMs: 60_000, halfOpenMaxAttempts: 1 }
      },
      {
        id: 'code-pool', name: 'Coding 容量池', modelId: 'code-auto', enabled: true, strategy: 'priority',
        targets: [{ id: 'code-target', providerId: defaults.providers[0].id, modelId: defaults.providers[0].models[0], enabled: true, weight: 1 }],
        failurePolicy: { failoverHttpStatusCodes: [429, 503], failoverOnNetworkError: true, failoverOnTimeout: true, failoverOnAuthError: true },
        healthPolicy: { failureThreshold: 3, cooldownMs: 60_000, halfOpenMaxAttempts: 1 }
      }
    ]
  }
}

describe('ModelRoutesSettings', () => {
  it('renders one local provider with multiple routed models and safety policy', () => {
    const html = renderToStaticMarkup(createElement(ModelRoutesSettings, { settings: settings(), onChange: () => undefined }))
    expect(html).toContain('本地中转供应商')
    expect(html).toContain('Kun API')
    expect(html).toContain('2 / 2 个模型已启用')
    expect(html).toContain('路由模型')
    expect(html).toContain('Kimi 容量池')
    expect(html).toContain('kimi-auto')
    expect(html).toContain('Coding 容量池')
    expect(html).toContain('code-auto')
    expect(html).toContain('添加模型')
    expect(html).toContain('稳定性优先自适应')
    expect(html).toContain('流式输出开始后固定停止')
    expect(html).toContain('127.0.0.1 · 无鉴权')
  })
})
