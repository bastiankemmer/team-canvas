/** Host UI shell HTML (library + canvas viewer). Look owned by design.md. */

import {
  canvasPaletteDark,
  canvasPaletteLight,
} from "../../sdk/canvas-tokens.js";

const chrome = String.raw`
:root {
  --bg: #f4f4f5;
  --text: #18181b;
  --muted: #71717a;
  --border: #e4e4e7;
  --accent: #2563eb;
  --surface: #ffffff;
  --error: #b91c1c;
  --on-accent: #fff;
  --pad: 1.5rem;
  --gap: 0.75rem;
  --gap-lg: 1.25rem;
  --font: ui-sans-serif, system-ui, sans-serif;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #181818;
    --text: #f4f4f5;
    --muted: #a1a1aa;
    --border: #3f3f46;
    --accent: #60a5fa;
    --surface: #181818;
    --error: #f87171;
    --on-accent: #181818;
  }
}
* { box-sizing: border-box; }
html, body { height: 100%; }
body {
  margin: 0;
  font-family: var(--font);
  background: var(--bg);
  color: var(--text);
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}
.top {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem 1rem;
  padding: 0.85rem var(--pad);
  border-bottom: 1px solid var(--border);
  flex: 0 0 auto;
}
.brand {
  font-weight: 700;
  letter-spacing: -0.02em;
  text-decoration: none;
  color: var(--text);
}
.page-title { color: var(--muted); font-size: 0.95rem; }
.crumb {
  font-size: 0.95rem;
  color: var(--muted);
  min-width: 0;
}
.crumb a {
  color: var(--text);
  text-decoration: none;
}
.crumb a:hover { text-decoration: underline; }
.crumb a:focus-visible,
.brand:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
.crumb-id { color: var(--text); font-weight: 500; word-break: break-all; }
.top-tools {
  margin-left: auto;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
}
main {
  padding: var(--pad);
  max-width: 64rem;
  flex: 1 1 auto;
  min-height: 0;
  width: 100%;
}
main.viewer-main {
  max-width: none;
  display: flex;
  flex-direction: column;
  gap: 0;
  padding: 0;
}
.status {
  color: var(--muted);
  font-size: 0.9rem;
  line-height: 1.4;
  margin: 0;
}
.status[data-tone="error"] { color: var(--error); }
.library {
  display: flex;
  flex-direction: column;
  gap: var(--gap-lg);
}
.upload {
  display: flex;
  flex-direction: column;
  gap: var(--gap);
  padding-bottom: var(--gap-lg);
  border-bottom: 1px solid var(--border);
}
.upload-label {
  font-size: 0.95rem;
  font-weight: 600;
}
.upload-drop {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--gap);
  padding: 1rem;
  border: 1px dashed var(--border);
  background: var(--surface);
}
.upload-drop.is-drag { border-color: var(--accent); }
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
  font-size: 0.9rem;
  color: var(--muted);
  min-width: 0;
  word-break: break-all;
}
.upload-actions { margin-top: var(--gap); }
.btn {
  font: inherit;
  font-size: 0.9rem;
  padding: 0.4rem 0.75rem;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text);
  cursor: pointer;
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  line-height: 1.2;
}
a.btn:hover { text-decoration: none; }
.btn:hover { border-color: var(--muted); }
.btn:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
.btn-primary {
  border-color: var(--accent);
  background: var(--accent);
  color: var(--on-accent);
}
.btn-primary:hover { filter: brightness(0.95); }
.btn-primary:disabled,
.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  filter: none;
}
.canvas-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0;
}
.canvas-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--gap);
  padding: 0.85rem 0;
  border-bottom: 1px solid var(--border);
}
.canvas-row:last-child { border-bottom: none; }
.canvas-id {
  flex: 1 1 10rem;
  font-weight: 600;
  font-size: 1.05rem;
  min-width: 0;
  word-break: break-all;
}
.canvas-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
}
.copy-feedback {
  font-size: 0.8rem;
  color: var(--muted);
  min-width: 3.5rem;
}
.stage {
  min-height: 12rem;
  border-top: 1px solid var(--border);
  margin: 0;
  padding: 0;
  background: ${canvasPaletteLight.editor};
}
#root {
  min-height: 4rem;
  padding: 0.75rem;
  background: ${canvasPaletteLight.editor};
}
@media (prefers-color-scheme: dark) {
  .stage, #root { background: ${canvasPaletteDark.editor}; }
}
.viewer-main .status { padding: var(--pad) var(--pad) 0; }
.viewer-main .stage {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  border-top: none;
}
.viewer-main #root { flex: 1 1 auto; }
main.edit-main {
  max-width: none;
  display: flex;
  flex-direction: column;
  gap: 0;
  padding: 0;
}
.edit-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) min(24rem, 40vw);
  grid-template-rows: minmax(0, 1fr);
  flex: 1 1 auto;
  min-height: 0;
  height: 100%;
}
.edit-preview {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}
.edit-preview .status { padding: var(--pad) var(--pad) 0; }
.edit-preview .stage {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  border-top: none;
}
.edit-preview #root { flex: 1 1 auto; }
.edit-chrome {
  display: flex;
  flex-direction: column;
  gap: var(--gap-lg);
  padding: var(--pad);
  max-width: none;
  overflow: auto;
  border-left: 1px solid var(--border);
  background: var(--bg);
}
.edit-section {
  display: flex;
  flex-direction: column;
  gap: var(--gap);
}
.edit-section-title {
  font-size: 0.95rem;
  font-weight: 600;
  margin: 0;
}
.edit-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--gap);
}
.edit-orient-meta {
  font-size: 0.9rem;
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
  font-size: 0.9rem;
  color: var(--text);
  font-weight: 500;
}
.edit-slot-id {
  display: block;
  font-size: 0.75rem;
  font-weight: 400;
  color: var(--muted);
}
.edit-slot input,
.edit-source {
  font: inherit;
  font-size: 0.9rem;
  padding: 0.4rem 0.5rem;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
  width: 100%;
}
.edit-slot input:focus-visible,
.edit-source:focus-visible,
.edit-view-tab:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
.edit-source {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.8rem;
  min-height: 12rem;
  resize: vertical;
  line-height: 1.4;
}
.edit-view-switch {
  display: inline-flex;
  border: 1px solid var(--border);
}
.edit-view-tab {
  border: none;
  border-right: 1px solid var(--border);
  background: transparent;
  color: var(--muted);
  border-radius: 0;
}
.edit-view-tab:last-child { border-right: none; }
.edit-view-tab[aria-selected="true"] {
  color: var(--text);
  background: var(--surface);
}
.edit-unsaved {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.85rem;
  color: var(--muted);
}
.edit-unsaved[hidden] { display: none; }
.edit-unsaved-dot {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 50%;
  background: var(--accent);
  flex: 0 0 auto;
}
.top-tools .status {
  flex: 1 1 12rem;
  margin: 0;
}
.edit-layout {
  grid-template-areas: "preview chrome";
}
.edit-preview { grid-area: preview; }
.edit-chrome { grid-area: chrome; }
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
  white-space: pre;
  overflow: auto;
}
html[data-edit-mode="code"] .edit-code-pane { display: flex; }
html[data-edit-mode="code"] .edit-chrome { display: none; }
html[data-edit-mode="code"] .edit-layout {
  grid-template-columns: minmax(0, 55%) minmax(0, 1fr);
  grid-template-areas: "code preview";
}
html[data-edit-mode="code"] .edit-code-pane { border-right: 1px solid var(--border); }
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
a { color: var(--accent); }
`.trim()

const copyShareScript = String.raw`
(function () {
  document.querySelectorAll("[data-copy-share]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var id = btn.getAttribute("data-copy-share");
      if (!id) return;
      var url = location.origin + "/canvas/" + id;
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
              location.href = "/canvas/" + encodeURIComponent(data.id);
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
  var root = document.querySelector("[data-edit-chrome]");
  if (!root) return;
  var id = root.getAttribute("data-canvas-id");
  if (!id) return;
  var base = "/api/canvas/" + encodeURIComponent(id);
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
  <a class="brand" href="/">team-canvas</a>
  ${header}
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

function canvasHeader(canvasId: string, mode: 'view' | 'edit'): string {
  const safe = escapeHtml(canvasId)
  const enc = encodeURIComponent(canvasId)
  const tools =
    mode === 'view'
      ? `<a class="btn" href="/canvas/${enc}/edit">Edit</a>
    <button type="button" class="btn" data-copy-share="${safe}">Copy link</button>
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

/** Index: upload + library from stored canvas ids. */
export function indexShellHtml(canvasIds: string[]): string {
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
    canvasIds.length === 0
      ? `<p class="status" data-shell="index">No canvases yet. Upload a .canvas.tsx file to get started.</p>`
      : `<ul class="canvas-list" data-shell="index">${canvasIds
          .map((id) => {
            const safe = escapeHtml(id)
            const href = `/canvas/${encodeURIComponent(id)}`
            const editHref = `/canvas/${encodeURIComponent(id)}/edit`
            return `<li class="canvas-row">
  <span class="canvas-id">${safe}</span>
  <div class="canvas-actions">
    <a class="btn btn-primary" href="${href}">Open</a>
    <a class="btn" href="${editHref}">Edit</a>
    <button type="button" class="btn" data-copy-share="${safe}">Copy link</button>
    <span class="copy-feedback" data-copy-feedback aria-live="polite"></span>
  </div>
</li>`
          })
          .join('')}</ul>`

  const body = `<div class="library">${upload}${list}</div>`
  return page(
    'Canvases',
    body,
    '',
    `<script>${libraryScript}</script><script>${copyShareScript}</script>`,
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
  var id = ${JSON.stringify(canvasId)};
  try {
    var es = new EventSource("/api/canvas/" + encodeURIComponent(id) + "/watch");
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
