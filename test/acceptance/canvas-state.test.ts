import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createHttpCanvasStateStore } from '../../src/client/canvas-state-bridge.js'
import {
  startHttpServer,
  type RunningServer,
} from '../../src/adapters/http/http-server.js'
import type { CanvasStore } from '../../src/ports/canvas-store.js'
import { LocalFilesystemCanvasStore } from '../../src/adapters/store/local-fs-canvas-store.js'

describe('viewer useCanvasState persistence', () => {
  const servers: RunningServer[] = []

  afterEach(async () => {
    while (servers.length) {
      const s = servers.pop()
      await s?.close().catch(() => undefined)
    }
  })

  it('@task-8: update reaches store sidecar, reload restores, corrupt sidecar fails clearly, write failure is surfaced', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'team-canvas-t8-'))
    await writeFile(
      path.join(root, 'counter.canvas.tsx'),
      `import { Text, useCanvasState } from "team-canvas/canvas";
export default function Counter() {
  const [count] = useCanvasState("count", 0);
  return <Text>count={count}</Text>;
}
`,
      'utf8',
    )

    const server = await startHttpServer({
      root,
      host: '127.0.0.1',
      port: 0,
    })
    servers.push(server)

    // Viewer opens with useCanvasState wired through the HTTP bridge
    const emptyViewer = await fetch(`${server.url}/canvas/counter`)
    expect(emptyViewer.status).toBe(200)
    const emptyHtml = await emptyViewer.text()
    expect(emptyHtml).toContain('__TEAM_CANVAS__')
    expect(emptyHtml).toContain('"canvasId":"counter"')

    // When the viewer updates canvas state → PUT reaches CanvasStore.writeState
    let writeSettled!: () => void
    const wrote = new Promise<void>((resolve) => {
      writeSettled = resolve
    })
    const bridge = createHttpCanvasStateStore(
      { canvasId: 'counter', state: {} },
      {
        fetch: async (input, init) => {
          const url =
            typeof input === 'string'
              ? input
              : input instanceof URL
                ? input.href
                : input.url
          const res = await fetch(new URL(url, server.url), init)
          writeSettled()
          return res
        },
      },
    )
    bridge.set('count', 7)
    await wrote

    const sidecarPath = path.join(root, 'counter.canvas.data.json')
    expect(JSON.parse(await readFile(sidecarPath, 'utf8'))).toEqual({
      count: 7,
    })

    // Reloading the canvas restores the persisted values
    const reloaded = await fetch(`${server.url}/canvas/counter`)
    const reloadedHtml = await reloaded.text()
    expect(reloadedHtml).toContain('"count":7')
    const getState = await fetch(`${server.url}/api/canvas/counter/state`)
    expect(getState.status).toBe(200)
    expect(await getState.json()).toEqual({ count: 7 })

    // Corrupt existing sidecar fails the load with a clear error without wiping
    const corrupt = '{not-valid-json'
    await writeFile(sidecarPath, corrupt, 'utf8')
    const beforeCorrupt = await readFile(sidecarPath, 'utf8')
    const corruptViewer = await fetch(`${server.url}/canvas/counter`)
    expect(corruptViewer.status).toBe(200)
    const corruptHtml = await corruptViewer.text()
    expect(corruptHtml).toContain('data-tone="error"')
    expect(corruptHtml.toLowerCase()).toMatch(/corrupt|invalid json/)
    expect(await readFile(sidecarPath, 'utf8')).toBe(beforeCorrupt)

    const corruptGet = await fetch(`${server.url}/api/canvas/counter/state`)
    expect(corruptGet.status).toBe(500)
    expect((await corruptGet.text()).toLowerCase()).toMatch(
      /corrupt|invalid json/,
    )
    expect(await readFile(sidecarPath, 'utf8')).toBe(beforeCorrupt)

    // Store write failure is surfaced rather than silently dropped
    await writeFile(
      path.join(root, 'fail.canvas.tsx'),
      `import { Text } from "team-canvas/canvas";
export default function Fail() { return <Text>ok</Text>; }
`,
      'utf8',
    )
    const base = LocalFilesystemCanvasStore(root)
    const failingStore: CanvasStore = {
      list: () => base.list(),
      readSource: (id) => base.readSource(id),
      writeSource: (id, source) => base.writeSource(id, source),
      readState: async () => {
        const err = new Error('ENOENT') as NodeJS.ErrnoException
        err.code = 'ENOENT'
        throw err
      },
      writeState: async () => {
        throw new Error('disk full')
      },
    }
    const failServer = await startHttpServer({
      root,
      host: '127.0.0.1',
      port: 0,
      store: failingStore,
    })
    servers.push(failServer)

    const putFail = await fetch(`${failServer.url}/api/canvas/fail/state`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ n: 1 }),
    })
    expect(putFail.status).toBe(500)
    expect(await putFail.text()).toMatch(/disk full/)

    const surfaced = new Promise<string>((resolve) => {
      const failBridge = createHttpCanvasStateStore(
        { canvasId: 'fail', state: {} },
        {
          fetch: async (input, init) => {
            const url =
              typeof input === 'string'
                ? input
                : input instanceof URL
                  ? input.href
                  : input.url
            return fetch(new URL(url, failServer.url), init)
          },
          onWriteError: (message) => resolve(message),
        },
      )
      failBridge.set('n', 1)
    })
    await expect(surfaced).resolves.toMatch(/disk full/)
  }, 30_000)
})
