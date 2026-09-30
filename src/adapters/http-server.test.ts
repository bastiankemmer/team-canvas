import { EventEmitter } from 'node:events'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { Auth } from '../ports/auth.js'
import type { CanvasStore } from '../ports/canvas-store.js'
import {
  assertReadableRoot,
  attachCleanShutdown,
  DEFAULT_HOST,
  DEFAULT_PORT,
  loadCanvasState,
  startHttpServer,
  type RunningServer,
  parseCanvasUploadName,
} from './http-server.js'
import { LocalFilesystemCanvasStore } from './local-fs-canvas-store.js'
import { parseServeArgs } from '../cli.js'

describe('team-canvas serve', () => {
  const servers: RunningServer[] = []

  afterEach(async () => {
    while (servers.length) {
      const s = servers.pop()
      await s?.close().catch(() => undefined)
    }
  })

  it('@task-6: binds default 0.0.0.0:3847, serves host UI through Auth, SIGINT exits clean', async () => {
    const omitted = parseServeArgs(['serve', '/tmp/canvases'])
    expect(omitted.host).toBe(DEFAULT_HOST)
    expect(omitted.host).toBe('0.0.0.0')
    expect(omitted.port).toBe(DEFAULT_PORT)
    expect(omitted.port).toBe(3847)

    const flagged = parseServeArgs([
      'serve',
      '/tmp/canvases',
      '--host',
      '127.0.0.1',
      '--port',
      '9999',
    ])
    expect(flagged.host).toBe('127.0.0.1')
    expect(flagged.port).toBe(9999)

    const root = await mkdtemp(path.join(tmpdir(), 'team-canvas-serve-'))
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
    expect(indexHtml).toContain('team-canvas')

    const viewer = await fetch(`${server.url}/canvas/demo`)
    expect(viewer.status).toBe(404)
    const viewerHtml = await viewer.text()
    expect(viewerHtml).toContain('data-shell="not-found"')
    expect(viewerHtml).toContain('data-canvas-id="demo"')

    const denyAuth: Auth = { allow: () => false }
    const locked = await startHttpServer({
      root,
      host: '127.0.0.1',
      port: 0,
      auth: denyAuth,
    })
    servers.push(locked)
    const denied = await fetch(`${locked.url}/`)
    expect(denied.status).toBe(401)

    let closed = false
    let exitCode: number | undefined
    const stub = {
      async close() {
        closed = true
      },
    }
    const fakeProc = new EventEmitter() as EventEmitter & {
      exit: (code?: number) => void
    }
    const exited = new Promise<void>((resolve) => {
      fakeProc.exit = (code = 0) => {
        exitCode = code
        resolve()
      }
    })
    const dispose = attachCleanShutdown(
      stub,
      fakeProc as unknown as NodeJS.Process,
    )
    fakeProc.emit('SIGINT')
    await exited
    expect(closed).toBe(true)
    expect(exitCode).toBe(0)
    dispose()
  })

  it('challenger: missing root fails before listen with a clear message', async () => {
    const missing = path.join(tmpdir(), `team-canvas-missing-${Date.now()}`)
    await expect(
      startHttpServer({ root: missing, host: '127.0.0.1', port: 0 }),
    ).rejects.toThrow(/missing or unreadable/)
  })

  it('mutation: non-directory root fails with not-a-directory; ENOENT vs other state errors', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'team-canvas-file-root-'))
    const fileRoot = path.join(root, 'not-a-dir.txt')
    await writeFile(fileRoot, 'nope', 'utf8')
    await expect(assertReadableRoot(fileRoot)).rejects.toThrow(
      /not a directory/,
    )
    await expect(
      startHttpServer({ root: fileRoot, host: '127.0.0.1', port: 0 }),
    ).rejects.toThrow(/not a directory/)

    const enoentStore: CanvasStore = {
      list: async () => [],
      readSource: async () => '',
      writeSource: async () => {},
      readState: async () => {
        const err = new Error('gone') as NodeJS.ErrnoException
        err.code = 'ENOENT'
        throw err
      },
      writeState: async () => {},
    }
    expect(await loadCanvasState(enoentStore, 'x')).toEqual({})

    const otherStore: CanvasStore = {
      list: async () => [],
      readSource: async () => '',
      writeSource: async () => {},
      readState: async () => {
        const err = new Error('permission denied') as NodeJS.ErrnoException
        err.code = 'EACCES'
        throw err
      },
      writeState: async () => {},
    }
    await expect(loadCanvasState(otherStore, 'x')).rejects.toThrow(
      /permission denied/,
    )

    const arrayStore: CanvasStore = {
      list: async () => [],
      readSource: async () => '',
      writeSource: async () => {},
      readState: async () => [1, 2],
      writeState: async () => {},
    }
    await expect(loadCanvasState(arrayStore, 'x')).rejects.toThrow(
      /Corrupt canvas state/,
    )
  })

  it('mutation: routing returns correct status and MIME for index/state/watch/404/405', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'team-canvas-mime-'))
    await writeFile(
      path.join(root, 'demo.canvas.tsx'),
      `export default function Demo() { return null }\n`,
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
    expect(index.headers.get('content-type')).toMatch(/text\/html/)

    const getState = await fetch(`${server.url}/api/canvas/demo/state`)
    expect(getState.status).toBe(200)
    expect(getState.headers.get('content-type')).toMatch(/application\/json/)
    expect(await getState.json()).toEqual({})

    const badJson = await fetch(`${server.url}/api/canvas/demo/state`, {
      method: 'PUT',
      body: '{',
    })
    expect(badJson.status).toBe(400)
    expect(await badJson.text()).toMatch(/valid JSON/)

    const badObj = await fetch(`${server.url}/api/canvas/demo/state`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: '[]',
    })
    expect(badObj.status).toBe(400)
    expect(await badObj.text()).toMatch(/JSON object/)

    const method = await fetch(`${server.url}/api/canvas/demo/state`, {
      method: 'DELETE',
    })
    expect(method.status).toBe(405)

    const watch = await fetch(`${server.url}/api/canvas/demo/watch`)
    expect(watch.status).toBe(200)
    expect(watch.headers.get('content-type')).toMatch(/text\/event-stream/)
    await watch.body?.cancel().catch(() => undefined)

    const missing = await fetch(`${server.url}/nope`)
    expect(missing.status).toBe(404)
    expect(missing.headers.get('content-type')).toMatch(/text\/plain/)
    expect(await missing.text()).toBe('Not found')

    const viewer = await fetch(`${server.url}/canvas/demo`)
    expect(viewer.status).toBe(200)
    expect(viewer.headers.get('content-type')).toMatch(/text\/html/)
  })

  it('challenger: PUT state does not SSE-notify open watchers', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'team-canvas-sse-'))
    await writeFile(
      path.join(root, 'demo.canvas.tsx'),
      `export default function Demo() { return null }\n`,
      'utf8',
    )
    const server = await startHttpServer({
      root,
      host: '127.0.0.1',
      port: 0,
    })
    servers.push(server)

    const watchRes = await fetch(`${server.url}/api/canvas/demo/watch`)
    const reader = watchRes.body!.getReader()
    const dec = new TextDecoder()
    let buf = ''

    const put = await fetch(`${server.url}/api/canvas/demo/state`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ n: 1 }),
    })
    expect(put.status).toBe(204)

    const deadline = Date.now() + 1500
    let saw = false
    while (!saw && Date.now() < deadline) {
      const chunk = await Promise.race([
        reader.read(),
        new Promise<{ done: false; value: undefined }>((r) =>
          setTimeout(() => r({ done: false, value: undefined }), 200),
        ),
      ])
      if (chunk.value) {
        buf += dec.decode(chunk.value)
        saw = /data:\s*rebuild/.test(buf)
      }
    }
    await reader.cancel().catch(() => undefined)
    expect(saw).toBe(false)
  })

  it('mutation: 0.0.0.0 and :: bind hosts map client url to 127.0.0.1', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'team-canvas-loopback-'))
    for (const host of ['0.0.0.0', '::'] as const) {
      const server = await startHttpServer({ root, host, port: 0 })
      servers.push(server)
      expect(server.host).toBe(host)
      expect(server.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/)
      const res = await fetch(`${server.url}/`)
      expect(res.status).toBe(200)
    }
  })

  it('crap:notify: canvas source change SSE-notifies matching watchers', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'team-canvas-sse-src-'))
    const canvasPath = path.join(root, 'demo.canvas.tsx')
    await writeFile(
      canvasPath,
      `export default function Demo() { return null }\n`,
      'utf8',
    )
    const server = await startHttpServer({
      root,
      host: '127.0.0.1',
      port: 0,
    })
    servers.push(server)

    const watchRes = await fetch(`${server.url}/api/canvas/demo/watch`)
    const reader = watchRes.body!.getReader()
    const dec = new TextDecoder()
    let buf = ''

    // Drain the connected comment so subsequent reads are rebuild events.
    {
      const first = await reader.read()
      if (first.value) buf += dec.decode(first.value)
    }

    await writeFile(
      canvasPath,
      `export default function Demo() { return <div/> }\n`,
      'utf8',
    )

    const deadline = Date.now() + 3000
    let saw = /data:\s*rebuild/.test(buf)
    while (!saw && Date.now() < deadline) {
      const chunk = await Promise.race([
        reader.read(),
        new Promise<{ done: false; value: undefined }>((r) =>
          setTimeout(() => r({ done: false, value: undefined }), 150),
        ),
      ])
      if (chunk.value) {
        buf += dec.decode(chunk.value)
        saw = /data:\s*rebuild/.test(buf)
      }
    }
    await reader.cancel().catch(() => undefined)
    expect(saw).toBe(true)
  })

  it('@task-upload: keeps uploaded canvas source and serves it from the store', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'team-canvas-upload-'))
    const server = await startHttpServer({
      root,
      host: '127.0.0.1',
      port: 0,
    })
    servers.push(server)

    const source =
      "export default function Uploaded() { return <div>upload-marker</div> }\n"
    const uploaded = await fetch(`${server.url}/api/canvas`, {
      method: 'POST',
      headers: {
        'content-type': 'text/plain; charset=utf-8',
        'X-Canvas-Name': 'uploaded.canvas.tsx',
      },
      body: source,
    })
    expect(uploaded.status).toBe(201)
    expect(await uploaded.json()).toEqual({ id: 'uploaded' })

    const store = LocalFilesystemCanvasStore(root)
    expect(await store.list()).toEqual(['uploaded'])
    expect(await store.readSource('uploaded')).toBe(source)

    const index = await fetch(`${server.url}/`)
    expect(index.status).toBe(200)
    expect(await index.text()).toContain('uploaded')

    const viewer = await fetch(`${server.url}/canvas/uploaded`)
    expect(viewer.status).toBe(200)
    const viewerHtml = await viewer.text()
    expect(viewerHtml).toContain('data-shell="viewer"')
    expect(viewerHtml).toContain('upload-marker')

    const bad = await fetch(`${server.url}/api/canvas`, {
      method: 'POST',
      headers: {
        'content-type': 'text/plain; charset=utf-8',
        'X-Canvas-Name': '../evil.canvas.tsx',
      },
      body: source,
    })
    expect(bad.status).toBe(400)
    expect(await bad.text()).toMatch(/basename|path|filename/i)
  })

  it('@task-3: GET/PUT source, search, inspect, addOriented, fillSlots via shared ops; missing id is 404; upload/viewer/state/watch unchanged', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'team-canvas-http-edit-'))
    const twoCards = `import { Button, Card, CardBody, CardHeader, Stack, Text } from "team-canvas/canvas";

function onAct() {}

export default function OrientedDemo() {
  return (
    <Stack gap={8}>
      <Card>
        <CardHeader>Alpha</CardHeader>
        <CardBody>
          <Text>Body alpha</Text>
          <Button onClick={onAct}>Go alpha</Button>
        </CardBody>
      </Card>
      <Card>
        <CardHeader>Beta</CardHeader>
        <CardBody>
          <Text>Body beta</Text>
          <Button onClick={onAct}>Go beta</Button>
        </CardBody>
      </Card>
    </Stack>
  );
}
`
    await writeFile(path.join(root, 'cards.canvas.tsx'), twoCards, 'utf8')
    await writeFile(
      path.join(root, 'plain.canvas.tsx'),
      `export default function Plain() { return <div>needle-hit</div> }\n`,
      'utf8',
    )

    const server = await startHttpServer({
      root,
      host: '127.0.0.1',
      port: 0,
    })
    servers.push(server)

    const got = await fetch(`${server.url}/api/canvas/plain/source`)
    expect(got.status).toBe(200)
    expect(got.headers.get('content-type')).toMatch(/text\/plain/)
    expect(await got.text()).toContain('needle-hit')

    const replacement =
      'export default function Plain() { return <div>replaced-via-put</div> }\n'
    const put = await fetch(`${server.url}/api/canvas/plain/source`, {
      method: 'PUT',
      body: replacement,
    })
    expect(put.status).toBe(204)
    const store = LocalFilesystemCanvasStore(root)
    expect(await store.readSource('plain')).toBe(replacement)

    const search = await fetch(
      `${server.url}/api/canvas/plain/search?q=${encodeURIComponent('replaced-via-put')}`,
    )
    expect(search.status).toBe(200)
    expect(await search.json()).toEqual([
      {
        line: 1,
        snippet:
          'export default function Plain() { return <div>replaced-via-put</div> }',
      },
    ])

    const orient = await fetch(`${server.url}/api/canvas/cards/orientation`)
    expect(orient.status).toBe(200)
    expect(await orient.json()).toEqual({ kind: 'Card', addAvailable: true })

    const added = await fetch(`${server.url}/api/canvas/cards/add-oriented`, {
      method: 'POST',
    })
    expect(added.status).toBe(200)
    const { slots } = (await added.json()) as { slots: { id: string }[] }
    expect(slots.length).toBeGreaterThan(0)
    expect((await store.readSource('cards')).match(/<Card>/g)?.length).toBe(3)

    const fills: Record<string, string> = {}
    slots.forEach((s, i) => {
      fills[s.id] = `Filled-${i}`
    })
    const filled = await fetch(`${server.url}/api/canvas/cards/fill-slots`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(fills),
    })
    expect(filled.status).toBe(204)
    const afterFill = await store.readSource('cards')
    expect(afterFill).toContain('Filled-0')

    expect(
      (await fetch(`${server.url}/api/canvas/missing-id/source`)).status,
    ).toBe(404)
    expect(
      (
        await fetch(`${server.url}/api/canvas/missing-id/source`, {
          method: 'PUT',
          body: 'x',
        })
      ).status,
    ).toBe(404)
    expect(
      (await fetch(`${server.url}/api/canvas/missing-id/search?q=x`)).status,
    ).toBe(404)
    expect(
      (await fetch(`${server.url}/api/canvas/missing-id/orientation`)).status,
    ).toBe(404)
    expect(
      (
        await fetch(`${server.url}/api/canvas/missing-id/add-oriented`, {
          method: 'POST',
        })
      ).status,
    ).toBe(404)
    expect(
      (
        await fetch(`${server.url}/api/canvas/missing-id/fill-slots`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: '{}',
        })
      ).status,
    ).toBe(404)

    const emptyQ = await fetch(`${server.url}/api/canvas/plain/search?q=`)
    expect(emptyQ.status).toBe(400)
    expect(await emptyQ.text()).toMatch(/non-empty/i)

    const badId = await fetch(`${server.url}/api/canvas/bad%2Fid/source`)
    expect(badId.status).toBe(400)
    expect(await badId.text()).toMatch(/Invalid canvas id/)

    await writeFile(
      path.join(root, 'solo.canvas.tsx'),
      `import { Card, CardBody, Stack, Text } from "team-canvas/canvas";
export default function Solo() {
  return (
    <Stack>
      <Card><CardBody><Text>Only one</Text></CardBody></Card>
    </Stack>
  );
}
`,
      'utf8',
    )
    const noPattern = await fetch(`${server.url}/api/canvas/solo/add-oriented`, {
      method: 'POST',
    })
    expect(noPattern.status).toBe(400)
    expect(await noPattern.text()).toMatch(/no repeating sibling pattern/i)

    // Existing surfaces still work.
    const upload = await fetch(`${server.url}/api/canvas`, {
      method: 'POST',
      headers: {
        'content-type': 'text/plain; charset=utf-8',
        'X-Canvas-Name': 'extra.canvas.tsx',
      },
      body: 'export default function Extra() { return null }\n',
    })
    expect(upload.status).toBe(201)

    const viewer = await fetch(`${server.url}/canvas/plain`)
    expect(viewer.status).toBe(200)
    expect(await viewer.text()).toContain('replaced-via-put')

    const state = await fetch(`${server.url}/api/canvas/plain/state`)
    expect(state.status).toBe(200)
    expect(await state.json()).toEqual({})

    const watch = await fetch(`${server.url}/api/canvas/plain/watch`)
    expect(watch.status).toBe(200)
    expect(watch.headers.get('content-type')).toMatch(/text\/event-stream/)
    await watch.body?.cancel().catch(() => undefined)
  })

  it('@task-4: GET /canvas/:id/edit serves edit host UI with preview; index has Edit; unknown id is same 404 class as viewer', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'team-canvas-http-edit-ui-'))
    await writeFile(
      path.join(root, 'demo.canvas.tsx'),
      `export default function Demo() { return <div>edit-preview-mark</div> }\n`,
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
    expect(indexHtml).toContain('href="/canvas/demo/edit">Edit</a>')

    const edit = await fetch(`${server.url}/canvas/demo/edit`)
    expect(edit.status).toBe(200)
    expect(edit.headers.get('content-type')).toMatch(/text\/html/)
    const editHtml = await edit.text()
    expect(editHtml).toContain('data-shell="edit"')
    expect(editHtml).toContain('data-edit-chrome')
    expect(editHtml).toContain('data-edit-add')
    expect(editHtml).toContain('data-edit-source')
    expect(editHtml).toContain('edit-preview-mark')
    expect(editHtml).toContain('EventSource')
    expect(editHtml).toContain('/watch')
    expect(editHtml).toContain(JSON.stringify('demo'))
    expect(editHtml).toMatch(/\.stage\s*\{[^}]*padding:\s*0;/s)
    expect(editHtml).toMatch(/#root\s*\{[^}]*padding:\s*0\.75rem;/s)

    const missingEdit = await fetch(`${server.url}/canvas/no-such/edit`)
    expect(missingEdit.status).toBe(404)
    const missingEditHtml = await missingEdit.text()
    expect(missingEditHtml).toContain('data-shell="not-found"')

    const missingViewer = await fetch(`${server.url}/canvas/no-such`)
    expect(missingViewer.status).toBe(404)
    expect(await missingViewer.text()).toContain('data-shell="not-found"')

    // Successful write notifies watch clients (preview reload path).
    const watchRes = await fetch(`${server.url}/api/canvas/demo/watch`)
    expect(watchRes.status).toBe(200)
    const reader = watchRes.body!.getReader()
    const decoder = new TextDecoder()
    let buffered = ''
    const readUntilRebuild = async () => {
      for (;;) {
        const { done, value } = await reader.read()
        if (done) throw new Error('watch closed before rebuild')
        buffered += decoder.decode(value, { stream: true })
        if (buffered.includes('data: rebuild')) return
      }
    }
    const wait = readUntilRebuild()
    const put = await fetch(`${server.url}/api/canvas/demo/source`, {
      method: 'PUT',
      body: `export default function Demo() { return <div>after-save</div> }\n`,
    })
    expect(put.status).toBe(204)
    await wait
    await reader.cancel().catch(() => undefined)
  })
})

describe('parseCanvasUploadName', () => {
  it('crap:parseCanvasUploadName: accepts stem; rejects paths, suffix, unsafe id', () => {
    expect(parseCanvasUploadName('demo.canvas.tsx')).toEqual({
      ok: true,
      id: 'demo',
    })
    expect(parseCanvasUploadName(['demo.canvas.tsx'])).toEqual({
      ok: true,
      id: 'demo',
    })
    expect(parseCanvasUploadName(undefined).ok).toBe(false)
    expect(parseCanvasUploadName('').ok).toBe(false)
    expect(parseCanvasUploadName('  ').ok).toBe(false)
    expect(parseCanvasUploadName('a/b.canvas.tsx').ok).toBe(false)
    expect(parseCanvasUploadName('a\\b.canvas.tsx').ok).toBe(false)
    expect(parseCanvasUploadName('demo.tsx').ok).toBe(false)
    expect(parseCanvasUploadName('../x.canvas.tsx').ok).toBe(false)
    const bad = parseCanvasUploadName('foo..bar.canvas.tsx')
    expect(bad.ok).toBe(false)
    if (!bad.ok) expect(bad.message).toMatch(/Invalid canvas id/i)
  })
})
