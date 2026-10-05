/** Host UI shell HTML (library + canvas viewer). Look owned by design.md. */

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
.library-intake {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
  align-items: stretch;
}
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
.upload-drop {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.65rem;
  padding: 0.85rem 1rem;
  min-height: calc(var(--control-h) + 1.1rem);
  border: 1px dashed var(--border);
  border-radius: var(--radius-sm);
  background: var(--bg);
  transition: border-color var(--ease), background var(--ease);
}
.upload-drop.is-drag {
  border-color: var(--accent);
  border-style: solid;
  background: var(--surface-hover);
}
.upload-sr {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
.upload-filename {
  font-size: 0.875rem;
  color: var(--muted);
  min-width: 0;
  word-break: break-all;
}
.upload-actions { margin-top: 0.1rem; }
.new-form {
  display: flex;
  flex-wrap: nowrap;
  align-items: stretch;
  gap: 0.5rem;
}
.new-input {
  font: inherit;
  font-size: 0.875rem;
  font-weight: 500;
  height: var(--control-h);
  padding: 0 0.85rem;
  min-width: 0;
  flex: 1 1 auto;
  color: var(--text);
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  transition: border-color var(--ease), background var(--ease);
}
.new-input:hover { border-color: var(--muted); }
.new-input:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
  border-color: var(--accent);
}
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
  grid-template-columns: minmax(0, 1fr) var(--sidebar-w);
  grid-template-rows: minmax(0, 1fr);
  grid-template-areas: "preview chrome";
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
.edit-chrome {
  grid-area: chrome;
  display: flex;
  flex-direction: column;
  gap: var(--gap-lg);
  padding: var(--pad);
  max-width: none;
  overflow: auto;
  border-left: 1px solid var(--border);
  background: var(--surface);
}
.edit-section {
  display: flex;
  flex-direction: column;
  gap: var(--gap);
}
.edit-section-title {
  font-size: 1rem;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--text);
  margin: 0;
}
.edit-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--gap);
}
.edit-orient-meta {
  font-size: 0.875rem;
  color: var(--muted);
}
.edit-slots {
  display: flex;
  flex-direction: column;
  gap: var(--gap);
}
.edit-slot {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}
.edit-slot label {
  font-size: 0.875rem;
  color: var(--text);
  font-weight: 500;
}
.edit-slot-id {
  display: block;
  font-size: 0.75rem;
  font-weight: 400;
  color: var(--muted);
  font-family: var(--mono);
}
.edit-slot input,
.edit-source {
  font: inherit;
  font-size: 0.875rem;
  height: var(--control-h);
  padding: 0 0.75rem;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--bg);
  color: var(--text);
  width: 100%;
  transition: border-color var(--ease);
}
.edit-slot input:hover { border-color: var(--muted); }
.edit-slot input:focus-visible,
.edit-source:focus-visible,
.edit-view-tab:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
.edit-source {
  font-family: var(--mono);
  font-size: 0.8125rem;
  height: auto;
  min-height: 12rem;
  padding: 0.85rem;
  resize: vertical;
  line-height: 1.45;
  border-radius: var(--radius-sm);
}
.edit-view-switch {
  display: inline-flex;
  align-items: center;
  gap: 0.15rem;
  padding: 0.2rem;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--bg);
  height: var(--control-h);
}
.edit-view-tab {
  border: none !important;
  background: transparent;
  color: var(--muted);
  border-radius: calc(var(--radius-sm) - 2px);
  height: calc(var(--control-h) - 0.4rem);
  padding: 0 0.75rem;
  box-shadow: none;
  font-weight: 500;
}
.edit-view-tab:hover {
  color: var(--text);
  background: transparent;
}
.edit-view-tab[aria-selected="true"] {
  color: var(--text);
  background: var(--surface);
  border: 1px solid var(--border) !important;
}
.edit-unsaved {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.8125rem;
  color: var(--muted);
}
.edit-unsaved[hidden] { display: none; }
.edit-unsaved-dot {
  width: 0.45rem;
  height: 0.45rem;
  border-radius: 50%;
  background: var(--accent);
  flex: 0 0 auto;
}
.top-tools .status {
  flex: 1 0 100%;
  order: 99;
  margin: 0;
  font-size: 0.8125rem;
}
.edit-code-pane {
  grid-area: code;
  display: none;
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
  resize: none;
  border: none;
  border-radius: 0;
  white-space: pre;
  overflow: auto;
  background: var(--surface);
}
html[data-edit-mode="code"] .edit-code-pane { display: flex; }
html[data-edit-mode="code"] .edit-chrome { display: none; }
html[data-edit-mode="code"] .edit-layout {
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  grid-template-areas: "code preview";
}
html[data-edit-mode="code"] .edit-code-pane { border-right: 1px solid var(--border); }
@media (max-width: 48rem) {
  .library-intake { grid-template-columns: 1fr; }
  .new-form { flex-wrap: wrap; }
  .new-input { flex: 1 1 100%; }
}
@media (max-width: 52rem) {
  .edit-layout {
    grid-template-columns: 1fr;
    grid-template-rows: minmax(50vh, 1fr) auto;
    grid-template-areas: "preview" "chrome";
    height: auto;
  }
  .edit-preview .stage { min-height: 50vh; }
  .edit-chrome {
    border-left: none;
    border-top: 1px solid var(--border);
  }
  html[data-edit-mode="code"] .edit-layout {
    grid-template-columns: 1fr;
    grid-template-rows: minmax(40vh, 1fr) minmax(40vh, 1fr);
    grid-template-areas: "code" "preview";
  }
  html[data-edit-mode="code"] .edit-code-pane {
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

const libraryScript = String.raw`
(function () {
  ${canvasPathJs}
  var form = document.querySelector("[data-new-form]");
  var input = document.querySelector("[data-new-input]");
  var statusEl = document.querySelector("[data-new-status]");
  if (!form || !input || !statusEl) return;
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var id = input.value.trim().replace(/\.canvas\.tsx$/i, "");
    statusEl.removeAttribute("data-tone");
    if (!id) {
      statusEl.textContent = "Enter a name.";
      statusEl.setAttribute("data-tone", "error");
      return;
    }
    var submit = form.querySelector("[type=submit]");
    if (submit) submit.disabled = true;
    statusEl.textContent = "Creating…";
    fetch("/api/canvas/new", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: id }),
    }).then(function (res) {
      if (res.status === 201) {
        location.href = "/canvas/" + canvasPath(id) + "/edit";
        return;
      }
      return res.text().then(function (body) {
        statusEl.textContent = body || ("Create failed (" + res.status + ").");
        statusEl.setAttribute("data-tone", "error");
        if (submit) submit.disabled = false;
      });
    }).catch(function (err) {
      statusEl.textContent = String(err && err.message ? err.message : err);
      statusEl.setAttribute("data-tone", "error");
      if (submit) submit.disabled = false;
    });
  });
})();
(function () {
  ${canvasPathJs}
  var form = document.querySelector("[data-upload-form]");
  var statusEl = document.querySelector("[data-upload-status]");
  var fileInput = document.querySelector("[data-upload-input]");
  var drop = document.querySelector("[data-upload-drop]");
  var nameEl = document.querySelector("[data-upload-filename]");
  if (!form || !statusEl || !fileInput) return;

  function setStatus(msg, tone) {
    statusEl.textContent = msg || "";
    if (tone) statusEl.setAttribute("data-tone", tone);
    else statusEl.removeAttribute("data-tone");
  }

  function showName(file) {
    if (nameEl) nameEl.textContent = file ? file.name : "No file chosen";
  }

  function assignFile(file) {
    try {
      var dt = new DataTransfer();
      dt.items.add(file);
      fileInput.files = dt.files;
    } catch (e) {}
    showName(file);
  }

  function isCanvasFile(file) {
    return !!(file && /\.canvas\.tsx$/i.test(file.name));
  }

  fileInput.addEventListener("change", function () {
    var f = fileInput.files && fileInput.files[0];
    showName(f || null);
    if (f && !isCanvasFile(f)) setStatus("Name must end with .canvas.tsx.", "error");
    else if (statusEl.getAttribute("data-tone") === "error") setStatus("");
  });

  if (drop) {
    drop.addEventListener("dragover", function (e) {
      e.preventDefault();
      drop.classList.add("is-drag");
    });
    drop.addEventListener("dragleave", function () {
      drop.classList.remove("is-drag");
    });
    drop.addEventListener("drop", function (e) {
      e.preventDefault();
      drop.classList.remove("is-drag");
      var file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (!file) return;
      if (!isCanvasFile(file)) {
        setStatus("Name must end with .canvas.tsx.", "error");
        return;
      }
      assignFile(file);
      setStatus("");
    });
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var file = fileInput.files && fileInput.files[0];
    if (!file) {
      setStatus("Choose a .canvas.tsx file.", "error");
      return;
    }
    if (!/\.canvas\.tsx$/i.test(file.name)) {
      setStatus("Name must end with .canvas.tsx.", "error");
      return;
    }
    var submit = form.querySelector("[type=submit]");
    if (submit) submit.disabled = true;
    setStatus("Uploading…");
    file.text().then(function (text) {
      return fetch("/api/canvas", {
        method: "POST",
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "X-Canvas-Name": file.name,
        },
        body: text,
      }).then(function (res) {
        if (res.status === 201) {
          return res.json().then(function (data) {
            if (data && data.id) {
              location.href = "/canvas/" + canvasPath(data.id);
              return;
            }
            location.reload();
          });
        }
        return res.text().then(function (body) {
          setStatus(body || ("Upload failed (" + res.status + ")."), "error");
        });
      });
    }).catch(function (err) {
      setStatus(String(err && err.message ? err.message : err), "error");
    }).finally(function () {
      if (submit) submit.disabled = false;
    });
  });
})();
`.trim()

const editScript = String.raw`
(function () {
  ${canvasPathJs}
  var root = document.querySelector("[data-edit-chrome]");
  if (!root) return;
  var id = root.getAttribute("data-canvas-id");
  if (!id) return;
  var base = "/api/canvas/" + canvasPath(id);
  var statusEl = document.querySelector("[data-edit-status]");
  var addBtn = root.querySelector("[data-edit-add]");
  var orientMeta = root.querySelector("[data-edit-orient]");
  var slotsEl = root.querySelector("[data-edit-slots]");
  var fillBtn = root.querySelector("[data-edit-fill]");
  var sourceEl = document.querySelector("[data-edit-source]");
  var saveBtn = document.querySelector("[data-edit-save]");
  var hintEl = root.querySelector("[data-edit-slot-hint]");
  var unsavedEl = document.querySelector("[data-edit-unsaved]");
  var tablist = document.querySelector("[data-edit-view-switch]");
  var tabs = tablist ? tablist.querySelectorAll("[data-edit-view]") : [];
  var slotIds = [];
  var orientInfo = null;
  var addAvailable = false;
  var orientLoading = false;
  var savedText = "";
  var dirty = false;

  function setStatus(msg, tone) {
    if (!statusEl) return;
    statusEl.textContent = msg || "";
    if (tone) statusEl.setAttribute("data-tone", tone);
    else statusEl.removeAttribute("data-tone");
  }

  function isDirty() {
    return !!(sourceEl && sourceEl.value !== savedText);
  }

  function syncDirty() {
    dirty = isDirty();
    window.__tcEditDirty = dirty;
    if (unsavedEl) unsavedEl.hidden = !dirty;
    syncAddEnabled();
    if (fillBtn) fillBtn.disabled = dirty || !slotIds.length;
  }

  function modeFromHash() {
    return location.hash === "#code" ? "code" : "ui";
  }

  function applyMode(mode) {
    document.documentElement.setAttribute("data-edit-mode", mode);
    for (var i = 0; i < tabs.length; i++) {
      var tab = tabs[i];
      var on = tab.getAttribute("data-edit-view") === mode;
      tab.setAttribute("aria-selected", on ? "true" : "false");
      tab.tabIndex = on ? 0 : -1;
    }
  }

  function setMode(mode, focusTab) {
    applyMode(mode);
    var next = mode === "code" ? "#code" : "#ui";
    if (location.hash !== next) history.replaceState(null, "", next);
    if (focusTab) {
      for (var i = 0; i < tabs.length; i++) {
        if (tabs[i].getAttribute("data-edit-view") === mode) tabs[i].focus();
      }
    }
  }

  function syncAddEnabled() {
    if (!addBtn) return;
    addBtn.disabled = dirty || orientLoading || !addAvailable;
  }

  function guardDirtyAction() {
    if (!isDirty()) return false;
    setStatus("Save your code changes first", "error");
    return true;
  }

  function renderSlots(slots, opts) {
    opts = opts || {};
    slotIds = (slots || []).map(function (s) { return s.id; });
    if (!slotsEl) return;
    if (hintEl) hintEl.hidden = !slotIds.length;
    if (!slotIds.length) {
      slotsEl.innerHTML = "";
      if (fillBtn) fillBtn.disabled = true;
      return;
    }
    slotsEl.innerHTML = slots.map(function (slot) {
      var sid = slot.id;
      var safe = String(sid).replace(/"/g, "&quot;");
      var label = slot.label || sid;
      var labelSafe = String(label).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
      var ph = label === sid ? "Replacement text" : ("Enter " + label.toLowerCase());
      var phSafe = String(ph).replace(/&/g, "&amp;").replace(/"/g, "&quot;");
      return '<div class="edit-slot"><label for="slot-' + safe + '">' + labelSafe +
        '<span class="edit-slot-id" title="' + safe + '">' + safe + '</span></label>' +
        '<input id="slot-' + safe + '" data-slot-id="' + safe + '" type="text" placeholder="' + phSafe + '" /></div>';
    }).join("");
    if (fillBtn) fillBtn.disabled = dirty;
    var inputs = slotsEl.querySelectorAll("[data-slot-id]");
    if (opts.focus && inputs[0]) inputs[0].focus();
  }

  function applyFills() {
    if (guardDirtyAction()) return;
    if (!fillBtn || fillBtn.disabled) return;
    var fills = {};
    var inputs = slotsEl ? slotsEl.querySelectorAll("[data-slot-id]") : [];
    for (var i = 0; i < inputs.length; i++) {
      var el = inputs[i];
      fills[el.getAttribute("data-slot-id")] = el.value;
    }
    fillBtn.disabled = true;
    setStatus("Filling…");
    fetch(base + "/fill-slots", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fills),
    }).then(function (res) {
      if (res.ok) {
        return res.json().then(function (data) {
          setStatus(data && data.slots && data.slots.length ? "Filled. Some slots are still blank." : "Filled.");
          renderSlots(data && data.slots ? data.slots : []);
          return loadSource();
        });
      }
      return res.text().then(function (t) {
        setStatus(t || ("Fill failed (" + res.status + ")."), "error");
        fillBtn.disabled = false;
      });
    }).catch(function (err) {
      setStatus(String(err && err.message ? err.message : err), "error");
      fillBtn.disabled = false;
    });
  }

  function loadSource() {
    return fetch(base + "/source").then(function (res) {
      if (!res.ok) {
        return res.text().then(function (t) {
          throw new Error(t || ("Load failed (" + res.status + ")"));
        });
      }
      return res.text();
    }).then(function (text) {
      if (sourceEl && isDirty()) return;
      savedText = text;
      if (sourceEl) sourceEl.value = text;
      syncDirty();
    });
  }

  function loadOrientation() {
    orientLoading = true;
    syncAddEnabled();
    if (orientMeta) orientMeta.textContent = "Checking whether Add is available…";
    return fetch(base + "/orientation").then(function (res) {
      if (!res.ok) {
        return res.text().then(function (t) {
          throw new Error(t || ("Orientation failed (" + res.status + ")"));
        });
      }
      return res.json();
    }).then(function (info) {
      orientInfo = info;
      addAvailable = !!(info && info.addAvailable);
      var kind = info && info.kind ? String(info.kind) : null;
      if (orientMeta) {
        if (addAvailable) {
          orientMeta.textContent = "Pattern: " + kind + " — Add available";
        } else if (kind) {
          orientMeta.textContent = "Pattern: " + kind + " — Add unavailable for this canvas";
        } else {
          orientMeta.textContent = "No repeating pattern — Add unavailable";
        }
      }
    }).finally(function () {
      orientLoading = false;
      syncAddEnabled();
    });
  }

  function saveSource() {
    if (!sourceEl || !saveBtn) return;
    saveBtn.disabled = true;
    setStatus("Saving…");
    fetch(base + "/source", {
      method: "PUT",
      headers: { "Content-Type": "text/plain; charset=utf-8" },
      body: sourceEl.value,
    }).then(function (res) {
      if (res.status === 204 || res.ok) {
        savedText = sourceEl.value;
        window.__tcEditDirty = false;
        dirty = false;
        if (unsavedEl) unsavedEl.hidden = true;
        setStatus("Saved.");
        renderSlots([]);
        location.reload();
        return;
      }
      return res.text().then(function (t) {
        setStatus(t || ("Save failed (" + res.status + ")."), "error");
      });
    }).catch(function (err) {
      setStatus(String(err && err.message ? err.message : err), "error");
    }).finally(function () {
      saveBtn.disabled = false;
      syncDirty();
    });
  }

  if (saveBtn && sourceEl) {
    saveBtn.addEventListener("click", saveSource);
  }

  if (sourceEl) {
    sourceEl.addEventListener("input", syncDirty);
    sourceEl.addEventListener("keydown", function (e) {
      if (e.key !== "Tab") return;
      e.preventDefault();
      var start = sourceEl.selectionStart;
      var end = sourceEl.selectionEnd;
      var val = sourceEl.value;
      sourceEl.value = val.slice(0, start) + "  " + val.slice(end);
      sourceEl.selectionStart = sourceEl.selectionEnd = start + 2;
      syncDirty();
    });
  }

  window.addEventListener("beforeunload", function (e) {
    if (!isDirty()) return;
    e.preventDefault();
    e.returnValue = "";
  });

  window.addEventListener("keydown", function (e) {
    if ((e.metaKey || e.ctrlKey) && (e.key === "s" || e.key === "S")) {
      e.preventDefault();
      saveSource();
    }
  });

  applyMode(modeFromHash());
  if (tablist) {
    tablist.addEventListener("click", function (e) {
      var tab = e.target.closest("[data-edit-view]");
      if (!tab) return;
      setMode(tab.getAttribute("data-edit-view") || "ui", false);
    });
    tablist.addEventListener("keydown", function (e) {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight" && e.key !== "Home" && e.key !== "End") return;
      e.preventDefault();
      var list = [];
      for (var t = 0; t < tabs.length; t++) list.push(tabs[t]);
      if (!list.length) return;
      var i = list.indexOf(document.activeElement);
      if (i < 0) {
        for (var n = 0; n < list.length; n++) {
          if (list[n].getAttribute("aria-selected") === "true") i = n;
        }
      }
      var mode;
      if (e.key === "Home") mode = list[0].getAttribute("data-edit-view");
      else if (e.key === "End") mode = list[list.length - 1].getAttribute("data-edit-view");
      else {
        var delta = e.key === "ArrowRight" ? 1 : -1;
        var next = ((i < 0 ? 0 : i) + delta + list.length) % list.length;
        mode = list[next].getAttribute("data-edit-view");
      }
      setMode(mode || "ui", true);
    });
  }
  window.addEventListener("hashchange", function () {
    applyMode(modeFromHash());
  });

  if (addBtn) {
    addBtn.addEventListener("click", function () {
      if (guardDirtyAction()) return;
      if (addBtn.disabled) return;
      addBtn.disabled = true;
      setStatus("Adding…");
      fetch(base + "/add-oriented", { method: "POST" }).then(function (res) {
        if (!res.ok) {
          return res.text().then(function (t) {
            setStatus(t || ("Add failed (" + res.status + ")."), "error");
          });
        }
        return res.json().then(function (data) {
          setStatus("Added.");
          return loadSource().then(function () {
            renderSlots(data && data.slots ? data.slots : [], { focus: true });
          });
        });
      }).catch(function (err) {
        setStatus(String(err && err.message ? err.message : err), "error");
      }).finally(function () {
        loadOrientation();
      });
    });
  }

  if (fillBtn) {
    fillBtn.disabled = true;
    fillBtn.addEventListener("click", applyFills);
  }

  if (slotsEl) {
    slotsEl.addEventListener("keydown", function (e) {
      if (e.key !== "Enter") return;
      var inputs = slotsEl.querySelectorAll("[data-slot-id]");
      if (!inputs.length) return;
      if (e.target === inputs[inputs.length - 1]) {
        e.preventDefault();
        applyFills();
      }
    });
  }

  setStatus("Loading…");
  Promise.all([loadSource(), loadOrientation()]).then(function () {
    var leftover = orientInfo && orientInfo.slots ? orientInfo.slots : [];
    renderSlots(leftover);
    var previewErr = document.querySelector('[data-shell="edit-preview"][data-tone="error"]');
    if (previewErr && previewErr.textContent) {
      setStatus(previewErr.textContent, "error");
    } else {
      setStatus(leftover.length ? "Fill leftover slots, then Apply." : "Ready.");
    }
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
      ? `<a class="btn" href="/canvas/${enc}/edit">Edit</a>
    <button type="button" class="btn btn-subtle" data-copy-share="${safe}">Copy link</button>
    <span class="copy-feedback" data-copy-feedback aria-live="polite"></span>`
      : `<a class="btn" href="/canvas/${enc}">View</a>
    <div class="edit-view-switch" role="tablist" aria-label="Editor view" data-edit-view-switch>
      <button type="button" class="btn edit-view-tab" role="tab" id="edit-tab-ui" data-edit-view="ui" aria-controls="edit-workspace" aria-selected="true" tabindex="0">UI</button>
      <button type="button" class="btn edit-view-tab" role="tab" id="edit-tab-code" data-edit-view="code" aria-controls="edit-workspace" aria-selected="false" tabindex="-1">Code</button>
    </div>
    <span class="edit-unsaved" data-edit-unsaved hidden><span class="edit-unsaved-dot" aria-hidden="true"></span> Unsaved</span>
    <button type="button" class="btn btn-primary" data-edit-save>Save source</button>
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

function canvasRowHtml(name: string, id: string): string {
  const safeName = escapeHtml(name)
  const safeId = escapeHtml(id)
  const href = `/canvas/${canvasPath(id)}`
  return `<li class="canvas-row">
  <div class="canvas-card-body">
    <span class="canvas-id" title="${safeName}">${safeName}</span>
    <span class="canvas-file">${safeName}.canvas.tsx</span>
  </div>
  <div class="canvas-actions">
    <a class="btn btn-primary" href="${href}">Open</a>
    <a class="btn" href="${href}/edit">Edit</a>
    <button type="button" class="btn btn-subtle" data-copy-share="${safeId}">Copy link</button>
    <span class="copy-feedback" data-copy-feedback aria-live="polite"></span>
  </div>
</li>`
}

function libraryNodesHtml(nodes: LibraryNode[]): string {
  return nodes
    .map((node) => {
      if (node.kind === 'canvas') return canvasRowHtml(node.name, node.id)
      const safe = escapeHtml(node.name)
      return `<li><details><summary class="canvas-id">${safe}</summary><ul class="canvas-list">${libraryNodesHtml(node.children)}</ul></details></li>`
    })
    .join('')
}

/** Index: upload + library from stored canvas ids. */
export function indexShellHtml(canvasIds: string[]): string {
  const n = canvasIds.length
  const countLabel = n === 1 ? '1 canvas' : `${n} canvases`
  const create = `<section class="upload" aria-labelledby="new-heading">
  <div class="upload-label" id="new-heading">New canvas</div>
  <form class="new-form" data-new-form>
    <input class="new-input" data-new-input type="text" name="id" placeholder="my-canvas" aria-label="Canvas name" autocomplete="off" />
    <button class="btn btn-primary" type="submit">New</button>
  </form>
  <p class="status" data-new-status role="status"></p>
</section>`

  const upload = `<section class="upload" aria-labelledby="upload-heading">
  <div class="upload-label" id="upload-heading">Upload a canvas</div>
  <form data-upload-form>
    <div class="upload-drop" data-upload-drop>
      <input id="upload-file" class="upload-sr" data-upload-input type="file" accept=".tsx,.canvas.tsx" />
      <label class="btn" for="upload-file">Choose file</label>
      <span class="upload-filename" data-upload-filename>No file chosen</span>
      <span class="status">or drop a .canvas.tsx file here</span>
    </div>
    <div class="upload-actions">
      <button class="btn btn-primary" type="submit">Upload</button>
    </div>
  </form>
  <p class="status" data-upload-status role="status"></p>
</section>`

  const list =
    n === 0
      ? `<p class="status empty-state" data-shell="index">No canvases yet. Create one with New or upload a .canvas.tsx file.</p>`
      : `<ul class="canvas-list" data-shell="index">${libraryNodesHtml(libraryTree(canvasIds))}</ul>`

  const hero = `<header class="library-hero">
  <h1 class="library-title">Canvases</h1>
  <p class="library-meta">${escapeHtml(countLabel)}</p>
</header>`

  const body = `<div class="library">${hero}<div class="library-intake">${create}${upload}</div>${list}</div>`
  return page(
    'Canvases',
    body,
    '',
    `<script>${libraryScript}</script><script>${copyShareScript}</script>`,
    '',
  )
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
  skipReloadIfDirty = false,
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
      if (${skipReloadIfDirty ? 'window.__tcEditDirty' : 'false'}) return;
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

/** Edit: UI split (preview + Oriented Add / Fill) or Code (source editor + preview). */
export function editShellHtml(
  canvasId: string,
  payload: ViewerPayload,
  initialState: Record<string, unknown> = {},
): string {
  const safeId = escapeHtml(canvasId)
  const chrome = `<div class="edit-chrome" data-edit-chrome data-shell="edit" data-canvas-id="${safeId}">
  <section class="edit-section" aria-labelledby="edit-orient-heading">
    <h2 class="edit-section-title" id="edit-orient-heading">Oriented Add</h2>
    <div class="edit-row">
      <button type="button" class="btn btn-primary" data-edit-add disabled>Add</button>
      <span class="edit-orient-meta" data-edit-orient></span>
    </div>
  </section>
  <section class="edit-section" aria-labelledby="edit-slots-heading">
    <h2 class="edit-section-title" id="edit-slots-heading">Fill slots</h2>
    <p class="status" data-edit-slot-hint hidden>The new card shows placeholder tokens until you apply fills.</p>
    <div class="edit-slots" data-edit-slots></div>
    <div class="edit-row">
      <button type="button" class="btn" data-edit-fill disabled>Apply fills</button>
    </div>
  </section>
</div>`
  const preview = previewStageHtml(
    canvasId,
    payload,
    initialState,
    'edit-preview',
    true,
  )
  const codePane = `<div class="edit-code-pane">
  <textarea class="edit-source" data-edit-source spellcheck="false" wrap="off" aria-label="Canvas source"></textarea>
</div>`
  const body = `<div class="edit-layout" id="edit-workspace">${codePane}<div class="edit-preview">${preview.body}</div>${chrome}</div>${preview.scripts}<script>${editScript}</script>`
  const hashBoot = `<script>
(function () {
  var m = location.hash === "#code" ? "code" : "ui";
  document.documentElement.setAttribute("data-edit-mode", m);
})();
</script>`
  return page(
    `Edit ${canvasId}`,
    body,
    'edit-main',
    `<script>${copyShareScript}</script>`,
    canvasHeader(canvasId, 'edit'),
    hashBoot,
  )
}

/** Missing canvas id. */
export function notFoundShellHtml(canvasId: string): string {
  return page(
    'Not found',
    `<p class="status" data-tone="error" data-shell="not-found" data-canvas-id="${escapeHtml(canvasId)}">Canvas not found: <code>${escapeHtml(canvasId)}</code></p>`,
  )
}
