import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import {
  startHttpServer,
  type RunningServer,
} from '../../src/adapters/http/http-server.js'

const examplesRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../examples',
)

const FIXTURE_IDS = [
  'charts-smoke',
  'forms-diff-smoke',
] as const

function looksLikeLogin(html: string): boolean {
  // Host chrome only — ignore bundled React/canvas source strings.
  const chrome = html.split('<script>')[0] ?? html
  return (
    /data-shell=["']login["']/i.test(chrome) ||
    /<(?:form|input)[^>]*(?:login|password|signin)/i.test(chrome) ||
    />\s*(?:sign[\s-]?in|log[\s-]?in)\s*</i.test(chrome)
  )
}

describe('acceptance fixtures', () => {
  const servers: RunningServer[] = []

  afterEach(async () => {
    while (servers.length) {
      const s = servers.pop()
      await s?.close().catch(() => undefined)
    }
  })

  it('@task-9: index lists fixtures, charts/forms-diff load without import rewrite, no login', async () => {
    // default Auth (DisabledAuthAdapter) — open access, no login screen
    const server = await startHttpServer({
      root: examplesRoot,
      host: '127.0.0.1',
      port: 0,
    })
    servers.push(server)

    const index = await fetch(`${server.url}/`)
    expect(index.status).toBe(200)
    const indexHtml = await index.text()
    expect(indexHtml).toContain('data-shell="index"')
    expect(looksLikeLogin(indexHtml)).toBe(false)
    for (const id of FIXTURE_IDS) {
      expect(indexHtml).toContain(id)
      expect(indexHtml).toContain(`/canvas/${id}`)
    }

    async function assertViewerLoads(id: string, markers: string[]) {
      const res = await fetch(`${server.url}/canvas/${encodeURIComponent(id)}`)
      expect(res.status).toBe(200)
      const html = await res.text()
      expect(html).toContain('data-shell="viewer"')
      expect(html).toContain(`data-canvas-id="${id}"`)
      // success shell omits data-tone on the status p; CSS still mentions error
      expect(html).not.toMatch(
        /class="status"[^>]*data-tone="error"[^>]*data-shell="viewer"/,
      )
      expect(html).toContain('window.__TEAM_CANVAS__')
      expect(looksLikeLogin(html)).toBe(false)
      // alias baked in — no bare team-canvas/canvas import left for the browser
      expect(html).not.toMatch(/from\s*["']team-canvas\/canvas["']/)
      for (const marker of markers) {
        expect(html).toContain(marker)
      }
    }

    await assertViewerLoads('charts-smoke', [
      'charts-smoke',
      'BarChart, LineChart, PieChart',
    ])
    await assertViewerLoads('forms-diff-smoke', [
      'forms-diff-smoke',
      'forms + DiffView',
      'export const next = 2',
    ])
  })
})
