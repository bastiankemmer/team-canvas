import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import type { Auth } from '../../ports/auth.js'
import type { CanvasStore } from '../../ports/canvas-store.js'
import { bundleCanvas } from '../../app/build/bundle-canvas.js'
import { createCanvasEditOps, type ReplaceResult, type SlotsResult } from '../../app/edit/canvas-edit-ops.js'
import { createAuthAdapter } from '../auth/create-auth.js'
import {
  assertSafeCanvasId,
  LocalFilesystemCanvasStore,
} from '../store/local-fs-canvas-store.js'
import {
  editShellHtml,
  indexShellHtml,
  notFoundShellHtml,
  viewerShellHtml,
} from './shell.js'

export const DEFAULT_HOST = '0.0.0.0'
export const DEFAULT_PORT = 3847

export type ServeOptions = {
  root: string
  host?: string
  port?: number
  auth?: Auth
  store?: CanvasStore
}

export type RunningServer = {
  host: string
  port: number
  root: string
  /** Base URL reachable for HTTP clients (maps 0.0.0.0 → 127.0.0.1). */
  url: string
  close(): Promise<void>
}

function clientHost(bindHost: string): string {
  return bindHost === '0.0.0.0' || bindHost === '::' ? '127.0.0.1' : bindHost
}

/** Fail before listen when root is missing/unreadable (do not swallow into a half-started server). */
export async function assertReadableRoot(root: string): Promise<void> {
  try {
    await fs.promises.access(root, fs.constants.R_OK)
    const st = await fs.promises.stat(root)
    if (!st.isDirectory()) {
      throw new Error(`Canvas root is not a directory: ${root}`)
    }
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('Canvas root is not a directory:')) {
      throw err
    }
    throw new Error(`Canvas root is missing or unreadable: ${root}`)
  }
}

function headersForAuth(
  headers: http.IncomingHttpHeaders,
): Record<string, string | string[] | undefined> {
  return { ...headers }
}

function isMissingState(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as NodeJS.ErrnoException).code === 'ENOENT'
  )
}

function isInvalidCanvasId(err: unknown): boolean {
  return err instanceof Error && /Invalid canvas id/.test(err.message)
}

function queryParam(reqUrl: string, name: string): string {
  const q = reqUrl.indexOf('?')
  if (q < 0) return ''
  return new URLSearchParams(reqUrl.slice(q + 1)).get(name) ?? ''
}

/**
 * Load sidecar state for a canvas. Missing → {}; corrupt / non-object → throws
 * (caller must not wipe the sidecar).
 */
export async function loadCanvasState(
  store: CanvasStore,
  id: string,
): Promise<Record<string, unknown>> {
  try {
    const raw = await store.readState(id)
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new Error(
        `Corrupt canvas state for "${id}": expected a JSON object`,
      )
    }
    return raw as Record<string, unknown>
  } catch (err) {
    if (isMissingState(err)) return {}
    if (err instanceof SyntaxError) {
      throw new Error(`Corrupt canvas state for "${id}": invalid JSON`)
    }
    throw err
  }
}

function readRequestBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => chunks.push(c))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

const CANVAS_UPLOAD_SUFFIX = '.canvas.tsx'

/** Parse X-Canvas-Name: basename ending in .canvas.tsx → store id (stem). */
export function parseCanvasUploadName(
  header: string | string[] | undefined,
): { ok: true; id: string } | { ok: false; message: string } {
  const raw = Array.isArray(header) ? header[0] : header
  const name = typeof raw === 'string' ? raw.trim() : ''
  // Combined path checks — one branch for separators / basename drift.
  if (!name || /[/\\]/.test(name) || name !== path.basename(name)) {
    return {
      ok: false,
      message:
        'X-Canvas-Name must be a single filename ending in .canvas.tsx (no path separators)',
    }
  }
  if (!name.endsWith(CANVAS_UPLOAD_SUFFIX)) {
    return {
      ok: false,
      message: 'X-Canvas-Name must end with .canvas.tsx',
    }
  }
  const id = name.slice(0, -CANVAS_UPLOAD_SUFFIX.length)
  try {
    assertSafeCanvasId(id)
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : 'Invalid canvas name',
    }
  }
  return { ok: true, id }
}

const API_CANVAS_ACTIONS = new Set([
  'state',
  'watch',
  'source',
  'check',
  'replace',
  'search',
  'search-linked',
  'orientation',
  'add-oriented',
  'fill-slots',
  'links',
  'backlinks',
])

type CanvasRoute =
  | { kind: 'api'; rawId: string; action: string }
  | { kind: 'edit'; rawId: string }
  | { kind: 'view'; rawId: string }

/** Editor and each API action before the viewer. Id is the path before that action. */
function matchCanvasRoute(pathName: string): CanvasRoute | null {
  const path = pathName.replace(/\/$/, '')
  if (path.startsWith('/api/canvas/')) {
    const rest = path.slice('/api/canvas/'.length)
    const cut = rest.lastIndexOf('/')
    // No segment before the action: missing id, not a canvas route.
    if (cut <= 0) return null
    const action = rest.slice(cut + 1)
    if (!API_CANVAS_ACTIONS.has(action)) return null
    return { kind: 'api', rawId: rest.slice(0, cut), action }
  }
  if (path.startsWith('/canvas/')) {
    const rest = path.slice('/canvas/'.length)
    const cut = rest.lastIndexOf('/')
    // `/canvas/edit` is the viewer for the flat id `edit`.
    if (cut > 0 && rest.slice(cut + 1) === 'edit') {
      return { kind: 'edit', rawId: rest.slice(0, cut) }
    }
    return { kind: 'view', rawId: rest }
  }
  return null
}

/** One decode. `%2F` / `%5C` in the raw id stay a 400, not a folder separator. */
function resolveCanvasRouteId(
  rawId: string,
): { ok: true; id: string } | { ok: false; message: string } {
  if (/%(?:2[Ff]|5[Cc])/.test(rawId)) {
    return { ok: false, message: `Invalid canvas id "${rawId}"` }
  }
  let id: string
  try {
    id = decodeURIComponent(rawId)
  } catch {
    return { ok: false, message: 'Invalid canvas id' }
  }
  try {
    assertSafeCanvasId(id)
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : 'Invalid canvas id',
    }
  }
  return { ok: true, id }
}

type WatchClient = { res: http.ServerResponse; id: string }

export async function startHttpServer(
  opts: ServeOptions,
): Promise<RunningServer> {
  const host = opts.host ?? DEFAULT_HOST
  const port = opts.port ?? DEFAULT_PORT
  const auth = opts.auth ?? createAuthAdapter()
  const root = opts.root
  const store = opts.store ?? LocalFilesystemCanvasStore(root)
  const ops = createCanvasEditOps(store)

  const bundleCache = new Map<string, { key: string; js: string }>()
  const watchClients = new Set<WatchClient>()
  // Ignore fs.watch noise after our own writeState (Darwin often re-fires sibling .tsx events).
  const suppressNotifyUntil = new Map<string, number>()

  const notify = (id: string) => {
    const until = suppressNotifyUntil.get(id)
    if (until !== undefined && Date.now() < until) return
    writeWatchRebuild(id, watchClients)
  }

  function writeWatchRebuild(canvasId: string, clients: Set<WatchClient>): void {
    for (const client of [...clients]) {
      if (client.id !== canvasId) continue
      try {
        client.res.write(`data: rebuild\n\n`)
      } catch {
        clients.delete(client)
      }
    }
  }

  // Reload viewer only when canvas source changes — not on sidecar writes (useCanvasState persist).
  const invalidate = (filename: string) => {
    const normalized = filename.replace(/\\/g, '/')
    if (!normalized.endsWith(CANVAS_UPLOAD_SUFFIX)) return
    const id = normalized.slice(0, -CANVAS_UPLOAD_SUFFIX.length)
    try {
      assertSafeCanvasId(id)
    } catch {
      return
    }
    bundleCache.delete(id)
    notify(id)
  }

  const quietWatchFor = (id: string, ms = 250) => {
    suppressNotifyUntil.set(id, Date.now() + ms)
  }

  /** Own write: suppress fs.watch echo around the write, then drop bundle + push SSE. */
  async function withOwnSourceWrite<T>(
    id: string,
    write: () => Promise<T>,
  ): Promise<T> {
    quietWatchFor(id)
    const out = await write()
    bundleCache.delete(id)
    writeWatchRebuild(id, watchClients)
    return out
  }

  await assertReadableRoot(root)

  let watcher: fs.FSWatcher | undefined
  watcher = fs.watch(root, { recursive: true, persistent: false }, (_event, filename) => {
    if (typeof filename === 'string') invalidate(filename)
  })

  async function loadBundle(id: string): Promise<
    | { ok: true; js: string }
    | { ok: false; error: string }
  > {
    let source: string
    try {
      source = await store.readSource(id)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[team-canvas] readSource ${id}:`, msg)
      return { ok: false, error: msg }
    }
    const key = source
    const hit = bundleCache.get(id)
    if (hit && hit.key === key) return { ok: true, js: hit.js }

    const result = await bundleCanvas({ source })
    if (!result.ok) {
      console.error(`[team-canvas] bundle ${id}:`, result.error)
      bundleCache.delete(id)
      return result
    }
    bundleCache.set(id, { key, js: result.js })
    return result
  }

  async function canvasExists(id: string): Promise<boolean> {
    const ids = await store.list()
    return ids.includes(id)
  }

  type ShellHtml = (
    id: string,
    payload: Parameters<typeof viewerShellHtml>[1],
    initialState?: Record<string, unknown>,
  ) => string

  /** Shared load-state + bundle path for viewer and edit pages. */
  async function writeCanvasShell(
    res: http.ServerResponse,
    id: string,
    shell: ShellHtml,
  ): Promise<void> {
    if (!(await canvasExists(id))) {
      res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' })
      res.end(notFoundShellHtml(id))
      return
    }

    let initialState: Record<string, unknown> = {}
    try {
      initialState = await loadCanvasState(store, id)
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Failed to read canvas state'
      console.error(`[team-canvas] readState ${id}:`, msg)
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      res.end(shell(id, { kind: 'error', message: msg }, {}))
      return
    }

    const bundled = await loadBundle(id)
    if (!bundled.ok) {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      res.end(
        shell(id, { kind: 'error', message: bundled.error }, initialState),
      )
      return
    }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    res.end(shell(id, { kind: 'ok', js: bundled.js }, initialState))
  }

  const server = http.createServer((req, res) => {
    void (async () => {
      try {
        const allowed = await auth.allow({ headers: headersForAuth(req.headers) })
        if (!allowed) {
          res.writeHead(401, { 'content-type': 'text/plain; charset=utf-8' })
          res.end('Unauthorized')
          return
        }

        const pathName = (req.url ?? '/').split('?')[0] ?? '/'
        const method = (req.method ?? 'GET').toUpperCase()

        if (pathName === '/api/canvas' && method === 'POST') {
          const parsed = parseCanvasUploadName(req.headers['x-canvas-name'])
          if (!parsed.ok) {
            res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' })
            res.end(parsed.message)
            return
          }
          const source = await readRequestBody(req)
          try {
            quietWatchFor(parsed.id)
            await store.writeSource(parsed.id, source)
          } catch (err) {
            const msg =
              err instanceof Error ? err.message : 'Failed to write canvas source'
            console.error(`[team-canvas] writeSource ${parsed.id}:`, msg)
            res.writeHead(isInvalidCanvasId(err) ? 400 : 500, {
              'content-type': 'text/plain; charset=utf-8',
            })
            res.end(msg)
            return
          }
          bundleCache.delete(parsed.id)
          res.writeHead(201, {
            'content-type': 'application/json; charset=utf-8',
          })
          res.end(JSON.stringify({ id: parsed.id }))
          return
        }

        if (pathName === '/api/canvas/new' && method === 'POST') {
          let id = ''
          let source: string | undefined
          try {
            const body = JSON.parse(await readRequestBody(req)) as {
              id?: unknown
              source?: unknown
            }
            id = typeof body.id === 'string' ? body.id : ''
            source = typeof body.source === 'string' ? body.source : undefined
          } catch {
            res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' })
            res.end('Body must be JSON: {"id": "my-canvas", "source"?: "..."}')
            return
          }
          try {
            const created = await withOwnSourceWrite(id, () =>
              ops.createCanvas(id, source),
            )
            res.writeHead(201, {
              'content-type': 'application/json; charset=utf-8',
            })
            res.end(JSON.stringify(created))
          } catch (err) {
            const msg = err instanceof Error ? err.message : 'Failed to create canvas'
            const status = /already exists/.test(msg)
              ? 409
              : isInvalidCanvasId(err)
                ? 400
                : 500
            res.writeHead(status, { 'content-type': 'text/plain; charset=utf-8' })
            res.end(msg)
          }
          return
        }

        if (pathName === '/' || pathName === '/index.html') {
          const ids = await store.list()
          res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
          res.end(indexShellHtml(ids))
          return
        }

        const canvasRoute = matchCanvasRoute(pathName)
        const routedId = canvasRoute
          ? resolveCanvasRouteId(canvasRoute.rawId)
          : null
        if (routedId && !routedId.ok) {
          res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' })
          res.end(routedId.message)
          return
        }
        const routeId = routedId && routedId.ok ? routedId.id : ''

        if (canvasRoute?.kind === 'api' && canvasRoute.action === 'state') {
          const id = routeId
          if (method === 'GET') {
            try {
              const state = await loadCanvasState(store, id)
              res.writeHead(200, {
                'content-type': 'application/json; charset=utf-8',
              })
              res.end(JSON.stringify(state))
            } catch (err) {
              const msg =
                err instanceof Error ? err.message : 'Failed to read canvas state'
              console.error(`[team-canvas] readState ${id}:`, msg)
              res.writeHead(isInvalidCanvasId(err) ? 400 : 500, {
                'content-type': 'text/plain; charset=utf-8',
              })
              res.end(msg)
            }
            return
          }
          if (method === 'PUT' || method === 'POST') {
            const raw = await readRequestBody(req)
            let parsed: unknown
            try {
              parsed = JSON.parse(raw) as unknown
            } catch {
              res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' })
              res.end('State body must be valid JSON')
              return
            }
            if (
              parsed === null ||
              typeof parsed !== 'object' ||
              Array.isArray(parsed)
            ) {
              res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' })
              res.end('State body must be a JSON object')
              return
            }
            try {
              quietWatchFor(id)
              await store.writeState(id, parsed)
            } catch (err) {
              const msg =
                err instanceof Error ? err.message : 'Failed to write canvas state'
              console.error(`[team-canvas] writeState ${id}:`, msg)
              res.writeHead(isInvalidCanvasId(err) ? 400 : 500, {
                'content-type': 'text/plain; charset=utf-8',
              })
              res.end(msg)
              return
            }
            res.writeHead(204)
            res.end()
            return
          }
          res.writeHead(405, { 'content-type': 'text/plain; charset=utf-8' })
          res.end('Method not allowed')
          return
        }

        if (canvasRoute?.kind === 'api' && canvasRoute.action === 'watch') {
          const id = routeId
          res.writeHead(200, {
            'content-type': 'text/event-stream; charset=utf-8',
            'cache-control': 'no-cache',
            connection: 'keep-alive',
          })
          res.write(': connected\n\n')
          const client: WatchClient = { res, id }
          watchClients.add(client)
          req.on('close', () => watchClients.delete(client))
          return
        }

        // Shared edit ops (thin JSON/text over createCanvasEditOps).
        if (
          canvasRoute?.kind === 'api' &&
          canvasRoute.action !== 'state' &&
          canvasRoute.action !== 'watch'
        ) {
          const id = routeId
          const action = canvasRoute.action
          const replyOpsError = (err: unknown, fallback: string) => {
            if (isMissingState(err)) {
              res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
              res.end('Not found')
              return
            }
            const msg = err instanceof Error ? err.message : fallback
            const badClient =
              isInvalidCanvasId(err) ||
              /non-empty|no repeating sibling pattern|unknown or expired|not found in canvas|matches \d+ places/i.test(
                msg,
              )
            res.writeHead(badClient ? 400 : 500, {
              'content-type': 'text/plain; charset=utf-8',
            })
            res.end(msg)
          }

          if (action === 'source' && method === 'GET') {
            try {
              const source = await ops.readSource(id)
              res.writeHead(200, {
                'content-type': 'text/plain; charset=utf-8',
              })
              res.end(source)
            } catch (err) {
              replyOpsError(err, 'Failed to read canvas source')
            }
            return
          }

          if (action === 'check' && method === 'GET') {
            try {
              const checked = await ops.checkCanvas(id)
              res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
              res.end(JSON.stringify(checked))
            } catch (err) {
              replyOpsError(err, 'Failed to check canvas')
            }
            return
          }

          if (action === 'source' && method === 'PUT') {
            if (!(await canvasExists(id))) {
              res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
              res.end('Not found')
              return
            }
            const source = await readRequestBody(req)
            try {
              await withOwnSourceWrite(id, () => ops.writeSource(id, source))
            } catch (err) {
              replyOpsError(err, 'Failed to write canvas source')
              return
            }
            res.writeHead(204)
            res.end()
            return
          }

          if (action === 'search' && method === 'GET') {
            const q = queryParam(req.url ?? '', 'q')
            try {
              const hits = await ops.searchSource(id, q)
              res.writeHead(200, {
                'content-type': 'application/json; charset=utf-8',
              })
              res.end(JSON.stringify(hits))
            } catch (err) {
              replyOpsError(err, 'Failed to search canvas source')
            }
            return
          }

          if (action === 'links' && method === 'GET') {
            try {
              const links = await ops.listLinks(id)
              res.writeHead(200, {
                'content-type': 'application/json; charset=utf-8',
              })
              res.end(JSON.stringify(links))
            } catch (err) {
              replyOpsError(err, 'Failed to list canvas links')
            }
            return
          }

          if (action === 'backlinks' && method === 'GET') {
            try {
              const incoming = await ops.backlinks(id)
              res.writeHead(200, {
                'content-type': 'application/json; charset=utf-8',
              })
              res.end(JSON.stringify(incoming))
            } catch (err) {
              replyOpsError(err, 'Failed to list canvas backlinks')
            }
            return
          }

          if (action === 'search-linked' && method === 'GET') {
            const q = queryParam(req.url ?? '', 'q')
            try {
              const hits = await ops.searchLinked(id, q)
              res.writeHead(200, {
                'content-type': 'application/json; charset=utf-8',
              })
              res.end(JSON.stringify(hits))
            } catch (err) {
              replyOpsError(err, 'Failed to search linked canvases')
            }
            return
          }

          if (action === 'orientation' && method === 'GET') {
            try {
              const info = await ops.inspectOrientation(id)
              res.writeHead(200, {
                'content-type': 'application/json; charset=utf-8',
              })
              res.end(JSON.stringify(info))
            } catch (err) {
              replyOpsError(err, 'Failed to inspect orientation')
            }
            return
          }

          if (action === 'add-oriented' && method === 'POST') {
            try {
              const result = await withOwnSourceWrite(id, () =>
                ops.addOriented(id),
              )
              res.writeHead(200, {
                'content-type': 'application/json; charset=utf-8',
              })
              res.end(JSON.stringify(result))
            } catch (err) {
              replyOpsError(err, 'Failed to add oriented sibling')
            }
            return
          }

          if (action === 'replace' && method === 'POST') {
            let body: { old_string?: unknown; new_string?: unknown; replace_all?: unknown }
            try {
              body = JSON.parse(await readRequestBody(req)) as typeof body
            } catch {
              body = {}
            }
            if (typeof body.old_string !== 'string' || typeof body.new_string !== 'string') {
              res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' })
              res.end('Body must be JSON: {"old_string": "...", "new_string": "...", "replace_all"?: true}')
              return
            }
            const { old_string, new_string } = body
            let replaced: ReplaceResult
            try {
              replaced = await withOwnSourceWrite(id, () =>
                ops.replaceInSource(id, old_string, new_string, body.replace_all === true),
              )
            } catch (err) {
              replyOpsError(err, 'Failed to replace text')
              return
            }
            res.writeHead(200, {
              'content-type': 'application/json; charset=utf-8',
            })
            res.end(JSON.stringify(replaced))
            return
          }

          if (action === 'fill-slots' && method === 'POST') {
            const raw = await readRequestBody(req)
            let parsed: unknown
            try {
              parsed = JSON.parse(raw) as unknown
            } catch {
              res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' })
              res.end('fill-slots body must be valid JSON')
              return
            }
            if (
              parsed === null ||
              typeof parsed !== 'object' ||
              Array.isArray(parsed)
            ) {
              res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' })
              res.end('fill-slots body must be a JSON object of string values')
              return
            }
            const slots: Record<string, string> = {}
            for (const [k, v] of Object.entries(
              parsed as Record<string, unknown>,
            )) {
              if (typeof v !== 'string') {
                res.writeHead(400, {
                  'content-type': 'text/plain; charset=utf-8',
                })
                res.end('fill-slots values must be strings')
                return
              }
              slots[k] = v
            }
            let filled: SlotsResult
            try {
              filled = await withOwnSourceWrite(id, () => ops.fillSlots(id, slots))
            } catch (err) {
              replyOpsError(err, 'Failed to fill slots')
              return
            }
            res.writeHead(200, {
              'content-type': 'application/json; charset=utf-8',
            })
            res.end(JSON.stringify(filled))
            return
          }

          res.writeHead(405, { 'content-type': 'text/plain; charset=utf-8' })
          res.end('Method not allowed')
          return
        }

        if (canvasRoute?.kind === 'edit') {
          await writeCanvasShell(res, routeId, editShellHtml)
          return
        }

        if (canvasRoute?.kind === 'view') {
          await writeCanvasShell(res, routeId, viewerShellHtml)
          return
        }

        res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
        res.end('Not found')
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Internal error'
        console.error('[team-canvas]', msg)
        res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' })
        res.end(msg)
      }
    })()
  })

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, host, () => resolve())
  })

  const address = server.address()
  const boundPort =
    address && typeof address === 'object' ? address.port : port

  return {
    host,
    port: boundPort,
    root,
    url: `http://${clientHost(host)}:${boundPort}`,
    close() {
      watcher?.close()
      for (const client of watchClients) {
        try {
          client.res.end()
        } catch {
          /* ignore */
        }
      }
      watchClients.clear()
      return new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()))
      })
    },
  }
}

/** SIGINT/SIGTERM → close server then exit 0. Returns disposer. */
export function attachCleanShutdown(
  server: { close(): Promise<void> },
  proc: NodeJS.Process = process,
): () => void {
  let shuttingDown = false
  const onSignal = () => {
    if (shuttingDown) return
    shuttingDown = true
    void server
      .close()
      .then(() => {
        proc.exit(0)
      })
      .catch(() => {
        proc.exit(1)
      })
  }
  proc.on('SIGINT', onSignal)
  proc.on('SIGTERM', onSignal)
  return () => {
    proc.off('SIGINT', onSignal)
    proc.off('SIGTERM', onSignal)
  }
}
