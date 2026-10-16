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
  gap: 0.5rem;
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
.canvas-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem;
  margin-top: auto;
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

/* Nested collapsible folders. Scoped to the library groups so settlement stays plain. */
.md-groups {
  --md-text: #1c1b1f;
  --md-muted: #49454f;
  --md-surface: #fffbfe;
  --md-outline: #79747e;
  --md-primary: #6750a4;
  --md-primary-hover: #5b458f;
  --md-on-primary: #ffffff;
  --chevron-right: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath fill='none' stroke='%23000' stroke-width='2' stroke-linecap='round' stroke-linejoin='round' d='M6 4l4 4-4 4'/%3E%3C/svg%3E");
  --chevron-down: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath fill='none' stroke='%23000' stroke-width='2' stroke-linecap='round' stroke-linejoin='round' d='M4 6l4 4 4-4'/%3E%3C/svg%3E");
  display: flex;
  flex-direction: column;
}
.md-groups > .md-group + .md-group { margin-top: 1.75rem; }
.md-groups .md-path {
  font-family: var(--mono);
  font-size: 0.8125rem;
  font-weight: 600;
  overflow-wrap: anywhere;
}
.md-groups .md-count {
  color: var(--md-muted);
  font-size: 0.75rem;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
}
.md-groups .md-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(16.5rem, 1fr));
  gap: 0.75rem;
  align-items: stretch;
}
.md-groups .md-card {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  min-width: 0;
  height: 100%;
  padding: 1rem;
  background: var(--md-surface);
  border: 1px solid var(--md-outline);
  border-radius: 12px;
  box-shadow: none;
}
.md-groups .md-overline {
  margin: 0;
  font-family: var(--mono);
  font-size: 0.6875rem;
  line-height: 1.35;
  letter-spacing: 0.02em;
  color: var(--md-muted);
  white-space: normal;
  overflow-wrap: anywhere;
}
.md-groups .md-title,
.md-groups a.md-title {
  margin: 0;
  color: var(--md-text);
  text-decoration: none;
  font-size: 1rem;
  font-weight: 500;
  letter-spacing: 0.006em;
  line-height: 1.4;
  overflow-wrap: anywhere;
}
.md-groups a.md-title:hover { text-decoration: underline; }
.md-groups .md-file {
  margin: 0;
  font-family: var(--mono);
  font-size: 0.75rem;
  line-height: 1.45;
  color: var(--md-muted);
  white-space: normal;
  overflow: visible;
  text-overflow: unset;
  overflow-wrap: anywhere;
}
.md-groups .md-card .canvas-actions { margin-top: auto; gap: 0.5rem; }
.md-groups .btn {
  border-radius: 999px;
  height: 2rem;
  font-size: 0.8125rem;
}
.md-groups .btn-primary {
  background: var(--md-primary);
  border-color: transparent;
  color: var(--md-on-primary);
}
.md-groups .btn-primary:hover {
  background: var(--md-primary-hover);
  border-color: transparent;
  color: var(--md-on-primary);
}
.md-groups .md-disclosure {
  appearance: none;
  -webkit-appearance: none;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
  min-height: 2.5rem;
  margin: 0;
  padding: 0.2rem 0.35rem;
  border: 0;
  border-radius: 0.5rem;
  background: transparent;
  color: var(--md-text);
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.md-groups .md-disclosure:hover {
  background: color-mix(in srgb, var(--md-primary) 10%, transparent);
}
.md-groups .md-disclosure:focus-visible {
  outline: 2px solid var(--md-primary);
  outline-offset: 2px;
}
.md-groups .md-chevron {
  flex: 0 0 1.25rem;
  width: 1.25rem;
  height: 1.25rem;
  background-color: currentColor;
  -webkit-mask: var(--chevron-right) center / 0.85rem 0.85rem no-repeat;
  mask: var(--chevron-right) center / 0.85rem 0.85rem no-repeat;
}
.md-groups .md-disclosure[aria-expanded="true"] .md-chevron {
  -webkit-mask-image: var(--chevron-down);
  mask-image: var(--chevron-down);
}
.md-groups .md-disclosure .md-path {
  flex: 1 1 auto;
  min-width: 0;
}
.md-groups .md-disclosure .md-count {
  margin-left: auto;
}
.md-groups .md-subheader {
  display: block;
  margin: 0;
}
.md-groups .md-panel {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  margin-top: 0.35rem;
}
.md-groups .md-panel[hidden] {
  display: none !important;
}
.md-groups .md-children {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-left: 1.25rem;
}
.md-groups .md-children .md-group {
  margin-top: 0;
}
@media (prefers-color-scheme: dark) {
  .md-groups {
    --md-text: #e6e1e5;
    --md-muted: #cac4d0;
    --md-surface: #1c1b1f;
    --md-outline: #938f99;
    --md-primary: #d0bcff;
    --md-primary-hover: #e8def8;
    --md-on-primary: #381e72;
  }
}
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

const materialCollapseScript = `(function () {
  function setOpen(btn, open) {
    btn.setAttribute("aria-expanded", open ? "true" : "false");
    var panel = document.getElementById(btn.getAttribute("aria-controls") || "");
    if (panel) panel.hidden = !open;
  }
  function folderParam() {
    return new URL(window.location.href).searchParams.get("folder") || "";
  }
  function reveal(btn) {
    var group = btn.closest(".md-group");
    while (group) {
      var disclosure = group.querySelector(":scope > .md-subheader .md-disclosure");
      if (disclosure) setOpen(disclosure, true);
      var holder = group.parentElement;
      group = holder ? holder.closest(".md-group") : null;
    }
  }
  function openFolder(folder) {
    document.querySelectorAll(".md-disclosure").forEach(function (btn) { setOpen(btn, false); });
    if (!folder) return;
    document.querySelectorAll(".md-disclosure").forEach(function (btn) {
      if (btn.getAttribute("data-folder") === folder) reveal(btn);
    });
  }
  openFolder(folderParam());
  document.querySelectorAll(".md-disclosure").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var path = btn.getAttribute("data-folder") || "";
      var next = path;
      if (folderParam() === path) {
        var group = btn.closest(".md-group");
        var holder = group && group.parentElement;
        var parentGroup = holder ? holder.closest(".md-group") : null;
        var parentBtn = parentGroup ? parentGroup.querySelector(":scope > .md-subheader .md-disclosure") : null;
        next = parentBtn ? (parentBtn.getAttribute("data-folder") || "") : "";
      }
      var url = new URL(window.location.href);
      if (next) url.searchParams.set("folder", next);
      else url.searchParams.delete("folder");
      history.pushState(null, "", url.pathname + url.search);
      openFolder(next);
    });
  });
  window.addEventListener("popstate", function () { openFolder(folderParam()); });
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

function folderHref(folder: string): string {
  return `/?folder=${encodeURIComponent(folder)}`
}

/** Canvases, then each folder in the id, then the canvas name. Folder crumbs open that folder. */
function canvasBreadcrumb(canvasId: string): string {
  const parts = canvasId.split('/')
  const leaf = parts[parts.length - 1] ?? canvasId
  const folders = parts.slice(0, -1)
  const bits = [`<a href="/">Canvases</a>`]
  for (let i = 0; i < folders.length; i++) {
    const path = folders.slice(0, i + 1).join('/')
    bits.push(`<a href="${folderHref(path)}">${escapeHtml(folders[i] ?? '')}</a>`)
  }
  bits.push(`<span class="crumb-id">${escapeHtml(leaf)}</span>`)
  return `<nav class="crumb" aria-label="Breadcrumb">${bits.join('<span aria-hidden="true"> / </span>')}</nav>`
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
  return `${canvasBreadcrumb(canvasId)}
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

const libraryToggleHtml = `<div class="library-view" role="group" aria-label="Library view">
  <button type="button" class="btn" data-library-toggle="folders" aria-pressed="true">Folders</button>
  <button type="button" class="btn" data-library-toggle="knowledge" aria-pressed="false">Knowledge</button>
</div>`

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

type MaterialCard = { name: string; id: string; missing?: boolean }

function materialCard(card: MaterialCard, overline: string): string {
  const safeOver = escapeHtml(overline)
  const safeName = escapeHtml(card.name)
  const safeId = escapeHtml(card.id)
  if (card.missing) {
    return `<article class="md-card" data-missing="${safeId}"><p class="md-overline">${safeOver}</p><p class="md-title">${safeName}</p><p class="md-file">missing</p></article>`
  }
  const href = `/canvas/${canvasPath(card.id)}`
  return `<article class="md-card"><p class="md-overline">${safeOver}</p><a class="md-title" href="${href}">${safeName}</a><p class="md-file">${safeId}.canvas.tsx</p>${canvasActionsHtml(card.id)}</article>`
}

function cardFolder(id: string): string {
  const cut = id.lastIndexOf('/')
  return cut < 0 ? 'root' : id.slice(0, cut)
}

function leafName(id: string): string {
  const cut = id.lastIndexOf('/')
  return cut < 0 ? id : id.slice(cut + 1)
}

function splitLibrary(nodes: readonly LibraryNode[]): {
  canvases: Extract<LibraryNode, { kind: 'canvas' }>[]
  folders: Extract<LibraryNode, { kind: 'folder' }>[]
} {
  const canvases: Extract<LibraryNode, { kind: 'canvas' }>[] = []
  const folders: Extract<LibraryNode, { kind: 'folder' }>[] = []
  for (const node of nodes) {
    if (node.kind === 'canvas') canvases.push(node)
    else folders.push(node)
  }
  return { canvases, folders }
}

/** The URL folder, or an ancestor of it. Anything else stays collapsed. */
function folderIsOpen(path: string, openFolder: string): boolean {
  return openFolder !== '' && (path === openFolder || openFolder.startsWith(`${path}/`))
}

function linkTreeHas(node: LinkTreeNode, folder: string): boolean {
  return node.id === folder || node.children.some((child) => linkTreeHas(child, folder))
}

/** One tree level. Child folder rows sit in the open panel, not as sibling path chunks. */
function materialCollapseRow(
  label: string,
  count: number,
  cards: MaterialCard[],
  childrenHtml: string,
  shell: 'index' | 'knowledge',
  seq: { n: number },
  folderPath: string,
  open: boolean,
): string {
  const panelId = `md-${shell}-${seq.n}`
  seq.n += 1
  const grid =
    cards.length === 0
      ? ''
      : `<div class="md-grid">${cards.map((card) => materialCard(card, cardFolder(card.id))).join('')}</div>`
  const kids = childrenHtml === '' ? '' : `<div class="md-children">${childrenHtml}</div>`
  const hidden = open ? '' : ' hidden'
  return `<section class="md-group"><h2 class="md-subheader"><button type="button" class="md-disclosure" data-folder="${escapeHtml(folderPath)}" aria-expanded="${open ? 'true' : 'false'}" aria-controls="${panelId}"><span class="md-chevron" aria-hidden="true"></span><span class="md-path">${escapeHtml(label)}</span><span class="md-count">${count}</span></button></h2><div class="md-panel" id="${panelId}"${hidden}>${grid}${kids}</div></section>`
}

function materialCollapseFolder(
  node: Extract<LibraryNode, { kind: 'folder' }>,
  parentPath: string,
  openFolder: string,
  seq: { n: number },
): string {
  const path = parentPath === '' ? node.name : `${parentPath}/${node.name}`
  const { canvases, folders } = splitLibrary(node.children)
  const childrenHtml = folders
    .map((folder) => materialCollapseFolder(folder, path, openFolder, seq))
    .join('')
  return materialCollapseRow(
    `${node.name}/`,
    canvases.length + folders.length,
    canvases.map((canvas) => ({ name: canvas.name, id: canvas.id })),
    childrenHtml,
    'index',
    seq,
    path,
    folderIsOpen(path, openFolder),
  )
}

function materialCollapseFolders(ids: readonly string[], withPanel: boolean, openFolder: string): string {
  const { canvases, folders } = splitLibrary(libraryTree([...ids]))
  const seq = { n: 0 }
  const root =
    canvases.length === 0
      ? ''
      : materialCollapseRow(
          'root/',
          canvases.length,
          canvases.map((canvas) => ({ name: canvas.name, id: canvas.id })),
          '',
          'index',
          seq,
          'root',
          folderIsOpen('root', openFolder),
        )
  const body = folders.map((folder) => materialCollapseFolder(folder, '', openFolder, seq)).join('')
  const panelAttr = withPanel ? ' data-library-panel="folders"' : ''
  return `<div class="md-groups" data-shell="index"${panelAttr}>${root}${body}</div>`
}

function materialCollapseKnowledgeNode(node: LinkTreeNode, openFolder: string, seq: { n: number }): string {
  const leaves: LinkTreeNode[] = []
  const branches: LinkTreeNode[] = []
  for (const child of node.children) {
    if (!child.missing && child.children.length > 0) branches.push(child)
    else leaves.push(child)
  }
  const cards: MaterialCard[] = []
  if (!node.missing) cards.push({ name: leafName(node.id), id: node.id })
  for (const leaf of leaves) cards.push({ name: leafName(leaf.id), id: leaf.id, missing: leaf.missing })
  const childrenHtml = branches
    .map((child) => materialCollapseKnowledgeNode(child, openFolder, seq))
    .join('')
  const open = openFolder !== '' && (node.id === openFolder || node.children.some((child) => linkTreeHas(child, openFolder)))
  return materialCollapseRow(
    node.id,
    cards.length + branches.length,
    cards,
    childrenHtml,
    'knowledge',
    seq,
    node.id,
    open,
  )
}

function materialCollapseKnowledge(tree: LinkTree, openFolder: string): string {
  const seq = { n: 0 }
  const roots = tree.roots.map((node) => materialCollapseKnowledgeNode(node, openFolder, seq)).join('')
  const unlinked =
    tree.unlinked.length === 0
      ? ''
      : materialCollapseRow(
          'Unlinked',
          tree.unlinked.length,
          tree.unlinked.map((id) => ({ name: leafName(id), id })),
          '',
          'knowledge',
          seq,
          'Unlinked',
          openFolder === 'Unlinked',
        )
  return `<div class="md-groups" data-shell="knowledge" data-library-panel="knowledge" hidden>${roots}${unlinked}</div>`
}

export function indexShellHtml(
  canvasIds: string[],
  tree?: LinkTree,
  waiting = 0,
  openFolder = '',
): string {
  const n = canvasIds.length
  const countLabel = n === 1 ? '1 canvas' : `${n} canvases`
  const hero = `<header class="library-hero">
  <h1 class="library-title">Canvases</h1>
  <p class="library-meta">${escapeHtml(countLabel)}${waitingLink(waiting)}</p>${n > 0 && tree ? libraryToggleHtml : ''}
</header>`
  const list =
    n === 0
      ? `<p class="status empty-state" data-shell="index">No canvases yet. Agents add them over MCP.</p>`
      : `${materialCollapseFolders(canvasIds, Boolean(tree), openFolder)}${tree ? materialCollapseKnowledge(tree, openFolder) : ''}`

  const scripts = `${n > 0 && tree ? `<script>${libraryToggleScript}</script>` : ''}${
    n > 0 ? `<script>${materialCollapseScript}</script>` : ''
  }<script>${copyShareScript}</script>`

  return page('Canvases', `<div class="library">${hero}${list}</div>`, '', scripts, '')
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
