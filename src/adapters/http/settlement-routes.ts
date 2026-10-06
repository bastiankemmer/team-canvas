import type http from 'node:http'
import type { CanvasEditOps } from '../../app/edit/canvas-edit-ops.js'
import {
  SettlementError,
  type ErrorKind,
  type IntentInput,
  type LeaseInput,
  type Settlement,
  type TopicStatus,
} from '../../app/settle/settlement.js'
import { settlementShellHtml } from './shell.js'

const STATUSES: TopicStatus[] = ['open', 'escalated', 'settled']
const TOPIC_ACTION = /^\/api\/settlement\/topics\/([^/]+)\/(escalate|settle)$/

type Ctx = {
  settlement: Settlement
  params: URLSearchParams
  body: () => Promise<Record<string, unknown>>
}

function send(res: http.ServerResponse, status: number, body: unknown): void {
  const isText = typeof body === 'string'
  res.writeHead(status, {
    'content-type': isText ? 'text/plain; charset=utf-8' : 'application/json; charset=utf-8',
  })
  res.end(isText ? body : JSON.stringify(body))
}

const optional = (params: URLSearchParams, name: string): string | undefined =>
  params.get(name) || undefined

function statusParam(params: URLSearchParams): TopicStatus | undefined {
  const status = optional(params, 'status')
  if (status !== undefined && !STATUSES.includes(status as TopicStatus)) {
    throw new Error(`status must be one of: ${STATUSES.join(', ')}`)
  }
  return status as TopicStatus | undefined
}

async function parseJson(readBody: () => Promise<string>): Promise<Record<string, unknown>> {
  let parsed: unknown
  try {
    parsed = JSON.parse((await readBody()) || '{}')
  } catch {
    throw new Error('Body must be JSON')
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Body must be a JSON object')
  }
  return parsed as Record<string, unknown>
}

/** A Record, so a new ErrorKind fails to compile until it has a status. */
const STATUS_BY_KIND: Record<ErrorKind, number> = {
  invalid: 400,
  not_found: 404,
  conflict: 409,
  corrupt: 500,
}

/** Status for a refusal from settlement; anything else is the caller's bad request. */
export function settlementStatus(err: unknown): number {
  return err instanceof SettlementError ? STATUS_BY_KIND[err.kind] : 400
}

async function revert({ settlement, body }: Ctx): Promise<unknown> {
  const b = await body()
  let entries = Array.isArray(b.entries) ? b.entries.map(Number) : []
  if (typeof b.topic === 'string') {
    entries = await settlement.entriesToRevert(b.topic)
  }
  if (entries.length === 0 || entries.some((n) => !Number.isInteger(n))) {
    throw new Error('Body must be JSON: {"entries": [1, 2]} or {"topic": "name"}, plus optional "by"')
  }
  return settlement.revert(entries, b.by)
}

async function notices({ settlement, body }: Ctx): Promise<unknown> {
  const { actor } = await body()
  if (typeof actor !== 'string' || !actor.trim()) throw new Error('Body must be JSON: {"actor": "..."}')
  return { notices: await settlement.takeNotices(actor.trim()) }
}

const ROUTES: Record<string, (ctx: Ctx) => unknown> = {
  'GET /api/settlement/topics': ({ settlement, params }) => settlement.listTopics(statusParam(params)),
  'GET /api/settlement/changes': ({ settlement, params }) =>
    settlement.listChanges({
      canvas: optional(params, 'canvas'),
      topic: optional(params, 'topic'),
      actor: optional(params, 'actor'),
      limit: Number(optional(params, 'limit')) || undefined,
    }),
  'GET /api/settlement/leases': ({ settlement }) => settlement.listLeases(),
  'POST /api/settlement/leases/acquire': async ({ settlement, body }) => {
    const b = await body()
    return settlement.acquireLease({ ...b, ttlSeconds: b.ttl_seconds } as LeaseInput)
  },
  'POST /api/settlement/leases/release': async ({ settlement, body }) => {
    const b = await body()
    return settlement.releaseLease({ actor: b.actor, canvas: b.canvas, force: b.force === true })
  },
  'POST /api/settlement/intent': async ({ settlement, body }) => {
    const b = await body()
    return settlement.declareIntent({ ...b, ttlSeconds: b.ttl_seconds } as IntentInput)
  },
  'POST /api/settlement/notices': notices,
  'POST /api/settlement/revert': revert,
}

/** `POST /api/settlement/topics/:topic/(escalate|settle)`: the topic is part of the path. */
async function topicAction(ctx: Ctx, topic: string, action: string): Promise<unknown> {
  const b = await ctx.body()
  if (action === 'escalate') return ctx.settlement.escalate(b.actor, topic)
  return ctx.settlement.settle(topic, b.plan, b.by, b.revert === true)
}

function findHandler(method: string, pathName: string): ((ctx: Ctx) => unknown) | undefined {
  const key = `${method} ${pathName}`
  if (Object.hasOwn(ROUTES, key)) return ROUTES[key]
  const matched = method === 'POST' ? TOPIC_ACTION.exec(pathName) : null
  return matched ? (ctx) => topicAction(ctx, decodeURIComponent(matched[1]!), matched[2]!) : undefined
}

function queryOf(reqUrl: string): URLSearchParams {
  const q = reqUrl.indexOf('?')
  return new URLSearchParams(q < 0 ? '' : reqUrl.slice(q + 1))
}

/**
 * Settlement over HTTP. `settle` and `revert` are the human's: they are not MCP tools,
 * so who may call them is whatever the Auth port lets reach this server.
 * Returns false when the request is not a settlement route.
 */
export async function handleSettlementRoute(
  ops: CanvasEditOps,
  req: http.IncomingMessage,
  res: http.ServerResponse,
  pathName: string,
  readBody: () => Promise<string>,
): Promise<boolean> {
  const method = (req.method ?? 'GET').toUpperCase()
  if (method === 'GET' && pathName === '/settlement') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    res.end(settlementShellHtml(await ops.settlement.listTopics()))
    return true
  }
  const handler = findHandler(method, pathName)
  if (!handler) return false
  const ctx: Ctx = {
    settlement: ops.settlement,
    params: queryOf(req.url ?? ''),
    body: () => parseJson(readBody),
  }
  try {
    send(res, 200, await handler(ctx))
  } catch (err) {
    send(res, settlementStatus(err), err instanceof Error ? err.message : 'Settlement request failed')
  }
  return true
}
