import { describe, expect, it } from "vitest";
import {
  canvasPaletteDark,
  canvasPaletteLight,
} from "../../sdk/canvas-tokens.js";
import {
  editShellHtml,
  escapeHtml,
  indexShellHtml,
  notFoundShellHtml,
  viewerShellHtml,
} from "./shell.js";

describe("host-ui shell HTML markers", () => {
  it("mutation: escapeHtml encodes &, <, >, and quotes for XSS safety", () => {
    expect(escapeHtml(`a&b<c>d"e`)).toBe("a&amp;b&lt;c&gt;d&quot;e");
    expect(escapeHtml("&")).toBe("&amp;");
    expect(escapeHtml("<script>")).toBe("&lt;script&gt;");
    const poisoned = indexShellHtml([`x<"&>`]);
    expect(poisoned).toContain("x&lt;&quot;&amp;&gt;");
    expect(poisoned).not.toContain(`x<"&>`);
    const missing = notFoundShellHtml(`a&b`);
    expect(missing).toContain("a&amp;b");
    expect(missing).not.toMatch(/data-canvas-id="a&b"/);
  });

  it("mutation: index/viewer/not-found shells include title, main, and body", () => {
    const index = indexShellHtml(["alpha"]);
    expect(index).toContain("<!doctype html>");
    expect(index).toContain("<title>");
    expect(index).toContain("Canvases");
    expect(index).toContain("team-canvas");
    expect(index).toContain("<body>");
    expect(index).toContain("</body>");
    expect(index).toContain("<main>");
    expect(index).toContain("</main>");
    expect(index).toContain('data-shell="index"');
    expect(index).toContain("/canvas/alpha");
    expect(index).toContain("data-upload-form");
    expect(index).toContain("data-upload-input");
    expect(index).toContain("data-upload-drop");
    expect(index).toContain("Choose file");
    expect(index).toContain('data-copy-share="alpha"');
    expect(index).toContain('class="btn btn-primary" href="/canvas/alpha">Open</a>');
    expect(index).toContain("/api/canvas");
    expect(index).toContain("X-Canvas-Name");

    const empty = indexShellHtml([]);
    expect(empty).toContain('data-shell="index"');
    expect(empty).toContain("No canvases yet");
    expect(empty).toContain("data-upload-form");

    const viewer = viewerShellHtml(
      "demo",
      { kind: "ok", js: "/*bundle*/" },
      { n: 1 },
    );
    expect(viewer).toContain("<title>");
    expect(viewer).toContain("demo");
    expect(viewer).toContain("<body>");
    expect(viewer).toContain('<main class="viewer-main">');
    expect(viewer).toContain('data-shell="viewer"');
    expect(viewer).toContain("/*bundle*/");
    expect(viewer).toContain('href="/">Canvases</a>');
    expect(viewer).toContain('href="/canvas/demo/edit">Edit</a>');
    expect(viewer).toContain('data-copy-share="demo"');
    expect(viewer).toMatch(/prefers-color-scheme:\s*dark/);
    expect(viewer).toContain(`background: ${canvasPaletteLight.editor}`);
    expect(viewer).toContain(`background: ${canvasPaletteDark.editor}`);

    const missing = notFoundShellHtml("gone");
    expect(missing).toContain("<title>");
    expect(missing).toContain("<body>");
    expect(missing).toContain("<main>");
    expect(missing).toContain('data-shell="not-found"');
    expect(missing).toContain("gone");
  });

  it("@task-4: edit shell has live preview stage plus chrome outside SDK; index Edit opens /canvas/:id/edit", () => {
    const index = indexShellHtml(["alpha"]);
    expect(index).toContain('href="/canvas/alpha/edit">Edit</a>');
    expect(index).toContain('href="/canvas/alpha">Open</a>');
    expect(index).toContain("btn-primary");

    const edit = editShellHtml(
      "demo",
      { kind: "ok", js: "/*edit-bundle*/" },
      { n: 1 },
    );
    expect(edit).toContain("<!doctype html>");
    expect(edit).toContain('data-shell="edit"');
    expect(edit).toContain("data-edit-chrome");
    expect(edit).toContain("data-edit-add");
    expect(edit).toContain("data-edit-slots");
    expect(edit).toContain("data-edit-source");
    expect(edit).toContain("data-edit-save");
    expect(edit).toContain("data-edit-status");
    expect(edit).toContain("data-edit-fill");
    expect(edit).toContain("/*edit-bundle*/");
    expect(edit).toContain('<main class="edit-main">');
    expect(edit).toContain("edit-layout");
    expect(edit).toContain('<div class="stage">');
    expect(edit).toContain('<div id="root"></div>');
    expect(edit).toContain("/api/canvas/");
    expect(edit).toContain("/watch");
    expect(edit).toContain("EventSource");
    expect(edit).toContain('href="/canvas/demo">View</a>');
    expect(edit).toContain('href="/">Canvases</a>');
    // Boot rehydrates Fill chrome from the orientation slots (id + label from the server).
    expect(edit).toContain("orientInfo.slots");
    expect(edit).toContain("slot.label");
    expect(edit).not.toContain("wrapperTagForSlot");
    expect(edit).toContain("placeholder tokens until you apply");
    expect(edit).toContain("role=\"status\"");
    expect(edit).toContain('role="tablist"');
    expect(edit).toContain('data-edit-view="ui"');
    expect(edit).toContain('data-edit-view="code"');
    expect(edit).toContain("#code");
    expect(edit).toContain("#ui");
    expect(edit).toContain('wrap="off"');
    expect(edit).toContain("beforeunload");
    expect(edit).toContain("Save your code changes first");
    expect(edit).toContain("__tcEditDirty");
    expect(edit).toContain("data-edit-unsaved");
    expect(edit).not.toContain("Raw source");
    expect(edit).toContain("Oriented Add");
    expect(edit).toContain("Fill slots");
    // Stage gutter stays 0; #root owns content inset via --stage-pad (not SDK).
    expect(edit).toMatch(/\.stage\s*\{[^}]*padding:\s*0;/s);
    expect(edit).toMatch(/--stage-pad:\s*clamp\(/);
    expect(edit).toMatch(/#root\s*\{[^}]*padding:\s*var\(--stage-pad\);/s);
    // Split view: preview stage before the edit column in document order.
    const chromeAt = edit.indexOf("data-edit-chrome");
    const stageAt = edit.indexOf('class="stage"');
    expect(stageAt).toBeGreaterThan(-1);
    expect(chromeAt).toBeGreaterThan(stageAt);
  });
});
