import { mkdtemp, readFile, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { LocalFilesystemCanvasStore } from '../store/local-fs-canvas-store.js'
import { startHttpServer, type RunningServer } from './http-server.js'

const src = (label: string) => `export default function C() { return <span>${label}</span> }\n`
const json = { 'content-type': 'application/json' }

describe('settlement over HTTP', () => {
  const servers: RunningServer[] = []
  afterEach(async () => {
    while (servers.length) await servers.pop()?.close().catch(() => undefined)
  })

  async function boot(requireLease = false) {
    const root = await mkdtemp(path.join(tmpdir(), 'team-canvas-settle-http-'))
    await writeFile(path.join(root, 'arch.canvas.tsx'), src('start'), 'utf8')
    const server = await startHttpServer({ root, host: '127.0.0.1', port: 0, requireLease })
    servers.push(server)
    const post = (p: string, body: unknown) =>
      fetch(`${server.url}${p}`, { method: 'POST', headers: json, body: JSON.stringify(body) })
    return { root, server, post }
  }

  it('@task-9: agents declare intent, a human settles on the decision page and the losing write is reverted', async () => {
    const { root, server, post } = await boot()
    const intent = (actor: string, plan: string) => ({ actor, topic: 'db', plan, canvas: 'arch' })

    expect((await (await post('/api/settlement/intent', intent('alice', 'postgres'))).json()).conflict).toBe(false)
    expect((await (await post('/api/settlement/intent', intent('bob', 'mongo'))).json()).conflict).toBe(true)

    // writes carry who/why/topic in headers
    const put = await fetch(`${server.url}/api/canvas/arch/source`, {
      method: 'PUT',
      headers: { 'x-canvas-actor': 'bob', 'x-canvas-reason': 'mongo it is', 'x-canvas-topic': 'db' },
      body: src('mongo'),
    })
    expect(put.status).toBe(204)
    const bad = await fetch(`${server.url}/api/canvas/arch/source`, {
      method: 'PUT',
      headers: { 'x-canvas-topic': 'NOT OK' },
      body: src('x'),
    })
    expect(bad.status).toBe(400)

    const changes = await (await fetch(`${server.url}/api/settlement/changes?topic=db&actor=bob`)).json()
    expect(changes).toMatchObject([{ actor: 'bob', reason: 'mongo it is', tool: 'write_source' }])

    expect((await post('/api/settlement/topics/db/escalate', { actor: 'alice' })).status).toBe(200)
    const index = await (await fetch(`${server.url}/`)).text()
    expect(index).toContain('1 decision waiting')

    const page = await (await fetch(`${server.url}/settlement`)).text()
    expect(page).toContain('db · escalated')
    expect(page).toContain('data-plan="postgres"')
    expect(page).toContain('data-plan="mongo"')

    const settle = await post('/api/settlement/topics/db/settle', { plan: 'postgres', by: 'basti', revert: true })
    const outcome = await settle.json()
    expect(outcome.decision.by).toBe('basti')
    expect(outcome.reverted).toHaveLength(1)
    expect(await readFile(path.join(root, 'arch.canvas.tsx'), 'utf8')).toBe(src('start'))

    const notices = await (await post('/api/settlement/notices', { actor: 'bob' })).json()
    expect(notices.notices.map((n: { kind: string }) => n.kind)).toContain('settled')
    expect((await (await fetch(`${server.url}/api/settlement/topics?status=settled`)).json())[0].topic).toBe('db')
    expect(await (await fetch(`${server.url}/settlement`)).text()).toContain('db · settled')
  })

  it('@task-10: bad requests get a clear status, revert by topic works, other paths fall through', async () => {
    const { server, post } = await boot()
    const status = async (res: Response | Promise<Response>) => (await res).status

    expect(await status(post('/api/settlement/intent', { topic: 'db' }))).toBe(400)
    expect(await status(fetch(`${server.url}/api/settlement/intent`, { method: 'POST', body: 'nope' }))).toBe(400)
    expect(await status(fetch(`${server.url}/api/settlement/intent`, { method: 'POST', body: '[]' }))).toBe(400)
    expect(await status(post('/api/settlement/topics/ghost/settle', { plan: 'x' }))).toBe(404)
    expect(await status(post('/api/settlement/notices', {}))).toBe(400)
    expect(await status(post('/api/settlement/revert', {}))).toBe(400)
    expect(await status(fetch(`${server.url}/api/settlement/topics?status=bogus`))).toBe(400)
    expect(await status(fetch(`${server.url}/api/settlement/changes?limit=2`))).toBe(200)
    expect(await status(fetch(`${server.url}/api/settlement/nothing`))).toBe(404)
    expect(await (await fetch(`${server.url}/settlement`)).text()).toContain('No topics yet')

    await post('/api/settlement/intent', { actor: 'bob', topic: 'db', plan: 'mongo' })
    await fetch(`${server.url}/api/canvas/arch/source`, {
      method: 'PUT',
      headers: { 'x-canvas-actor': 'bob', 'x-canvas-topic': 'db' },
      body: src('mongo'),
    })
    const reverted = await (await post('/api/settlement/revert', { topic: 'db', by: 'basti' })).json()
    expect(reverted.reverted).toHaveLength(1)
    expect((await (await post('/api/settlement/revert', { entries: [1] })).json()).skipped).toHaveLength(1)
  })

  it('a decided topic revert leaves the winning plan on the canvas', async () => {
    const { root, server, post } = await boot()
    const write = (actor: string, body: string) =>
      fetch(`${server.url}/api/canvas/arch/source`, {
        method: 'PUT',
        headers: { 'x-canvas-actor': actor, 'x-canvas-topic': 'db' },
        body,
      })
    await post('/api/settlement/intent', { actor: 'alice', topic: 'db', plan: 'postgres', canvas: 'arch' })
    await post('/api/settlement/intent', { actor: 'bob', topic: 'db', plan: 'mongo', canvas: 'arch' })
    expect((await write('alice', src('postgres'))).status).toBe(204)
    expect((await write('bob', src('mongo'))).status).toBe(204)
    expect((await post('/api/settlement/topics/db/settle', { plan: 'postgres', by: 'basti' })).status).toBe(200)

    const outcome = await (await post('/api/settlement/revert', { topic: 'db', by: 'basti' })).json()
    expect(outcome.reverted).toHaveLength(1)
    expect(await readFile(path.join(root, 'arch.canvas.tsx'), 'utf8')).toBe(src('postgres'))
  })

  it('an open topic revert undoes every write for that topic', async () => {
    const { root, server, post } = await boot()
    const write = (actor: string, body: string) =>
      fetch(`${server.url}/api/canvas/arch/source`, {
        method: 'PUT',
        headers: { 'x-canvas-actor': actor, 'x-canvas-topic': 'db' },
        body,
      })
    await post('/api/settlement/intent', { actor: 'alice', topic: 'db', plan: 'postgres', canvas: 'arch' })
    await post('/api/settlement/intent', { actor: 'bob', topic: 'db', plan: 'mongo', canvas: 'arch' })
    expect((await write('alice', src('postgres'))).status).toBe(204)
    expect((await write('bob', src('mongo'))).status).toBe(204)

    const outcome = await (await post('/api/settlement/revert', { topic: 'db', by: 'basti' })).json()
    expect(outcome.reverted).toHaveLength(2)
    expect(await readFile(path.join(root, 'arch.canvas.tsx'), 'utf8')).toBe(src('start'))
  })

  it('@task-11: a stale lock left by a crashed process is cleared and updates still apply in order', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'team-canvas-lock-'))
    const store = LocalFilesystemCanvasStore(root)
    const lock = path.join(root, 'k.canvas.data.json.lock')
    await writeFile(lock, '', 'utf8')
    const old = new Date(Date.now() - 60_000)
    await utimes(lock, old, old)
    await store.updateState!('k', (cur) => ({ n: ((cur as { n?: number } | undefined)?.n ?? 0) + 1 }))
    await store.updateState!('k', (cur) => ({ n: (cur as { n: number }).n + 1 }))
    expect(await store.readState('k')).toEqual({ n: 2 })
  })

  it('@task-15: strict server: no write without an actor holding the lease, on every write route including upload', async () => {
    const { root, server, post } = await boot(true)
    const put = (actor: string | undefined, body = src('x')) =>
      fetch(`${server.url}/api/canvas/arch/source`, {
        method: 'PUT',
        headers: actor ? { 'x-canvas-actor': actor } : {},
        body,
      })
    const upload = (actor: string) =>
      fetch(`${server.url}/api/canvas`, {
        method: 'POST',
        headers: { 'x-canvas-name': 'arch.canvas.tsx', 'x-canvas-actor': actor },
        body: src('uploaded'),
      })
    const lease = (action: string, body: unknown) => post(`/api/settlement/leases/${action}`, body)
    const onDisk = () => readFile(path.join(root, 'arch.canvas.tsx'), 'utf8')

    expect((await put(undefined)).status).toBe(400) // who are you
    expect((await put('alice')).status).toBe(409) // no lease yet
    expect((await upload('alice')).status).toBe(409)
    expect((await post('/api/canvas/new', { id: 'fresh' })).status).toBe(400)
    expect(await onDisk()).toBe(src('start'))

    expect((await (await lease('acquire', { actor: 'alice', canvas: 'arch' })).json()).acquired).toBe(true)
    const denied = await (await lease('acquire', { actor: 'bob', canvas: 'arch' })).json()
    expect(denied).toMatchObject({ acquired: false, holder: 'alice' })
    expect((await put('bob')).status).toBe(409)
    expect((await upload('bob')).status).toBe(409)
    expect((await put('alice', src('alice'))).status).toBe(204)
    expect((await upload('alice')).status).toBe(201)
    expect(await onDisk()).toBe(src('uploaded'))

    const held = await (await fetch(`${server.url}/api/settlement/leases`)).json()
    expect(held).toMatchObject([{ canvas: 'arch', actor: 'alice', waiters: ['bob'] }])
    expect((await lease('release', { actor: 'bob', canvas: 'arch' })).status).toBe(409)
    expect((await lease('release', { canvas: 'arch', actor: 'basti', force: true })).status).toBe(200)
    expect((await put('alice')).status).toBe(409)

    // the new-canvas route needs a lease on the new id
    await lease('acquire', { actor: 'alice', canvas: 'fresh' })
    const created = await fetch(`${server.url}/api/canvas/new`, {
      method: 'POST',
      headers: { ...json, 'x-canvas-actor': 'alice' },
      body: JSON.stringify({ id: 'fresh' }),
    })
    expect(created.status).toBe(201)
  })
})
