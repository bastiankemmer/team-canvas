import * as esbuild from 'esbuild'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ENTRY = 'virtual:canvas-entry'
const SOURCE = 'virtual:canvas-source'
const ENTRY_NS = 'team-canvas-entry'
const SOURCE_NS = 'team-canvas-source'
const BLOCKED_NS = 'team-canvas-blocked'

/** Specifiers a canvas module may import. Anything else, including relative and absolute paths, is rejected. */
const ALLOWED_CANVAS_IMPORTS = new Set([
  'team-canvas/canvas',
  'react',
  'react-dom',
  'react/jsx-runtime',
])

export function isAllowedCanvasImport(specifier: string): boolean {
  return ALLOWED_CANVAS_IMPORTS.has(specifier)
}

function pkgRoot(): string {
  // src/app/build or dist/app/build → package root → always compile from src/
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
}

/** Absolute path to team-canvas SDK barrel (aliased as "team-canvas/canvas"). */
export function defaultSdkPath(): string {
  return path.join(pkgRoot(), 'src/sdk/index.ts')
}

function hooksPath(): string {
  return path.join(pkgRoot(), 'src/sdk/hooks.ts')
}

function stateBridgePath(): string {
  return path.join(pkgRoot(), 'src/client/canvas-state-bridge.ts')
}

export type BundleOk = { ok: true; js: string }
export type BundleErr = { ok: false; error: string }
export type BundleResult = BundleOk | BundleErr

function entryContents(): string {
  return `import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { provideCanvasStateStore } from ${JSON.stringify(hooksPath())};
import {
  createHttpCanvasStateStore,
  readTeamCanvasBoot,
  surfaceViewerWriteError,
} from ${JSON.stringify(stateBridgePath())};
import Canvas from "virtual:canvas-source";
const boot = readTeamCanvasBoot();
if (boot) {
  provideCanvasStateStore(
    createHttpCanvasStateStore(boot, { onWriteError: surfaceViewerWriteError }),
  );
}
const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("Missing #root");
if (typeof Canvas !== "function") {
  throw new Error("Canvas must default-export a React component");
}
createRoot(rootEl).render(createElement(Canvas));
`
}

function blockedImportMessage(specifier: string): string {
  return `Import "${specifier}" is not allowed. Canvas may only import "team-canvas/canvas", "react", "react-dom", or the JSX runtime (react/jsx-runtime). If it targets another canvas module, run: team-canvas convert --from ${specifier} <file>`
}

function virtualCanvasPlugin(source: string, workingDir: string): esbuild.Plugin {
  return {
    name: 'team-canvas-virtual',
    setup(build) {
      build.onResolve({ filter: /^virtual:canvas-entry$/ }, () => ({
        path: ENTRY,
        namespace: ENTRY_NS,
      }))
      build.onResolve({ filter: /^virtual:canvas-source$/ }, () => ({
        path: SOURCE,
        namespace: SOURCE_NS,
      }))
      // Gate every import from author canvas source (not react-dom → scheduler).
      // Relative and absolute specifiers resolve from the package root and would inline server files.
      build.onResolve({ filter: /.*/ }, (args) => {
        if (args.namespace !== SOURCE_NS && args.importer !== SOURCE) {
          return undefined
        }
        if (isAllowedCanvasImport(args.path)) return undefined
        return { path: args.path, namespace: BLOCKED_NS }
      })
      build.onLoad({ filter: /.*/, namespace: BLOCKED_NS }, (args) => ({
        errors: [{ text: blockedImportMessage(args.path) }],
      }))
      build.onLoad({ filter: /.*/, namespace: ENTRY_NS }, () => ({
        loader: 'tsx',
        resolveDir: workingDir,
        contents: entryContents(),
      }))
      build.onLoad({ filter: /.*/, namespace: SOURCE_NS }, () => ({
        loader: 'tsx',
        resolveDir: workingDir,
        contents: source,
      }))
    },
  }
}

/** Exported for CRAP edge tests. */
export function formatEsbuildErrors(err: object): string {
  const errors = (
    err as {
      errors?: Array<{ text?: string; location?: { line: number; column: number } | null }>
    }
  ).errors
  if (!errors?.length) return 'Bundle failed'
  return errors
    .map((e) => `${e.location ? `${e.location.line}:${e.location.column + 1} ` : ''}${e.text ?? 'error'}`)
    .join('\n')
}

/** Exported for CRAP edge tests. */
export function bundleFailureMessage(err: unknown): string {
  if (typeof err === 'object' && err && 'errors' in err) return formatEsbuildErrors(err)
  if (err instanceof Error) return err.message
  return String(err)
}

/**
 * Bundle canvas TSX from store source with "team-canvas/canvas" → SDK barrel.
 * Entry mounts the default export into #root; missing default / bad imports → error.
 */
export async function bundleCanvas(opts: {
  source: string
  sdkPath?: string
  /** Directory whose node_modules resolve react (defaults to package root). */
  workingDir?: string
}): Promise<BundleResult> {
  const sdkPath = opts.sdkPath ?? defaultSdkPath()
  const source = opts.source
  const workingDir = opts.workingDir ?? pkgRoot()

  // ponytail: regex gate before esbuild; ceiling = exotic re-exports; upgrade = esbuild export analysis
  if (!/\bexport\s+default\b/.test(source) && !/\bexport\s*\{[^}]*\bas\s+default\b/.test(source)) {
    return { ok: false, error: 'Canvas must default-export a React component' }
  }

  try {
    const result = await esbuild.build({
      absWorkingDir: workingDir,
      entryPoints: [ENTRY],
      bundle: true,
      write: false,
      minify: true,
      format: 'iife',
      platform: 'browser',
      jsx: 'automatic',
      logLevel: 'silent',
      define: { 'process.env.NODE_ENV': '"production"' },
      alias: { 'team-canvas/canvas': sdkPath },
      nodePaths: [path.join(workingDir, 'node_modules')],
      plugins: [virtualCanvasPlugin(source, workingDir)],
    })
    const js = result.outputFiles?.[0]?.text
    if (!js) return { ok: false, error: 'Bundle produced no output' }
    return { ok: true, js }
  } catch (err) {
    return { ok: false, error: bundleFailureMessage(err) }
  }
}
