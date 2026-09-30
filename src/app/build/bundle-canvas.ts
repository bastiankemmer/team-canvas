import * as esbuild from 'esbuild'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ENTRY = 'virtual:canvas-entry'
const SOURCE = 'virtual:canvas-source'
const ENTRY_NS = 'team-canvas-entry'
const SOURCE_NS = 'team-canvas-source'
const BLOCKED_NS = 'team-canvas-blocked'

/** Bare package imports allowed in canvas bundles (plus relative/absolute paths). */
export function isAllowedCanvasImport(specifier: string): boolean {
  if (specifier === 'team-canvas/canvas') return true
  if (specifier === 'react' || specifier.startsWith('react/')) return true
  if (specifier === 'react-dom' || specifier.startsWith('react-dom/')) return true
  return false
}

/** Exported for mutation/edge tests: virtual:/relative/absolute are not bare packages. */
export function isBarePackageImport(specifier: string): boolean {
  if (specifier.startsWith('virtual:')) return false
  if (specifier.startsWith('.') || specifier.startsWith('/')) return false
  // Windows absolute / UNC — leave to esbuild; canvas sources use posix-style bare pkgs
  if (/^[A-Za-z]:[\\/]/.test(specifier)) return false
  return true
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
      // Gate bare packages imported from author canvas source only (not react-dom → scheduler).
      build.onResolve({ filter: /.*/ }, (args) => {
        if (args.namespace !== SOURCE_NS && args.importer !== SOURCE) {
          return undefined
        }
        if (!isBarePackageImport(args.path)) return undefined
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
  const errors = (err as { errors?: Array<{ text?: string }> }).errors
  if (!errors?.length) return 'Bundle failed'
  return errors.map((e) => e.text ?? 'error').join('\n')
}

/** Exported for CRAP edge tests. */
export function bundleFailureMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  if (typeof err === 'object' && err && 'errors' in err) {
    return formatEsbuildErrors(err)
  }
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

  try {
    const result = await esbuild.build({
      absWorkingDir: workingDir,
      entryPoints: [ENTRY],
      bundle: true,
      write: false,
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
