/** Host UI shell HTML (library + canvas viewer). Look owned by design.md. */

import type { LinkTree, LinkTreeNode } from "../../app/edit/canvas-link-tree.js";
import type { TopicView } from "../../app/settle/settlement.js";
import {
  canvasPaletteDark,
  canvasPaletteLight,
} from "../../sdk/canvas-tokens.js";

const chrome = String.raw`
:root {
  --bg: #f0f1f3;
  --text: #18181b;
  --muted: #71717a;
  --border: #e4e4e7;
  --border-soft: #ececef;
  --accent: #1d4ed8;
  --accent-hover: #1e40af;
  --accent-pressed: #1e3a8a;
  --surface: #ffffff;
  --surface-hover: #f8f8fa;
  --error: #b91c1c;
  --on-accent: #ffffff;
  --pad: clamp(1rem, 2.5vw, 2rem);
  --gap: 0.75rem;
  --gap-lg: 1.75rem;
  --radius: 0.625rem;
  --radius-sm: 0.5rem;
  --control-h: 2.375rem;
  --content-max: 76rem;
  --stage-max: 80rem;
  --stage-pad: clamp(1.25rem, 2.5vw, 1.75rem);
  --sidebar-w: 22rem;
  --font: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  --mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  --ease: 140ms ease;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #0e0e10;
    --text: #f4f4f5;
    --muted: #a1a1aa;
    --border: #2a2a30;
    --border-soft: #222228;
    --accent: #3b82f6;
    --accent-hover: #60a5fa;
    --accent-pressed: #2563eb;
    --surface: #18181b;
    --surface-hover: #1f1f24;
    --error: #f87171;
    --on-accent: #ffffff;
  }
}
* { box-sizing: border-box; }
body {
  margin: 0;
  font-family: var(--font);
  font-size: 0.9375rem;
  line-height: 1.45;
  background: var(--bg);
  color: var(--text);
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  -webkit-font-smoothing: antialiased;
}
/* Viewer and library grow with their content; only the editor is pinned to the viewport (its panes scroll). */
body:has(> main.edit-main) { height: 100vh; }
.top {
  flex: 0 0 auto;
  border-bottom: 1px solid var(--border);
  background: var(--surface);
}
.top-inner {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.65rem 1rem;
  padding: 1rem var(--pad);
  width: 100%;
  margin-inline: auto;
  min-height: 4rem;
}
body:has(> main:not(.viewer-main):not(.edit-main)) .top-inner {
  max-width: calc(var(--content-max) + 2 * var(--pad));
}
.brand {
  font-weight: 700;
  font-size: 1rem;
  letter-spacing: -0.03em;
  text-decoration: none;
  color: var(--text);
}
.page-title {
  color: var(--muted);
  font-size: 0.875rem;
  font-weight: 500;
}
.crumb {
  font-size: 0.875rem;
  color: var(--muted);
  min-width: 0;
}
.crumb a {
  color: var(--text);
  text-decoration: none;
  font-weight: 500;
}
.crumb a:hover { color: var(--accent); }
.crumb a:focus-visible,
.brand:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
  border-radius: 2px;
}
.crumb-id { color: var(--text); font-weight: 600; word-break: break-all; }
.top-tools {
  margin-left: auto;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
}
main {
  padding: var(--pad);
  padding-bottom: calc(var(--pad) + 1rem);
  max-width: calc(var(--content-max) + 2 * var(--pad));
  margin-inline: auto;
  flex: 1 1 auto;
  min-height: 0;
  width: 100%;
}
main.viewer-main,
main.edit-main {
  max-width: none;
  margin-inline: 0;
  display: flex;
  flex-direction: column;
  gap: 0;
  padding: 0;
}
.status {
  color: var(--muted);
  font-size: 0.875rem;
  line-height: 1.4;
  margin: 0;
}
.status[data-tone="error"] { color: var(--error); }
.library {
  display: flex;
  flex-direction: column;
  gap: var(--gap-lg);
}
.library-hero {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.5rem 1rem;
  margin: 0.15rem 0 0.25rem;
}
.library-title {
  margin: 0;
  font-size: clamp(1.5rem, 2.2vw, 1.85rem);
  font-weight: 700;
  letter-spacing: -0.035em;
  line-height: 1.15;
}
.library-meta {
  margin: 0;
  font-size: 0.9375rem;
  color: var(--muted);
  font-weight: 500;
}
.library-view {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  align-self: center;
}
.library-view .btn[aria-pressed="true"] {
  background: var(--accent);
  border-color: transparent;
  color: var(--on-accent);
  font-weight: 600;
}
.library-view .btn[aria-pressed="true"]:hover {
  background: var(--accent-hover);
  border-color: transparent;
  color: var(--on-accent);
}
.library-view .btn[aria-pressed="true"]:active {
  background: var(--accent-pressed);
  border-color: transparent;
}
[data-library-panel][hidden] { display: none !important; }
.upload {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
  padding: 1.25rem 1.35rem;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  min-width: 0;
}
.upload-label {
  font-size: 1rem;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--text);
  line-height: 1.2;
}
.upload-actions { margin-top: 0.1rem; }
.btn,
label.btn {
  appearance: none;
  -webkit-appearance: none;
  font: inherit;
  font-size: 0.875rem;
  font-weight: 500;
  height: var(--control-h);
  padding: 0 0.95rem;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--text);
  cursor: pointer;
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.35rem;
  line-height: 1;
  white-space: nowrap;
  vertical-align: middle;
  transition: background var(--ease), border-color var(--ease), color var(--ease), box-shadow var(--ease);
}
a.btn:hover,
label.btn:hover { text-decoration: none; }
.btn:hover,
label.btn:hover {
  background: var(--surface-hover);
  border-color: var(--muted);
  color: var(--text);
}
.btn:active,
label.btn:active {
  background: var(--border-soft);
}
.btn:focus-visible,
label.btn:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
.btn-primary {
  border-color: transparent;
  background: var(--accent);
  color: var(--on-accent);
  font-weight: 600;
}
.btn-primary:hover {
  background: var(--accent-hover);
  border-color: transparent;
  color: var(--on-accent);
}
.btn-primary:active {
  background: var(--accent-pressed);
  border-color: transparent;
  filter: none;
}
.btn-subtle {
  background: transparent;
  border-color: transparent;
  color: var(--muted);
  font-weight: 500;
  padding-inline: 0.7rem;
}
.btn-subtle:hover {
  background: var(--bg);
  border-color: transparent;
  color: var(--text);
}
.btn-subtle:active {
  background: var(--border-soft);
}
.btn-primary:disabled,
.btn:disabled {
  opacity: 0.42;
  cursor: not-allowed;
  filter: none;
  pointer-events: none;
}
.canvas-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(18rem, 1fr));
  gap: 0.85rem;
}
.canvas-list > li:has(> details) { grid-column: 1 / -1; }
.canvas-row {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 1rem;
  min-height: 8.5rem;
  padding: 1.15rem 1.2rem;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  transition: border-color var(--ease), background var(--ease);
}
.canvas-row:hover {
  border-color: var(--muted);
  background: var(--surface-hover);
}
.canvas-card-body {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  min-width: 0;
}
.canvas-id {
  font-weight: 650;
  font-size: 1.05rem;
  letter-spacing: -0.025em;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.canvas-file {
  font-family: var(--mono);
  font-size: 0.75rem;
  color: var(--muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.canvas-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem;
  margin-top: auto;
}
details > .canvas-file {
  display: block;
  margin: 0.2rem 0 0 1.35rem;
}
details > .canvas-actions {
  margin: 0.55rem 0 0.75rem 1.35rem;
}
.copy-feedback {
  font-size: 0.75rem;
  color: var(--muted);
  min-width: 0;
}
.empty-state {
  padding: 2.25rem 1.5rem;
  text-align: center;
  background: var(--surface);
  border: 1px dashed var(--border);
  border-radius: var(--radius);
  color: var(--muted);
  font-size: 0.9375rem;
}
.stage {
  min-height: 12rem;
  border-top: 1px solid var(--border);
  margin: 0;
  padding: 0;
  background: var(--bg);
}
#root {
  min-height: 4rem;
  padding: var(--stage-pad);
  background: ${canvasPaletteLight.editor};
}
@media (prefers-color-scheme: dark) {
  #root { background: ${canvasPaletteDark.editor}; }
}
.viewer-main .status,
.edit-preview .status {
  max-width: calc(var(--stage-max) + 2 * var(--pad));
  margin-inline: auto;
  width: 100%;
  padding: var(--pad) var(--pad) 0;
}
.viewer-main .stage,
.edit-preview .stage {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  border-top: none;
  padding: var(--pad);
}
.viewer-main #root,
.edit-preview #root {
  flex: 1 0 auto;
  width: 100%;
  max-width: var(--stage-max);
  margin-inline: auto;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  min-height: 12rem;
}
.edit-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  grid-template-rows: minmax(0, 1fr);
  grid-template-areas: "code preview";
  flex: 1 1 auto;
  min-height: 0;
  height: 100%;
}
.edit-preview {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  grid-area: preview;
  background: var(--bg);
  overflow-y: auto;
}
.edit-source:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
.top-tools .status {
  flex: 1 0 100%;
  order: 99;
  margin: 0;
  font-size: 0.8125rem;
}
.edit-code-pane {
  grid-area: code;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  border-right: 1px solid var(--border);
  background: var(--surface);
}
.edit-code-pane .edit-source {
  flex: 1 1 auto;
  min-height: 0;
  height: 100%;
  margin: 0;
  padding: 0.85rem;
  border: none;
  border-radius: 0;
  resize: none;
  white-space: pre;
  overflow: auto;
  background: var(--surface);
  color: var(--text);
  font-family: var(--mono);
  font-size: 0.8125rem;
  line-height: 1.45;
}
@media (max-width: 52rem) {
  .edit-layout {
    grid-template-columns: 1fr;
    grid-template-rows: minmax(40vh, 1fr) minmax(40vh, 1fr);
    grid-template-areas: "code" "preview";
    height: auto;
  }
  .edit-preview .stage { min-height: 40vh; }
  .edit-code-pane {
    border-right: none;
    border-bottom: 1px solid var(--border);
    min-height: 40vh;
  }
}
@media (max-width: 28rem) {
  .canvas-actions { width: 100%; }
  .canvas-actions .btn { flex: 1 1 auto; }
  .btn-subtle { flex: 1 1 100%; }
}
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    transition-duration: 0.01ms !important;
  }
}
a { color: var(--accent); }
`.trim()

const canvasPathJs = `function canvasPath(id){return String(id).split("/").map(function(part){return encodeURIComponent(part)}).join("/")}`

const copyShareScript = String.raw`
(function () {
  ${canvasPathJs}
  document.querySelectorAll("[data-copy-share]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var id = btn.getAttribute("data-copy-share");
      if (!id) return;
      var url = location.origin + "/canvas/" + canvasPath(id);
      var host = btn.parentElement;
      var feedback = host && host.querySelector("[data-copy-feedback]");
      function ok() {
        if (feedback) {
          feedback.textContent = "Copied";
          setTimeout(function () { feedback.textContent = ""; }, 1500);
        }
      }
      function fail() {
        if (feedback) feedback.textContent = url;
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(ok, fail);
      } else {
        fail();
      }
    });
  });
})();
`.trim()


const libraryToggleScript = `(function () {
  var buttons = document.querySelectorAll("[data-library-toggle]");
  buttons.forEach(function (btn) {
    btn.addEventListener("click", function () {
      var which = btn.getAttribute("data-library-toggle");
      document.querySelectorAll("[data-library-panel]").forEach(function (panel) {
        panel.hidden = panel.getAttribute("data-library-panel") !== which;
      });
      buttons.forEach(function (other) {
        other.setAttribute("aria-pressed", other === btn ? "true" : "false");
      });
    });
  });
})();`

const codeViewScript = String.raw`
(function () {
  ${canvasPathJs}
  var pane = document.querySelector("[data-edit-source]");
  var statusEl = document.querySelector("[data-edit-status]");
  var root = document.querySelector('[data-shell="edit"]');
  if (!pane || !root) return;
  var id = root.getAttribute("data-canvas-id");
  if (!id) return;
  function setStatus(msg, tone) {
    if (!statusEl) return;
    statusEl.textContent = msg || "";
    if (tone) statusEl.setAttribute("data-tone", tone);
    else statusEl.removeAttribute("data-tone");
  }
  setStatus("Loading…");
  fetch("/api/canvas/" + canvasPath(id) + "/source").then(function (res) {
    if (!res.ok) {
      return res.text().then(function (t) {
        throw new Error(t || ("Load failed (" + res.status + ")"));
      });
    }
    return res.text();
  }).then(function (text) {
    pane.value = text;
    setStatus("");
  }).catch(function (err) {
    setStatus(String(err && err.message ? err.message : err), "error");
  });
})();
`.trim()


function page(
  title: string,
  body: string,
  mainClass = '',
  extraScripts = '',
  headerExtra?: string,
  headExtra = '',
): string {
  const header =
    headerExtra ?? `<span class="page-title">${escapeHtml(title)}</span>`
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${escapeHtml(title)} · team-canvas</title>
${headExtra}<style>${chrome}</style>
</head>
<body>
<header class="top">
  <div class="top-inner">
  <a class="brand" href="/">team-canvas</a>
  ${header}
  </div>
</header>
<main${mainClass ? ` class="${mainClass}"` : ''}>${body}</main>
${extraScripts}
</body>
</html>`
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

/** Each segment is encoded; "/" stays a slash. */
function canvasPath(id: string): string {
  return id.split('/').map((part) => encodeURIComponent(part)).join('/')
}

function canvasHeader(canvasId: string, mode: 'view' | 'edit'): string {
  const safe = escapeHtml(canvasId)
  const enc = canvasPath(canvasId)
  const tools =
    mode === 'view'
      ? `<a class="btn" href="/canvas/${enc}/edit">Code</a>
    <button type="button" class="btn btn-subtle" data-copy-share="${safe}">Copy link</button>
    <span class="copy-feedback" data-copy-feedback aria-live="polite"></span>`
      : `<a class="btn" href="/canvas/${enc}">View</a>
    <p class="status" data-edit-status role="status"></p>`
  return `<nav class="crumb" aria-label="Breadcrumb">
    <a href="/">Canvases</a><span aria-hidden="true"> / </span><span class="crumb-id">${safe}</span>
  </nav>
  <div class="top-tools">${tools}</div>`
}

type LibraryNode =
  | { kind: 'canvas'; name: string; id: string }
  | { kind: 'folder'; name: string; children: LibraryNode[] }

/** Folders exist only as prefixes of listed ids. Sorted by segment at each level. */
function libraryTree(ids: string[]): LibraryNode[] {
  type Bucket = {
    folders: Map<string, Bucket>
    canvases: { name: string; id: string }[]
  }
  const make = (): Bucket => ({ folders: new Map(), canvases: [] })
  const root = make()
  for (const id of ids) {
    const parts = id.split('/')
    let bucket = root
    for (let i = 0; i < parts.length - 1; i++) {
      const seg = parts[i] ?? ''
      let next = bucket.folders.get(seg)
      if (!next) {
        next = make()
        bucket.folders.set(seg, next)
      }
      bucket = next
    }
    bucket.canvases.push({ name: parts[parts.length - 1] ?? id, id })
  }
  const nodes = (bucket: Bucket): LibraryNode[] => {
    const list: LibraryNode[] = [
      ...[...bucket.folders.entries()].map(([name, child]) => ({
        kind: 'folder' as const,
        name,
        children: nodes(child),
      })),
      ...bucket.canvases.map((canvas) => ({ kind: 'canvas' as const, ...canvas })),
    ]
    list.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    return list
  }
  return nodes(root)
}

function canvasActionsHtml(id: string): string {
  const safeId = escapeHtml(id)
  const href = `/canvas/${canvasPath(id)}`
  return `<div class="canvas-actions">
    <a class="btn btn-primary" href="${href}">Open</a>
    <a class="btn" href="${href}/edit">Code</a>
    <button type="button" class="btn btn-subtle" data-copy-share="${safeId}">Copy link</button>
    <span class="copy-feedback" data-copy-feedback aria-live="polite"></span>
  </div>`
}

function canvasRowHtml(name: string, id: string): string {
  const safeName = escapeHtml(name)
  return `<li class="canvas-row">
  <div class="canvas-card-body">
    <span class="canvas-id" title="${safeName}">${safeName}</span>
    <span class="canvas-file">${safeName}.canvas.tsx</span>
  </div>
  ${canvasActionsHtml(id)}
</li>`
}

function missingCanvasHtml(id: string): string {
  const safe = escapeHtml(id)
  return `<li class="canvas-row" data-missing="${safe}">
  <div class="canvas-card-body">
    <span class="canvas-id" title="${safe}">${safe}</span>
    <span class="canvas-file">missing</span>
  </div>
</li>`
}

/** Branch summary is the id only. Actions sit outside it so they do not toggle the disclosure. */
function knowledgeNodeHtml(node: LinkTreeNode, open: boolean): string {
  if (node.missing) return missingCanvasHtml(node.id)
  if (node.children.length === 0) return canvasRowHtml(node.id, node.id)
  const safe = escapeHtml(node.id)
  const kids = node.children.map((child) => knowledgeNodeHtml(child, false)).join('')
  return `<li><details${open ? ' open' : ''}><summary class="canvas-id">${safe}</summary><span class="canvas-file">${safe}.canvas.tsx</span>${canvasActionsHtml(node.id)}<ul class="canvas-list">${kids}</ul></details></li>`
}

function knowledgePanelHtml(tree: LinkTree): string {
  const roots = tree.roots.map((node) => knowledgeNodeHtml(node, true)).join('')
  const unlinked =
    tree.unlinked.length === 0
      ? ''
      : `<li><details${tree.roots.length === 0 ? ' open' : ''}><summary class="canvas-id">Unlinked</summary><ul class="canvas-list">${tree.unlinked.map((id) => canvasRowHtml(id, id)).join('')}</ul></details></li>`
  return `<ul class="canvas-list" data-shell="knowledge" data-library-panel="knowledge" hidden>${roots}${unlinked}</ul>`
}

const libraryToggleHtml = `<div class="library-view" role="group" aria-label="Library view">
  <button type="button" class="btn" data-library-toggle="folders" aria-pressed="true">Folders</button>
  <button type="button" class="btn" data-library-toggle="knowledge" aria-pressed="false">Knowledge</button>
</div>`

function libraryNodesHtml(nodes: LibraryNode[]): string {
  return nodes
    .map((node) => {
      if (node.kind === 'canvas') return canvasRowHtml(node.name, node.id)
      const safe = escapeHtml(node.name)
      return `<li><details><summary class="canvas-id">${safe}</summary><ul class="canvas-list">${libraryNodesHtml(node.children)}</ul></details></li>`
    })
    .join('')
}

/** Index: upload + library from stored canvas ids. A tree adds the Knowledge panel. */
/** Decision cards: a human settles each contested topic by picking one agent's plan. */
export function settlementShellHtml(topics: TopicView[]): string {
  const rank: Record<TopicView['status'], number> = { escalated: 0, open: 1, settled: 2 }
  const sorted = [...topics].sort((a, b) => rank[a.status] - rank[b.status])
  const cards = sorted.map((t) => {
    const positions = t.positions
      .map(
        (p) =>
          `<li><strong>${escapeHtml(p.actor)}</strong>: ${escapeHtml(p.plan)}${p.reason ? ` <span class="status">${escapeHtml(p.reason)}</span>` : ''}${p.live ? '' : ' <span class="status">(expired)</span>'}</li>`,
      )
      .join('')
    const plans = [...new Set(t.positions.map((p) => p.plan))]
    const decision = t.decision
      ? `<p class="status">Decision (${escapeHtml(t.decision.by)}): ${escapeHtml(t.decision.plan)}</p>`
      : ''
    const buttons = plans
      .map(
        (plan) =>
          `<button class="btn btn-primary" type="button" data-settle data-plan="${escapeHtml(plan)}">Go with: ${escapeHtml(plan)}</button>`,
      )
      .join(' ')
    const actions =
      t.status === 'settled'
        ? ''
        : `<div class="upload-actions">${buttons}</div><label class="status"><input type="checkbox" data-revert checked/> Revert writes of the losing plans</label>`
    return `<section class="upload" data-topic="${escapeHtml(t.topic)}"><div class="upload-label">${escapeHtml(t.topic)} · ${t.status}</div><ul>${positions}</ul>${decision}${actions}</section>`
  })
  const body = `<div class="library"><header class="library-hero"><h1 class="library-title">Decisions</h1><p class="library-meta">${topics.length} topic${topics.length === 1 ? '' : 's'}</p></header>${cards.join('') || '<p class="status empty-state">No topics yet. Agents open one with declare_intent.</p>'}<p class="status" data-settle-status role="status"></p></div>`
  const script = `<script>
document.addEventListener('click', function (e) {
  var b = e.target.closest('[data-settle]'); if (!b) return;
  var card = b.closest('[data-topic]');
  var revert = card.querySelector('[data-revert]').checked;
  var status = document.querySelector('[data-settle-status]');
  fetch('/api/settlement/topics/' + encodeURIComponent(card.dataset.topic) + '/settle', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ plan: b.dataset.plan, revert: revert })
  }).then(function (r) {
    if (!r.ok) return r.text().then(function (m) { status.textContent = m; });
    return r.json().then(function (body) {
      var skipped = body && body.skipped;
      if (revert && skipped && skipped.length) {
        status.textContent = skipped.map(function (s) {
          return 'skipped #' + s.n + (s.reason ? ': ' + s.reason : '');
        }).join('; ');
        return;
      }
      location.reload();
    });
  });
});
</script>`
  return page('Decisions', body, '', script, '')
}

function waitingLink(waiting: number): string {
  if (waiting === 0) return ''
  return ` · <a href="/settlement">${waiting} decision${waiting === 1 ? '' : 's'} waiting</a>`
}

export function indexShellHtml(canvasIds: string[], tree?: LinkTree, waiting = 0): string {
  const n = canvasIds.length
  const countLabel = n === 1 ? '1 canvas' : `${n} canvases`
  const folders = libraryNodesHtml(libraryTree(canvasIds))
  const list =
    n === 0
      ? `<p class="status empty-state" data-shell="index">No canvases yet. Agents add them over MCP.</p>`
      : tree
        ? `<ul class="canvas-list" data-shell="index" data-library-panel="folders">${folders}</ul>${knowledgePanelHtml(tree)}`
        : `<ul class="canvas-list" data-shell="index">${folders}</ul>`

  const hero = `<header class="library-hero">
  <h1 class="library-title">Canvases</h1>
  <p class="library-meta">${escapeHtml(countLabel)}${waitingLink(waiting)}</p>${n > 0 && tree ? libraryToggleHtml : ''}
</header>`

  const scripts = `${
    n > 0 && tree ? `<script>${libraryToggleScript}</script>` : ''
  }<script>${copyShareScript}</script>`

  const body = `<div class="library">${hero}${list}</div>`
  return page('Canvases', body, '', scripts, '')
}

export type ViewerPayload =
  | { kind: 'ok'; js: string }
  | { kind: 'error'; message: string }

/** Safe JSON for inline script (avoid `</script>` breakout). */
export function bootJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c')
}

type PreviewParts = { body: string; scripts: string }

/** Preview status strip + stage + boot/bundle/SSE — shared by viewer and edit. */
function previewStageHtml(
  canvasId: string,
  payload: ViewerPayload,
  initialState: Record<string, unknown>,
  shellAttr: string,
): PreviewParts {
  const safeId = escapeHtml(canvasId)
  const status =
    payload.kind === 'error'
      ? `<p class="status" data-tone="error" data-shell="${shellAttr}" data-canvas-id="${safeId}">${escapeHtml(payload.message)}</p>`
      : `<p class="status" data-shell="${shellAttr}" data-canvas-id="${safeId}" hidden></p>`
  const boot = `<script>window.__TEAM_CANVAS__=${bootJson({
    canvasId,
    state: initialState,
  })};</script>`
  const script =
    payload.kind === 'ok' ? `<script>${payload.js}</script>` : ''
  const watch = `<script>
(function () {
  ${canvasPathJs}
  var id = ${JSON.stringify(canvasId)};
  try {
    var es = new EventSource("/api/canvas/" + canvasPath(id) + "/watch");
    es.onmessage = function () {
      location.reload();
    };
  } catch (e) {}
})();
</script>`
  return {
    body: `${status}<div class="stage"><div id="root"></div></div>`,
    scripts: `${boot}${script}${watch}`,
  }
}

/** Viewer: stage + optional error strip; embeds bundle or error. Rebuild via EventSource. */
export function viewerShellHtml(
  canvasId: string,
  payload: ViewerPayload,
  initialState: Record<string, unknown> = {},
): string {
  const preview = previewStageHtml(canvasId, payload, initialState, 'viewer')
  return page(
    canvasId,
    `${preview.body}${preview.scripts}`,
    'viewer-main',
    `<script>${copyShareScript}</script>`,
    canvasHeader(canvasId, 'view'),
  )
}

/** Read-only source next to the live preview. Agents edit over MCP. */
export function editShellHtml(
  canvasId: string,
  payload: ViewerPayload,
  initialState: Record<string, unknown> = {},
): string {
  const safeId = escapeHtml(canvasId)
  const preview = previewStageHtml(canvasId, payload, initialState, 'edit-preview')
  const codePane = `<div class="edit-code-pane" data-shell="edit" data-canvas-id="${safeId}">
  <textarea class="edit-source" data-edit-source readonly spellcheck="false" wrap="off" aria-label="Canvas source"></textarea>
</div>`
  const body = `<div class="edit-layout" id="edit-workspace">${codePane}<div class="edit-preview">${preview.body}</div></div>${preview.scripts}<script>${codeViewScript}</script>`
  return page(
    `Code ${canvasId}`,
    body,
    'edit-main',
    `<script>${copyShareScript}</script>`,
    canvasHeader(canvasId, 'edit'),
  )
}

/** Missing canvas id. */
export function notFoundShellHtml(canvasId: string): string {
  return page(
    'Not found',
    `<p class="status" data-tone="error" data-shell="not-found" data-canvas-id="${escapeHtml(canvasId)}">Canvas not found: <code>${escapeHtml(canvasId)}</code></p>`,
  )
}
