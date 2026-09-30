#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  attachCleanShutdown,
  DEFAULT_HOST,
  DEFAULT_PORT,
  startHttpServer,
} from './adapters/http/http-server.js'
import { startMcpStdioServer } from './adapters/mcp/mcp-server.js'
import { convertCanvasSource } from './app/convert/convert-canvas.js'

export const CLI_USAGE = `Usage: team-canvas serve <root> [--host <host>] [--port <port>]
       team-canvas mcp <canvases-root>
       team-canvas convert --from <module> <path>...`

export type ParsedServeArgs = {
  root: string
  host: string
  port: number
}

export type ParsedMcpArgs = {
  root: string
}

export type ParsedConvertArgs = {
  from: string
  paths: string[]
}

function takeFlagValue(rest: string[], i: number, flag: string): [string, number] {
  const value = rest[i + 1]
  if (!value) throw new Error(`${flag} requires a value`)
  return [value, i + 1]
}

function parsePortValue(value: string): number {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid --port: ${value}`)
  }
  return parsed
}

export function parseServeArgs(argv: string[]): ParsedServeArgs {
  if (argv[0] !== 'serve') {
    throw new Error(CLI_USAGE)
  }
  const rest = argv.slice(1)
  let root: string | undefined
  let host = DEFAULT_HOST
  let port = DEFAULT_PORT

  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i]!
    if (arg === '--host') {
      ;[host, i] = takeFlagValue(rest, i, '--host')
      continue
    }
    if (arg === '--port') {
      const [value, next] = takeFlagValue(rest, i, '--port')
      port = parsePortValue(value)
      i = next
      continue
    }
    if (arg.startsWith('-')) throw new Error(`Unknown flag: ${arg}`)
    if (root !== undefined) throw new Error('Unexpected extra argument')
    root = arg
  }

  if (!root) {
    throw new Error(CLI_USAGE)
  }

  return { root, host, port }
}

export function parseMcpArgs(argv: string[]): ParsedMcpArgs {
  if (argv[0] !== 'mcp') {
    throw new Error(CLI_USAGE)
  }
  const rest = argv.slice(1)
  let root: string | undefined
  for (const arg of rest) {
    if (arg.startsWith('-')) throw new Error(`Unknown flag: ${arg}`)
    if (root !== undefined) throw new Error('Unexpected extra argument')
    root = arg
  }
  if (!root) {
    throw new Error(CLI_USAGE)
  }
  return { root }
}

export function parseConvertArgs(argv: string[]): ParsedConvertArgs {
  if (argv[0] !== 'convert') {
    throw new Error(CLI_USAGE)
  }
  const rest = argv.slice(1)
  let from: string | undefined
  const paths: string[] = []
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i]!
    if (arg === '--from') {
      ;[from, i] = takeFlagValue(rest, i, '--from')
      continue
    }
    if (arg.startsWith('-')) throw new Error(`Unknown flag: ${arg}`)
    paths.push(arg)
  }
  if (!from || !paths.length) {
    throw new Error(CLI_USAGE)
  }
  return { from, paths }
}

function collectCanvasFiles(target: string): string[] {
  const st = fs.statSync(target)
  if (st.isFile()) {
    if (!target.endsWith('.canvas.tsx')) {
      throw new Error(`Not a .canvas.tsx file: ${target}`)
    }
    return [target]
  }
  if (!st.isDirectory()) {
    throw new Error(`Not a file or directory: ${target}`)
  }
  const out: string[] = []
  const walk = (dir: string) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      if (ent.name === 'node_modules') continue
      const full = path.join(dir, ent.name)
      if (ent.isDirectory()) walk(full)
      else if (ent.isFile() && ent.name.endsWith('.canvas.tsx')) out.push(full)
    }
  }
  walk(target)
  return out
}

export async function runConvert(from: string, paths: string[]): Promise<{
  converted: number
  unchanged: number
}> {
  let converted = 0
  let unchanged = 0
  for (const p of paths) {
    if (!fs.existsSync(p)) {
      throw new Error(`Path not found: ${p}`)
    }
    for (const file of collectCanvasFiles(p)) {
      const raw = fs.readFileSync(file, 'utf8')
      const { source, changed } = convertCanvasSource(raw, from)
      if (changed) {
        fs.writeFileSync(file, source, 'utf8')
        console.log(`converted ${file}`)
        converted++
      } else {
        unchanged++
      }
    }
  }
  console.log(`${converted} converted, ${unchanged} unchanged`)
  return { converted, unchanged }
}

export async function runCli(argv: string[] = process.argv.slice(2)): Promise<void> {
  const cmd = argv[0]
  if (cmd === 'mcp') {
    const { root } = parseMcpArgs(argv)
    // stderr only — stdout is the MCP JSON-RPC channel
    console.error(`team-canvas mcp stdio (root ${root})`)
    await startMcpStdioServer({ root })
    return
  }
  if (cmd === 'serve') {
    const { root, host, port } = parseServeArgs(argv)
    const server = await startHttpServer({ root, host, port })
    attachCleanShutdown(server)
    console.log(`team-canvas listening on http://${host}:${server.port} (root ${root})`)
    return
  }
  if (cmd === 'convert') {
    const { from, paths } = parseConvertArgs(argv)
    await runConvert(from, paths)
    return
  }
  throw new Error(CLI_USAGE)
}

// realpath: `npx team-canvas` runs through a node_modules/.bin symlink.
const entry = process.argv[1] && fs.realpathSync(process.argv[1])
if (entry && import.meta.url === pathToFileURL(entry).href) {
  runCli().catch((err) => {
    console.error(err instanceof Error ? err.message : err)
    process.exit(1)
  })
}
