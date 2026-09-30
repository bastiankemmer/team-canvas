import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  startHttpServer,
  type RunningServer,
} from './http-server.js'

describe('host UI + canvas bundle pipeline', () => {
  const servers: RunningServer[] = []

  afterEach(async () => {
    while (servers.length) {
      const s = servers.pop()
      await s?.close().catch(() => undefined)
    }
  })

  it('@task-7: lists store canvases, bundles with team-canvas/canvas alias, rebuilds on change, surfaces missing id and bundle errors', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'team-canvas-t7-'))
    const marker = 'task7-hello-marker'
    await writeFile(
      path.join(root, 'hello.canvas.tsx'),
      `import { Stack, Text } from "team-canvas/canvas";
export default function Hello() {
  return (
    <Stack>
      <Text>${marker}</Text>
    </Stack>
  );
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

    const index = await fetch(`${server.url}/`)
    expect(index.status).toBe(200)
    const indexHtml = await index.text()
    expect(indexHtml).toContain('data-shell="index"')
    expect(indexHtml).toContain('/canvas/hello')
    expect(indexHtml).toContain('hello')

    const viewer = await fetch(`${server.url}/canvas/hello`)
    expect(viewer.status).toBe(200)
    const viewerHtml = await viewer.text()
    expect(viewerHtml).toContain('data-shell="viewer"')
    expect(viewerHtml).toContain('data-canvas-id="hello"')
    expect(viewerHtml).toContain('id="root"')
    expect(viewerHtml).toContain(marker)
    // bundled against SDK (alias), not left as bare import
    expect(viewerHtml).not.toMatch(/from\s*["']team-canvas\/canvas["']/)

    const missing = await fetch(`${server.url}/canvas/does-not-exist`)
    expect(missing.status).toBe(404)
    const missingHtml = await missing.text()
    expect(missingHtml).toContain('data-shell="not-found"')
    expect(missingHtml).toContain('does-not-exist')

    await writeFile(
      path.join(root, 'no-default.canvas.tsx'),
      `export function NotDefault() { return null }\n`,
      'utf8',
    )
    const noDefault = await fetch(`${server.url}/canvas/no-default`)
    expect(noDefault.status).toBe(200)
    const noDefaultHtml = await noDefault.text()
    expect(noDefaultHtml).toContain('data-tone="error" data-shell="viewer"')
    expect(noDefaultHtml.toLowerCase()).toMatch(/default-export|default export/)

    await writeFile(
      path.join(root, 'bad-import.canvas.tsx'),
      `import { nope } from "some-missing-package";
export default function Bad() { return <div>{String(nope)}</div> }
`,
      'utf8',
    )
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const bad = await fetch(`${server.url}/canvas/bad-import`)
      expect(bad.status).toBe(200)
      const badHtml = await bad.text()
      expect(badHtml).toContain('data-tone="error" data-shell="viewer"')
      expect(badHtml).toMatch(/Could not resolve ["']some-missing-package["']|some-missing-package/)
      const joined = errorSpy.mock.calls.map((args) => args.map(String).join(' '))
      expect(joined.some((l) => l.includes('bad-import') || l.includes('some-missing-package'))).toBe(
        true,
      )
    } finally {
      errorSpy.mockRestore()
    }

    // rebuild when open canvas file changes
    const rebuildMarker = 'task7-rebuilt-marker'
    const watchRes = await fetch(
      `${server.url}/api/canvas/hello/watch`,
    )
    expect(watchRes.status).toBe(200)
    expect(watchRes.headers.get('content-type')).toMatch(/text\/event-stream/)

    const sseReader = watchRes.body!.getReader()
    const sseText = new TextDecoder()
    let sseBuf = ''
    // drain connect comment
    const first = await Promise.race([
      sseReader.read(),
      new Promise<{ done: true; value?: undefined }>((r) =>
        setTimeout(() => r({ done: true }), 500),
      ),
    ])
    if (first.value) sseBuf += sseText.decode(first.value)

    await writeFile(
      path.join(root, 'hello.canvas.tsx'),
      `import { Stack, Text } from "team-canvas/canvas";
export default function Hello() {
  return (
    <Stack>
      <Text>${rebuildMarker}</Text>
    </Stack>
  );
}
`,
      'utf8',
    )

    const deadline = Date.now() + 5000
    let sawRebuild = /data:\s*rebuild/.test(sseBuf)
    while (!sawRebuild && Date.now() < deadline) {
      const chunk = await Promise.race([
        sseReader.read(),
        new Promise<{ done: false; value: undefined }>((r) =>
          setTimeout(() => r({ done: false, value: undefined }), 200),
        ),
      ])
      if (chunk.value) {
        sseBuf += sseText.decode(chunk.value)
        sawRebuild = /data:\s*rebuild/.test(sseBuf)
      }
    }
    await sseReader.cancel().catch(() => undefined)
    expect(sawRebuild).toBe(true)

    const rebuilt = await fetch(`${server.url}/canvas/hello`)
    const rebuiltHtml = await rebuilt.text()
    expect(rebuiltHtml).toContain(rebuildMarker)
    expect(rebuiltHtml).not.toContain(marker)

    // sidecar write must NOT trigger rebuild notify (avoids reload on useCanvasState persist)
    const watch2 = await fetch(`${server.url}/api/canvas/hello/watch`)
    const reader2 = watch2.body!.getReader()
    const dec2 = new TextDecoder()
    let buf2 = ''
    await writeFile(
      path.join(root, 'hello.canvas.data.json'),
      JSON.stringify({ n: 1 }),
      'utf8',
    )
    const deadline2 = Date.now() + 1500
    let saw2 = false
    while (!saw2 && Date.now() < deadline2) {
      const chunk = await Promise.race([
        reader2.read(),
        new Promise<{ done: false; value: undefined }>((r) =>
          setTimeout(() => r({ done: false, value: undefined }), 200),
        ),
      ])
      if (chunk.value) {
        buf2 += dec2.decode(chunk.value)
        saw2 = /data:\s*rebuild/.test(buf2)
      }
    }
    await reader2.cancel().catch(() => undefined)
    expect(saw2).toBe(false)
  }, 20_000)
})
