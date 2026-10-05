import { JSDOM } from "jsdom";
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

  it("@task-5: library is a tree of folders and canvases with slash-preserving encoded links", async () => {
    const html = indexShellHtml([
      "reference/http-api",
      "index",
      "guides/editing-workflow",
    ]);
    const dom = new JSDOM(html, {
      runScripts: "dangerously",
      url: "http://canvas.test/",
    });
    const doc = dom.window.document;
    const root = doc.querySelector('ul[data-shell="index"]');
    expect(root).toBeTruthy();

    const labels = (list: Element) =>
      [...list.children].map((li) => {
        const details = [...li.children].find((el) => el.tagName === "DETAILS");
        if (details) {
          const summary = [...details.children].find((el) => el.tagName === "SUMMARY");
          return summary?.textContent ?? "";
        }
        return li.querySelector(".canvas-id")?.textContent ?? "";
      });

    expect(labels(root!)).toEqual(["guides", "index", "reference"]);
    expect(doc.querySelector(".library-meta")?.textContent).toBe("3 canvases");

    const guides = root!.children[0]!;
    const reference = root!.children[2]!;
    expect(guides.querySelector("details")).toBeTruthy();
    expect(guides.classList.contains("canvas-row")).toBe(false);
    expect(reference.querySelector("details")).toBeTruthy();
    expect(labels(guides.querySelector("details > ul")!)).toEqual(["editing-workflow"]);
    expect(labels(reference.querySelector("details > ul")!)).toEqual(["http-api"]);

    const indexRow = root!.children[1]!;
    expect(indexRow.classList.contains("canvas-row")).toBe(true);
    expect(indexRow.querySelector("a")?.getAttribute("href")).toBe("/canvas/index");
    expect(indexRow.querySelector('a[href="/canvas/index/edit"]')?.textContent).toBe("Edit");

    const nested = guides.querySelector(".canvas-row")!;
    expect(nested.querySelector('a[href="/canvas/guides/editing-workflow"]')?.textContent).toBe("Open");
    expect(nested.querySelector('a[href="/canvas/guides/editing-workflow/edit"]')?.textContent).toBe("Edit");
    expect([...doc.querySelectorAll("a")].map((a) => a.getAttribute("href"))).not.toContain("/canvas/guides");
    expect([...doc.querySelectorAll("summary")].map((s) => s.textContent)).toEqual(["guides", "reference"]);
    expect([...doc.querySelectorAll(".canvas-row .canvas-id")].map((el) => el.textContent)).toEqual([
      "editing-workflow",
      "index",
      "http-api",
    ]);

    const flat = new JSDOM(indexShellHtml(["index"])).window.document;
    expect(flat.querySelector("details")).toBeNull();

    const sorted = new JSDOM(indexShellHtml(["ref/z", "ref/a", "aaa"])).window.document;
    const sortedRoot = sorted.querySelector('ul[data-shell="index"]')!;
    expect(labels(sortedRoot)).toEqual(["aaa", "ref"]);
    expect(labels(sortedRoot.children[1]!.querySelector("details > ul")!)).toEqual(["a", "z"]);

    const spacedHtml = indexShellHtml(["guides/bill ing"]);
    expect(spacedHtml).toContain('href="/canvas/guides/bill%20ing"');
    expect(spacedHtml).toContain('href="/canvas/guides/bill%20ing/edit"');
    expect(spacedHtml).not.toContain("%2F");
    const spaced = new JSDOM(spacedHtml, {
      runScripts: "dangerously",
      url: "http://canvas.test/",
    });
    Object.defineProperty(spaced.window.navigator, "clipboard", {
      configurable: true,
      value: {
        writeText(text: string) {
          (spaced.window as unknown as { __copied: string }).__copied = text;
          return Promise.resolve();
        },
      },
    });
    spaced.window.document.querySelector<HTMLButtonElement>("[data-copy-share]")!.click();
    expect((spaced.window as unknown as { __copied: string }).__copied).toBe(
      "http://canvas.test/canvas/guides/bill%20ing",
    );

    Object.defineProperty(dom.window.navigator, "clipboard", {
      configurable: true,
      value: {
        writeText(text: string) {
          (dom.window as unknown as { __copied: string }).__copied = text;
          return Promise.resolve();
        },
      },
    });
    guides.querySelector<HTMLButtonElement>("[data-copy-share]")!.click();
    expect((dom.window as unknown as { __copied: string }).__copied).toBe(
      "http://canvas.test/canvas/guides/editing-workflow",
    );

    const { createRequire } = await import("node:module");
    const require = createRequire(import.meta.url);
    const { implForWrapper } = require("jsdom/lib/generated/idl/utils.js") as {
      implForWrapper: (wrapper: object) => {
        _locationObjectNavigate: (url: object) => void;
      };
    };
    const { serializeURL } = require("whatwg-url") as {
      serializeURL: (url: object) => string;
    };
    const navigated: string[] = [];
    // jsdom refuses cross-document navigation; record the URL the setter resolved.
    implForWrapper(dom.window.location)._locationObjectNavigate = (url) => {
      navigated.push(serializeURL(url));
    };

    const calls: { url: string; body?: string; headers?: Record<string, string> }[] = [];
    dom.window.fetch = (url: string, opts?: { body?: string; headers?: Record<string, string> }) => {
      calls.push({ url: String(url), body: opts?.body, headers: opts?.headers });
      const created = String(url) === "/api/canvas/new";
      return Promise.resolve({
        status: 201,
        text: () => Promise.resolve(""),
        json: () => Promise.resolve(created ? {} : { id: "notes" }),
      });
    };

    const file = new dom.window.File(["export default function Notes(){return null}"], "notes.canvas.tsx");
    const fileInput = doc.querySelector<HTMLInputElement>("[data-upload-input]")!;
    Object.defineProperty(fileInput, "files", { configurable: true, value: [file] });
    doc.querySelector("[data-upload-form]")!.dispatchEvent(
      new dom.window.Event("submit", { bubbles: true, cancelable: true }),
    );
    for (let i = 0; i < 5 && !calls.some((call) => call.headers?.["X-Canvas-Name"]); i++) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    expect(calls.find((call) => call.headers?.["X-Canvas-Name"])?.headers?.["X-Canvas-Name"]).toBe(
      "notes.canvas.tsx",
    );

    const input = doc.querySelector<HTMLInputElement>("[data-new-input]")!;
    input.value = "guides/editing-workflow";
    doc.querySelector("[data-new-form]")!.dispatchEvent(
      new dom.window.Event("submit", { bubbles: true, cancelable: true }),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    const created = calls.find((call) => call.url === "/api/canvas/new");
    expect(created?.body).toBe(JSON.stringify({ id: "guides/editing-workflow" }));
    expect(navigated.at(-1)).toBe("http://canvas.test/canvas/guides/editing-workflow/edit");

    const seen: string[] = [];
    const editDom = new JSDOM(
      editShellHtml("guides/editing-workflow", { kind: "ok", js: "/*ok*/" }),
      {
        runScripts: "dangerously",
        url: "http://canvas.test/",
        beforeParse(window) {
          const win = window as unknown as { __urls: string[]; EventSource: new (url: string) => void; fetch: (url: string) => Promise<unknown> };
          win.__urls = seen;
          win.EventSource = class {
            constructor(url: string) {
              seen.push(String(url));
            }
          };
          win.fetch = (url: string) => {
            seen.push(String(url));
            return Promise.resolve({
              ok: true,
              status: 200,
              text: () => Promise.resolve("source"),
              json: () => Promise.resolve({ addAvailable: false, slots: [] }),
            });
          };
        },
      },
    );
    expect(seen).toContain("/api/canvas/guides/editing-workflow/watch");
    expect(seen).toContain("/api/canvas/guides/editing-workflow/source");
    expect(seen).toContain("/api/canvas/guides/editing-workflow/orientation");
    expect(seen.join(" ")).not.toContain("%2F");
    expect(editDom.window.document.querySelector('a[href="/canvas/guides/editing-workflow"]')?.textContent).toBe(
      "View",
    );
  });
});
