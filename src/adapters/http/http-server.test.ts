import { EventEmitter } from 'node:events'
import http from 'node:http'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { Auth } from '../../ports/auth.js'
import type { CanvasStore } from '../../ports/canvas-store.js'
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
import { LocalFilesystemCanvasStore } from '../store/local-fs-canvas-store.js'
import { parseServeArgs } from '../../cli.js'
import { createCanvasEditOps } from '../../app/edit/canvas-edit-ops.js'

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
    expect(await orient.json()).toEqual({
      kind: 'Card',
      addAvailable: true,
      slots: [],
    })

    const added = await fetch(`${server.url}/api/canvas/cards/add-oriented`, {
      method: 'POST',
    })
    expect(added.status).toBe(200)
    const addBody = (await added.json()) as {
      ok: boolean
      id: string
      slots: { id: string; label: string }[]
    }
    const { slots } = addBody
    expect(addBody.ok).toBe(true)
    expect(addBody.id).toBe('cards')
    expect(slots.map((s) => s.label)).toEqual([
      'Card header',
      'Text',
      'Button label',
    ])
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
    expect(filled.status).toBe(200)
    expect(await filled.json()).toEqual({ ok: true, id: 'cards', slots: [] })
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
    expect(editHtml).toMatch(/--stage-pad:\s*clamp\(/)
    expect(editHtml).toMatch(/#root\s*\{[^}]*padding:\s*var\(--stage-pad\);/s)

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

  it('@task-new: POST /api/canvas/new creates a starter or given source; 409 on existing, 400 on bad id or body; library has a New form', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'team-canvas-new-'))
    const server = await startHttpServer({ root, host: '127.0.0.1', port: 0 })
    servers.push(server)
    const store = LocalFilesystemCanvasStore(root)
    const post = (body: string) =>
      fetch(`${server.url}/api/canvas/new`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
      })

    const created = await post(JSON.stringify({ id: 'my-canvas' }))
    expect(created.status).toBe(201)
    expect(await created.json()).toEqual({ ok: true, id: 'my-canvas' })
    const starter = await store.readSource('my-canvas')
    expect(starter).toContain('export default function MyCanvas()')
    // The starter renders in the viewer.
    const view = await fetch(`${server.url}/canvas/my-canvas`)
    expect(view.status).toBe(200)
    expect(await view.text()).not.toContain('"kind":"error"')

    const custom = 'export default function C() { return <p>hi</p> }\n'
    expect((await post(JSON.stringify({ id: 'given', source: custom }))).status).toBe(201)
    expect(await store.readSource('given')).toBe(custom)

    const dup = await post(JSON.stringify({ id: 'my-canvas', source: 'x' }))
    expect(dup.status).toBe(409)
    expect(await dup.text()).toMatch(/already exists/)
    expect(await store.readSource('my-canvas')).toBe(starter)

    for (const bad of ['../x', 'a/b', '', '-x', 'a b']) {
      expect((await post(JSON.stringify({ id: bad }))).status, bad).toBe(400)
    }
    expect((await post('not json')).status).toBe(400)
    expect((await post('{}')).status).toBe(400)
    expect(
      (await fetch(`${server.url}/api/canvas/new`, { method: 'GET' })).status,
    ).not.toBe(201)

    const index = await (await fetch(`${server.url}/`)).text()
    expect(index).toContain('data-new-form')
    expect(index).toContain('>New</button>')
    expect(index).toContain('my-canvas')
  })

  it('GET /api/canvas/:id/check returns { ok, id } or { ok: false, id, error }; 404 for unknown canvas', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'team-canvas-check-'))
    const store = LocalFilesystemCanvasStore(root)
    await store.writeSource('good', 'export default function A() { return <div>ok</div> }\n')
    await store.writeSource('bad', 'export default function A() { return <div> }\n')
    const server = await startHttpServer({ root, host: '127.0.0.1', port: 0 })
    servers.push(server)
    const get = async (id: string) => fetch(`${server.url}/api/canvas/${id}/check`)

    expect(await (await get('good')).json()).toEqual({ ok: true, id: 'good' })
    const bad = (await (await get('bad')).json()) as { ok: boolean; error: string }
    expect(bad.ok).toBe(false)
    expect(bad.error).toMatch(/^\d+:\d+ /)
    expect((await get('nope')).status).toBe(404)
  })

  it('@task-replace: POST /api/canvas/:id/replace edits in place (200 { ok, id, replacements }); 400 for ambiguous, missing or bad body; 404 for unknown canvas', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'team-canvas-replace-'))
    const store = LocalFilesystemCanvasStore(root)
    await store.writeSource('doc', 'one two two three\n')
    const server = await startHttpServer({ root, host: '127.0.0.1', port: 0 })
    servers.push(server)
    const post = (id: string, body: string) =>
      fetch(`${server.url}/api/canvas/${id}/replace`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
      })

    const ok = await post('doc', JSON.stringify({ old_string: 'one', new_string: '1' }))
    expect(ok.status).toBe(200)
    expect(await ok.json()).toEqual({ ok: true, id: 'doc', replacements: 1 })
    expect(await store.readSource('doc')).toBe('1 two two three\n')

    const ambiguous = await post('doc', JSON.stringify({ old_string: 'two', new_string: '2' }))
    expect(ambiguous.status).toBe(400)
    expect(await ambiguous.text()).toMatch(/matches 2 places/)
    expect(await store.readSource('doc')).toBe('1 two two three\n')

    const all = await post('doc', JSON.stringify({ old_string: 'two', new_string: '2', replace_all: true }))
    expect(await all.json()).toEqual({ ok: true, id: 'doc', replacements: 2 })
    expect(await store.readSource('doc')).toBe('1 2 2 three\n')

    expect((await post('doc', JSON.stringify({ old_string: 'zzz', new_string: 'x' }))).status).toBe(400)
    expect((await post('doc', JSON.stringify({ old_string: '', new_string: 'x' }))).status).toBe(400)
    expect((await post('doc', JSON.stringify({ old_string: 'a' }))).status).toBe(400)
    expect((await post('doc', 'not json')).status).toBe(400)
    expect((await post('missing-id', JSON.stringify({ old_string: 'a', new_string: 'b' }))).status).toBe(404)
    expect(
      (await fetch(`${server.url}/api/canvas/doc/replace`)).status,
    ).not.toBe(200)
  })

  it('@task-2: GET /api/canvas/:id/links returns the ops array as application/json; missing is 404, bad id is 400, non-GET is 405, no links is []', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'team-canvas-http-links-'))
    const notes = [
      'export default function Notes() {',
      '  return (',
      '    <CanvasLink to="billing">Billing</CanvasLink>',
      '  );',
      '}',
      '',
    ].join('\n')
    await writeFile(path.join(root, 'notes.canvas.tsx'), notes, 'utf8')
    await writeFile(
      path.join(root, 'billing.canvas.tsx'),
      'export default function Billing() { return null }\n',
      'utf8',
    )
    const ops = createCanvasEditOps(LocalFilesystemCanvasStore(root))
    const server = await startHttpServer({ root, host: '127.0.0.1', port: 0 })
    servers.push(server)

    const listed = await ops.listLinks('notes')
    expect(listed).toEqual([
      { to: 'billing', line: 3, label: 'Billing', exists: true },
    ])
    const got = await fetch(`${server.url}/api/canvas/notes/links`)
    expect(got.status).toBe(200)
    expect(got.headers.get('content-type')).toMatch(/application\/json/)
    expect(await got.json()).toEqual(listed)

    const posted = await fetch(`${server.url}/api/canvas/notes/links`, {
      method: 'POST',
    })
    expect(posted.status).toBe(405)

    const missing = await fetch(`${server.url}/api/canvas/absent/links`)
    expect(missing.status).toBe(404)
    expect(await missing.text()).toBe('Not found')

    // fetch resolves %2E%2E before the request, so ".." is sent as a raw path.
    const dotdot = await new Promise<{ status: number; body: string }>(
      (resolve, reject) => {
        const u = new URL(server.url)
        const req = http.request(
          {
            hostname: u.hostname,
            port: u.port,
            path: '/api/canvas/%2E%2E/links',
            method: 'GET',
          },
          (res) => {
            const chunks: Buffer[] = []
            res.on('data', (c: Buffer) => chunks.push(c))
            res.on('end', () =>
              resolve({
                status: res.statusCode ?? 0,
                body: Buffer.concat(chunks).toString('utf8'),
              }),
            )
          },
        )
        req.on('error', reject)
        req.end()
      },
    )
    expect(dotdot.status).toBe(400)
    expect(dotdot.body).toMatch(/Invalid canvas id/)

    for (const id of ['a%2Fb', 'a%5Cb']) {
      const bad = await fetch(`${server.url}/api/canvas/${id}/links`)
      expect(bad.status, id).toBe(400)
      expect(await bad.text()).toMatch(/Invalid canvas id/)
    }

    await writeFile(
      path.join(root, 'notes.canvas.tsx'),
      'export default function Notes() { return <div>no links</div> }\n',
      'utf8',
    )
    const empty = await fetch(`${server.url}/api/canvas/notes/links`)
    expect(empty.status).toBe(200)
    expect(await empty.json()).toEqual([])
  })

  it('@task-3: GET /api/canvas/:id/backlinks returns the ops array as application/json; missing is 404, bad id is 400, non-GET is 405, no links is []', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'team-canvas-http-backlinks-'))
    const a = [
      'export default function A() {',
      '  return (',
      '    <div>',
      '      <CanvasLink to="b">First</CanvasLink>',
      '      <CanvasLink to="b">Second</CanvasLink>',
      '    </div>',
      '  );',
      '}',
      '',
    ].join('\n')
    const c = [
      'export default function C() {',
      '  return <CanvasLink to="b">From C</CanvasLink>;',
      '}',
      '',
    ].join('\n')
    await writeFile(path.join(root, 'a.canvas.tsx'), a, 'utf8')
    await writeFile(
      path.join(root, 'b.canvas.tsx'),
      'export default function B() { return null }\n',
      'utf8',
    )
    await writeFile(path.join(root, 'c.canvas.tsx'), c, 'utf8')
    const ops = createCanvasEditOps(LocalFilesystemCanvasStore(root))
    const server = await startHttpServer({ root, host: '127.0.0.1', port: 0 })
    servers.push(server)

    const listed = await ops.backlinks('b')
    expect(listed.map((row) => row.from).sort()).toEqual(['a', 'a', 'c'])
    const got = await fetch(`${server.url}/api/canvas/b/backlinks`)
    expect(got.status).toBe(200)
    expect(got.headers.get('content-type')).toMatch(/application\/json/)
    expect(await got.json()).toEqual(listed)

    const posted = await fetch(`${server.url}/api/canvas/b/backlinks`, {
      method: 'POST',
    })
    expect(posted.status).toBe(405)

    const missing = await fetch(`${server.url}/api/canvas/absent/backlinks`)
    expect(missing.status).toBe(404)
    expect(await missing.text()).toBe('Not found')

    const dotdot = await new Promise<{ status: number; body: string }>(
      (resolve, reject) => {
        const u = new URL(server.url)
        const req = http.request(
          {
            hostname: u.hostname,
            port: u.port,
            path: '/api/canvas/%2E%2E/backlinks',
            method: 'GET',
          },
          (res) => {
            const chunks: Buffer[] = []
            res.on('data', (c: Buffer) => chunks.push(c))
            res.on('end', () =>
              resolve({
                status: res.statusCode ?? 0,
                body: Buffer.concat(chunks).toString('utf8'),
              }),
            )
          },
        )
        req.on('error', reject)
        req.end()
      },
    )
    expect(dotdot.status).toBe(400)
    expect(dotdot.body).toMatch(/Invalid canvas id/)

    for (const id of ['a%2Fb', 'a%5Cb']) {
      const bad = await fetch(`${server.url}/api/canvas/${id}/backlinks`)
      expect(bad.status, id).toBe(400)
      expect(await bad.text()).toMatch(/Invalid canvas id/)
    }

    const blank = 'export default function X() { return null }\n'
    for (const id of ['a', 'b', 'c']) {
      await writeFile(path.join(root, `${id}.canvas.tsx`), blank, 'utf8')
    }
    const emptyOps = await ops.backlinks('b')
    expect(emptyOps).toEqual([])
    const empty = await fetch(`${server.url}/api/canvas/b/backlinks`)
    expect(empty.status).toBe(200)
    expect(await empty.json()).toEqual(emptyOps)
  })

  it('@task-4: GET /api/canvas/a/search-linked?q=needle returns the ops array as application/json; empty q is 400, missing is 404, non-GET is 405, and no hits is []', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'team-canvas-http-search-linked-'))
    const a = [
      'export default function A() {',
      '  return (',
      '    <div>',
      '      needle on a',
      '      <CanvasLink to="b">B</CanvasLink>',
      '      <CanvasLink to="ghost">Gone</CanvasLink>',
      '      <CanvasLink to="b">Again</CanvasLink>',
      '      <CanvasLink to="e">E</CanvasLink>',
      '    </div>',
      '  );',
      '}',
      '',
    ].join('\n')
    await writeFile(path.join(root, 'a.canvas.tsx'), a, 'utf8')
    await writeFile(
      path.join(root, 'b.canvas.tsx'),
      'const code = "needle";\nexport default function B() {\n  return <span className="needle">x</span>;\n}\n',
      'utf8',
    )
    await writeFile(
      path.join(root, 'c.canvas.tsx'),
      'export default function C() {\n  return <CanvasLink to="a">needle</CanvasLink>;\n}\n',
      'utf8',
    )
    await writeFile(
      path.join(root, 'd.canvas.tsx'),
      'export default function D() {\n  return <div>needle</div>;\n}\n',
      'utf8',
    )
    await writeFile(
      path.join(root, 'e.canvas.tsx'),
      'export default function E() {\n  return <code>needle</code>;\n}\n',
      'utf8',
    )
    const ops = createCanvasEditOps(LocalFilesystemCanvasStore(root))
    const server = await startHttpServer({ root, host: '127.0.0.1', port: 0 })
    servers.push(server)

    const hits = await ops.searchLinked('a', 'needle')
    expect(hits.map((hit) => hit.id)).toEqual(['b', 'b', 'e'])
    const got = await fetch(`${server.url}/api/canvas/a/search-linked?q=needle`)
    expect(got.status).toBe(200)
    expect(got.headers.get('content-type')).toMatch(/application\/json/)
    expect(await got.json()).toEqual(hits)

    const posted = await fetch(`${server.url}/api/canvas/a/search-linked?q=needle`, {
      method: 'POST',
    })
    expect(posted.status).toBe(405)

    const emptyQ = await fetch(`${server.url}/api/canvas/a/search-linked?q=`)
    expect(emptyQ.status).toBe(400)
    expect(await emptyQ.text()).toBe('Search query must be non-empty')

    const noneOps = await ops.searchLinked('a', 'zzzz-no-match')
    expect(noneOps).toEqual([])
    const none = await fetch(`${server.url}/api/canvas/a/search-linked?q=zzzz-no-match`)
    expect(none.status).toBe(200)
    expect(await none.json()).toEqual(noneOps)

    await writeFile(
      path.join(root, 'a.canvas.tsx'),
      'export default function A() { return <div>needle</div> }\n',
      'utf8',
    )
    const emptyOps = await ops.searchLinked('a', 'needle')
    expect(emptyOps).toEqual([])
    const empty = await fetch(`${server.url}/api/canvas/a/search-linked?q=needle`)
    expect(empty.status).toBe(200)
    expect(await empty.json()).toEqual(emptyOps)

    const missing = await fetch(`${server.url}/api/canvas/absent/search-linked?q=needle`)
    expect(missing.status).toBe(404)
    expect(await missing.text()).toBe('Not found')
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
