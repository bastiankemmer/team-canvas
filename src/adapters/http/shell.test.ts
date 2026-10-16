import { JSDOM, VirtualConsole } from "jsdom";
import { describe, expect, it, vi } from "vitest";
import {
  canvasPaletteDark,
  canvasPaletteLight,
} from "../../sdk/canvas-tokens.js";
import {
  editShellHtml,
  escapeHtml,
  indexShellHtml,
  notFoundShellHtml,
  settlementShellHtml,
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
    expect(index).not.toContain("data-upload-form");
    expect(index).not.toContain("data-new-form");
    expect(index).toContain('data-copy-share="alpha"');
    expect(index).toContain('class="btn btn-primary" href="/canvas/alpha">Open</a>');
    expect(index).toContain('href="/canvas/alpha/edit">Code</a>');

    const empty = indexShellHtml([]);
    expect(empty).toContain('data-shell="index"');
    expect(empty).toContain("No canvases yet");
    expect(empty).toContain("Agents add them over MCP");
    expect(empty).not.toContain("data-upload-form");

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
    expect(viewer).toContain('href="/canvas/demo/edit">Code</a>');
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

  it("@task-4: code view is read-only source next to the live preview; index Code opens /canvas/:id/edit", () => {
    const index = indexShellHtml(["alpha"]);
    expect(index).toContain('href="/canvas/alpha/edit">Code</a>');
    expect(index).toContain('href="/canvas/alpha">Open</a>');
    expect(index).toContain("btn-primary");

    const edit = editShellHtml(
      "demo",
      { kind: "ok", js: "/*edit-bundle*/" },
      { n: 1 },
    );
    expect(edit).toContain("<!doctype html>");
    expect(edit).toContain('data-shell="edit"');
    expect(edit).toContain("data-edit-source");
    expect(edit).toContain("readonly");
    expect(edit).not.toContain("data-edit-save");
    expect(edit).not.toContain("data-edit-add");
    expect(edit).not.toContain("data-edit-chrome");
    expect(edit).toContain("/*edit-bundle*/");
    expect(edit).toContain('<main class="edit-main">');
    expect(edit).toContain("edit-layout");
    expect(edit).toContain('<div class="stage">');
    expect(edit).toContain('<div id="root"></div>');
    expect(edit).toContain("/api/canvas/");
    expect(edit).toContain("/source");
    expect(edit).toContain("/watch");
    expect(edit).toContain("EventSource");
    expect(edit).toContain('href="/canvas/demo">View</a>');
    expect(edit).toContain('href="/">Canvases</a>');
    expect(edit).not.toContain("orientInfo.slots");
    expect(edit).not.toContain("Oriented Add");
    expect(edit).toContain('role="status"');
    expect(edit).not.toContain('role="tablist"');
    expect(edit).toContain('wrap="off"');
    expect(edit).not.toContain("beforeunload");
    expect(edit).not.toContain("Raw source");
    expect(edit).toMatch(/\.stage\s*\{[^}]*padding:\s*0;/s);
    expect(edit).toMatch(/--stage-pad:\s*clamp\(/);
    expect(edit).toMatch(/#root\s*\{[^}]*padding:\s*var\(--stage-pad\);/s);
    const sourceAt = edit.indexOf("data-edit-source");
    const stageAt = edit.indexOf('class="stage"');
    expect(sourceAt).toBeGreaterThan(-1);
    expect(stageAt).toBeGreaterThan(sourceAt);
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
    const root = doc.querySelector('.md-groups[data-shell="index"]')!;
    const rows = () => [...root.querySelectorAll(":scope > .md-group")];
    const pathOf = (row: Element) => row.querySelector(":scope > .md-subheader .md-path")?.textContent;

    expect(rows().map(pathOf)).toEqual(["root/", "guides/", "reference/"]);
    expect(doc.querySelector(".library-meta")?.textContent).toBe("3 canvases");
    expect(doc.querySelector("details")).toBeNull();
    expect([...doc.querySelectorAll("a")].map((a) => a.getAttribute("href"))).not.toContain("/canvas/guides");

    const guides = rows()[1]!;
    guides.querySelector<HTMLButtonElement>(".md-disclosure")!.click();
    expect([...guides.querySelectorAll(":scope > .md-panel > .md-grid .md-title")].map((el) => el.textContent)).toEqual([
      "editing-workflow",
    ]);
    expect(guides.querySelector('.canvas-actions a[href="/canvas/guides/editing-workflow"]')?.textContent).toBe("Open");
    expect(guides.querySelector('a[href="/canvas/guides/editing-workflow/edit"]')?.textContent).toBe("Code");

    const indexRow = rows()[0]!;
    indexRow.querySelector<HTMLButtonElement>(".md-disclosure")!.click();
    expect(indexRow.querySelector("a.md-title")?.getAttribute("href")).toBe("/canvas/index");
    expect(indexRow.querySelector('a[href="/canvas/index/edit"]')?.textContent).toBe("Code");

    const reference = rows()[2]!;
    reference.querySelector<HTMLButtonElement>(".md-disclosure")!.click();
    expect(reference.querySelector(".md-title")?.textContent).toBe("http-api");

    const flat = new JSDOM(indexShellHtml(["index"]), {
      runScripts: "dangerously",
      url: "http://canvas.test/",
    }).window.document;
    expect(flat.querySelector("details")).toBeNull();
    expect(flat.querySelector(".md-path")?.textContent).toBe("root/");

    const sorted = new JSDOM(indexShellHtml(["ref/z", "ref/a", "aaa"]), {
      runScripts: "dangerously",
      url: "http://canvas.test/",
    }).window.document;
    const sortedRows = [...sorted.querySelectorAll('.md-groups[data-shell="index"] > .md-group')];
    expect(sortedRows.map((row) => row.querySelector(".md-path")?.textContent)).toEqual(["root/", "ref/"]);
    sortedRows[1]!.querySelector<HTMLButtonElement>(".md-disclosure")!.click();
    expect([...sortedRows[1]!.querySelectorAll(".md-title")].map((el) => el.textContent)).toEqual(["a", "z"]);

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
    expect(seen.join(" ")).not.toContain("/orientation");
    expect(seen.join(" ")).not.toContain("%2F");
    expect(editDom.window.document.querySelector('a[href="/canvas/guides/editing-workflow"]')?.textContent).toBe(
      "View",
    );
  });

  it("@task-2: Folders is the visible panel and Knowledge is hidden on first paint, including when an index root exists; toggling shows one panel and updates aria-pressed and hidden without storage or fetch", () => {
    const ids = [
      "team-canvas/index",
      "guides/bill ing",
      "reference/http-api",
      "z/late",
      "proj/index",
      "m/two",
      "m/one",
      "solo/index",
      "notes/loose",
    ];
    const tree = {
      roots: [
        {
          id: "team-canvas/index",
          missing: false,
          children: [
            {
              id: "guides/bill ing",
              missing: false,
              children: [{ id: "reference/http-api", missing: false, children: [] }],
            },
            { id: "z/late", missing: false, children: [] },
            { id: "gone/topic", missing: true, children: [] },
          ],
        },
        {
          id: "proj/index",
          missing: false,
          children: [
            { id: "m/two", missing: false, children: [] },
            { id: "m/one", missing: false, children: [] },
          ],
        },
        { id: "solo/index", missing: false, children: [] },
      ],
      unlinked: ["notes/loose"],
    };
    const html = indexShellHtml(ids, tree);
    const dom = new JSDOM(html, {
      runScripts: "dangerously",
      url: "http://canvas.test/",
    });
    const doc = dom.window.document;
    const shown = () =>
      [...doc.querySelectorAll("[data-library-panel]")].filter((panel) => !panel.hasAttribute("hidden"));

    const folders = doc.querySelector('.md-groups[data-shell="index"]')!;
    const knowledge = doc.querySelector('.md-groups[data-shell="knowledge"]')!;
    const foldersBtn = doc.querySelector<HTMLButtonElement>('[data-library-toggle="folders"]')!;
    const knowledgeBtn = doc.querySelector<HTMLButtonElement>('[data-library-toggle="knowledge"]')!;
    const heroKids = [...doc.querySelector(".library-hero")!.children];

    expect(html).toContain('data-shell="index"');
    expect(html).toContain('data-shell="knowledge"');
    expect(folders.getAttribute("data-library-panel")).toBe("folders");
    expect(knowledge.getAttribute("data-library-panel")).toBe("knowledge");
    expect(folders.hasAttribute("hidden")).toBe(false);
    expect(knowledge.hasAttribute("hidden")).toBe(true);
    expect(foldersBtn.getAttribute("aria-pressed")).toBe("true");
    expect(knowledgeBtn.getAttribute("aria-pressed")).toBe("false");
    expect(foldersBtn.closest(".library-hero")).toBeTruthy();
    expect(heroKids.findIndex((el) => el.classList.contains("library-meta"))).toBeLessThan(
      heroKids.findIndex((el) => el.querySelector("[data-library-toggle]")),
    );
    expect(shown()).toEqual([folders]);

    const plain = new JSDOM(indexShellHtml(ids)).window.document;
    expect(plain.querySelector("[data-library-toggle]")).toBeNull();
    expect(plain.querySelector("[data-library-panel]")).toBeNull();
    expect(indexShellHtml(ids)).not.toContain("data-library-toggle");
    expect(indexShellHtml(ids)).not.toContain('data-shell="knowledge"');
    expect(plain.querySelector(".library-meta")?.nextSibling?.textContent?.trim() ?? "").toBe("");
    expect(folders.innerHTML).toBe(plain.querySelector('.md-groups[data-shell="index"]')!.innerHTML);

    const empty = indexShellHtml([]);
    expect(empty).toContain("No canvases yet");
    expect(new JSDOM(empty).window.document.querySelector("[data-library-toggle]")).toBeNull();
    expect(new JSDOM(empty).window.document.querySelector(".library-meta")?.nextSibling?.textContent?.trim() ?? "").toBe(
      "",
    );

    const zeroWithTree = indexShellHtml([], {
      roots: [{ id: "index", missing: false, children: [] }],
      unlinked: [],
    });
    expect(zeroWithTree).toContain("No canvases yet");
    expect(zeroWithTree).not.toContain("data-library-toggle");
    expect(
      new JSDOM(zeroWithTree).window.document.querySelector(".library-meta")?.nextSibling?.textContent?.trim() ?? "",
    ).toBe("");

    const kRows = () => [...knowledge.querySelectorAll(":scope > .md-group")];
    const kLabel = (row: Element) => row.querySelector(":scope > .md-subheader .md-path")?.textContent;
    expect(kRows().map(kLabel)).toEqual(["team-canvas/index", "proj/index", "solo/index", "Unlinked"]);
    expect(knowledge.innerHTML).toContain(knowledge.children[0]!.outerHTML + knowledge.children[1]!.outerHTML);
    const team = kRows()[0]!;
    const teamBtn = team.querySelector<HTMLButtonElement>(":scope > .md-subheader .md-disclosure")!;
    expect(teamBtn.getAttribute("aria-expanded")).toBe("false");
    expect(teamBtn.querySelector("a")).toBeNull();
    const branch = team.querySelector(":scope > .md-panel > .md-children > .md-group")!;
    const branchBtn = branch.querySelector<HTMLButtonElement>(".md-disclosure")!;
    expect(branchBtn.getAttribute("aria-expanded")).toBe("false");
    expect(branchBtn.querySelector(".md-path")?.textContent).toBe("guides/bill ing");
    expect(branchBtn.querySelector("a")).toBeNull();

    const solo = kRows()[2]!;
    solo.querySelector<HTMLButtonElement>(".md-disclosure")!.click();
    expect(solo.querySelector(".md-file")?.textContent).toBe("solo/index.canvas.tsx");

    const unlinked = kRows()[3]!;
    const unlinkedBtn = unlinked.querySelector<HTMLButtonElement>(".md-disclosure")!;
    expect(unlinkedBtn.getAttribute("aria-expanded")).toBe("false");
    unlinkedBtn.click();
    expect(unlinked.querySelector(".md-file")?.textContent).toBe("notes/loose.canvas.tsx");

    const proj = kRows()[1]!;
    proj.querySelector<HTMLButtonElement>(".md-disclosure")!.click();
    expect([...proj.querySelectorAll(".md-file")].map((el) => el.textContent)).toEqual([
      "proj/index.canvas.tsx",
      "m/two.canvas.tsx",
      "m/one.canvas.tsx",
    ]);

    const actions = (root: ParentNode, id: string) =>
      root.querySelector(`[data-copy-share="${id}"]`)?.closest(".canvas-actions")?.innerHTML;
    for (const id of ["team-canvas/index", "guides/bill ing", "z/late", "notes/loose"]) {
      expect(actions(knowledge, id)).toBe(actions(folders, id));
      expect(actions(knowledge, id)).toContain(`href="/canvas/${id.split("/").map(encodeURIComponent).join("/")}"`);
      expect(actions(knowledge, id)).toContain(`href="/canvas/${id.split("/").map(encodeURIComponent).join("/")}/edit"`);
    }
    expect(knowledge.innerHTML).toContain('href="/canvas/guides/bill%20ing"');
    expect(knowledge.innerHTML).not.toContain("%2F");

    const writes: string[] = [];
    const fetches: string[] = [];
    vi.spyOn(dom.window.localStorage, "setItem").mockImplementation((key) => {
      writes.push(`local:${String(key)}`);
    });
    vi.spyOn(dom.window.sessionStorage, "setItem").mockImplementation((key) => {
      writes.push(`session:${String(key)}`);
    });
    dom.window.fetch = (url: string) => {
      fetches.push(String(url));
      return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(""), json: () => Promise.resolve({}) });
    };
    let copied = "";
    Object.defineProperty(dom.window.navigator, "clipboard", {
      configurable: true,
      value: {
        writeText(text: string) {
          copied = text;
          return Promise.resolve();
        },
      },
    });

    const branchActions = branch.querySelector(".canvas-actions")!;
    expect(branchBtn.contains(branchActions)).toBe(false);
    branchActions.querySelector("button")!.click();
    expect(branchBtn.getAttribute("aria-expanded")).toBe("false");
    expect(copied).toBe("http://canvas.test/canvas/guides/bill%20ing");
    const branchOpen = branchActions.querySelector("a")!;
    branchOpen.addEventListener("click", (event) => event.preventDefault());
    branchOpen.click();
    expect(branchBtn.getAttribute("aria-expanded")).toBe("false");
    teamBtn.click();
    const teamPanel = doc.getElementById(teamBtn.getAttribute("aria-controls") ?? "")!;
    expect([...teamPanel.querySelectorAll(":scope > .md-grid .md-file")].map((el) => el.textContent)).toEqual([
      "team-canvas/index.canvas.tsx",
      "z/late.canvas.tsx",
      "missing",
    ]);
    const broken = teamPanel.querySelector('[data-missing="gone/topic"]')!;
    expect(broken.querySelector(".md-title")?.textContent).toBe("topic");
    expect(broken.querySelector(".md-file")?.textContent).toBe("missing");
    expect(broken.querySelector("a, button")).toBeNull();
    branchBtn.click();
    expect(branch.querySelector(".md-grid")?.textContent).toContain("reference/http-api.canvas.tsx");
    const teamOpen = teamPanel.querySelector(":scope > .md-grid .canvas-actions a")!;
    teamOpen.addEventListener("click", (event) => event.preventDefault());
    teamOpen.click();
    expect(teamBtn.getAttribute("aria-expanded")).toBe("true");

    knowledgeBtn.click();
    expect(shown()).toEqual([knowledge]);
    expect(folders.hasAttribute("hidden")).toBe(true);
    expect(knowledge.hasAttribute("hidden")).toBe(false);
    expect(foldersBtn.getAttribute("aria-pressed")).toBe("false");
    expect(knowledgeBtn.getAttribute("aria-pressed")).toBe("true");
    foldersBtn.click();
    expect(shown()).toEqual([folders]);
    expect(folders.hasAttribute("hidden")).toBe(false);
    expect(knowledge.hasAttribute("hidden")).toBe(true);
    expect(foldersBtn.getAttribute("aria-pressed")).toBe("true");
    expect(knowledgeBtn.getAttribute("aria-pressed")).toBe("false");
    expect(fetches).toEqual([]);
    expect(writes).toEqual([]);

    const looseHtml = indexShellHtml(["b", "a"], { roots: [], unlinked: ["b", "a"] });
    const looseDoc = new JSDOM(looseHtml, {
      runScripts: "dangerously",
      url: "http://canvas.test/",
    }).window.document;
    const looseKnowledge = looseDoc.querySelector('.md-groups[data-shell="knowledge"]')!;
    const looseBtn = looseKnowledge.querySelector<HTMLButtonElement>(".md-disclosure")!;
    expect(looseDoc.querySelector('[data-library-toggle="folders"]')?.getAttribute("aria-pressed")).toBe("true");
    expect(looseKnowledge.hasAttribute("hidden")).toBe(true);
    expect(looseBtn.getAttribute("aria-expanded")).toBe("false");
    expect(looseBtn.querySelector(".md-path")?.textContent).toBe("Unlinked");
    looseDoc.querySelector<HTMLButtonElement>('[data-library-toggle="knowledge"]')!.click();
    expect(looseKnowledge.hasAttribute("hidden")).toBe(false);
    looseBtn.click();
    const looseCards = [...looseKnowledge.querySelectorAll(".md-card")];
    expect(looseCards.map((card) => card.querySelector(".md-title")?.textContent)).toEqual(["b", "a"]);
    expect(looseKnowledge.querySelector(".md-grid")!.innerHTML).toBe(looseCards[0]!.outerHTML + looseCards[1]!.outerHTML);
    expect(looseKnowledge.querySelector(".canvas-actions a")?.textContent).toBe("Open");

    const linkedOnly = indexShellHtml(["proj/index", "index"], {
      roots: [
        {
          id: "index",
          missing: false,
          children: [
            { id: "a", missing: false, children: [] },
            { id: "b", missing: false, children: [] },
          ],
        },
        { id: "proj/index", missing: false, children: [] },
      ],
      unlinked: [],
    });
    const linkedKnowledge = new JSDOM(linkedOnly, {
      runScripts: "dangerously",
      url: "http://canvas.test/",
    }).window.document.querySelector('.md-groups[data-shell="knowledge"]')!;
    expect(linkedKnowledge.textContent ?? "").not.toContain("Unlinked");
    expect(linkedKnowledge.innerHTML).toBe([...linkedKnowledge.children].map((el) => el.outerHTML).join(""));
    expect(linkedOnly).toContain("data-library-toggle");
  });

  it("library is nested collapsible folders with no style switch", () => {
    const ids = ["index", "team-canvas/index", "team-canvas/reference/chunking"];
    const collapse = indexShellHtml(ids);
    const cdom = new JSDOM(collapse, { runScripts: "dangerously", url: "http://canvas.test/" }).window.document;
    expect(collapse).not.toContain("data-library-style");
    expect(collapse).not.toContain("Library style");
    expect(collapse).not.toContain("Fluent tree");
    expect(collapse).not.toContain("Bootstrap sections");
    expect(collapse).not.toContain("Material groups");
    expect(collapse).toContain("margin-left: 1.25rem");
    expect(cdom.querySelector('[data-shell="index"] details, [data-shell="index"] .canvas-list')).toBeNull();
    const indexRoot = cdom.querySelector('.md-groups[data-shell="index"]')!;
    const topRows = [...indexRoot.querySelectorAll(":scope > .md-group")];
    expect(topRows.map((row) => row.querySelector(":scope > .md-subheader .md-path")?.textContent)).toEqual([
      "root/",
      "team-canvas/",
    ]);
    const disclosures = [...cdom.querySelectorAll<HTMLButtonElement>(".md-disclosure")];
    expect(disclosures.every((btn) => btn.getAttribute("aria-expanded") === "false")).toBe(true);
    expect([...cdom.querySelectorAll(".md-panel")].every((panel) => panel.hasAttribute("hidden"))).toBe(true);
    const team = topRows[1]!;
    expect(team.querySelector(":scope > .md-subheader .md-count")?.textContent).toBe("2");
    const teamBtn = team.querySelector<HTMLButtonElement>(":scope > .md-subheader .md-disclosure")!;
    const ref = team.querySelector(":scope > .md-panel > .md-children > .md-group")!;
    expect(ref.querySelector(".md-path")?.textContent).toBe("reference/");
    expect(indexRoot.querySelectorAll(":scope > .md-group")).toHaveLength(2);
    teamBtn.click();
    expect(teamBtn.getAttribute("aria-expanded")).toBe("true");
    const teamPanel = cdom.getElementById(teamBtn.getAttribute("aria-controls") ?? "");
    expect(teamPanel?.hasAttribute("hidden")).toBe(false);
    expect(teamPanel?.querySelector(":scope > .md-grid .md-overline")?.textContent).toBe("team-canvas");
    expect(teamPanel?.querySelector(":scope > .md-grid .md-file")?.textContent).toBe("team-canvas/index.canvas.tsx");
    expect(teamPanel?.querySelector(':scope > .md-grid .canvas-actions a[href="/canvas/team-canvas/index"]')?.textContent).toBe("Open");
    expect(teamPanel?.querySelector(":scope > .md-grid")?.textContent).not.toContain("chunking");
    const refBtn = ref.querySelector<HTMLButtonElement>(".md-disclosure")!;
    expect(refBtn.getAttribute("aria-expanded")).toBe("false");
    refBtn.click();
    expect(teamBtn.getAttribute("aria-expanded")).toBe("true");
    expect(refBtn.getAttribute("aria-expanded")).toBe("true");
    const refPanel = cdom.getElementById(refBtn.getAttribute("aria-controls") ?? "");
    expect(refPanel?.querySelector(".md-overline")?.textContent).toBe("team-canvas/reference");
    expect(refPanel?.querySelector(".md-file")?.textContent).toBe("team-canvas/reference/chunking.canvas.tsx");

    const folderOnly = indexShellHtml(["parent/child/leaf"]);
    const folderDom = new JSDOM(folderOnly, { runScripts: "dangerously", url: "http://canvas.test/" }).window.document;
    const parentRow = folderDom.querySelector(".md-group")!;
    expect(parentRow.querySelector(".md-path")?.textContent).toBe("parent/");
    expect(parentRow.querySelector(".md-count")?.textContent).toBe("1");
    expect(parentRow.querySelector(":scope > .md-panel > .md-grid")).toBeNull();
    parentRow.querySelector<HTMLButtonElement>(".md-disclosure")!.click();
    const childRow = parentRow.querySelector(":scope > .md-panel > .md-children > .md-group")!;
    expect(childRow.querySelector(".md-path")?.textContent).toBe("child/");
    expect(childRow.querySelector(".md-count")?.textContent).toBe("1");

    expect(collapse).toContain('href="/canvas/team-canvas/reference/chunking">Open</a>');
    expect(collapse).toContain('href="/canvas/team-canvas/reference/chunking/edit">Code</a>');
    expect(collapse).toContain('data-copy-share="team-canvas/reference/chunking"');

    const nestedKnowledge = {
      roots: [
        {
          id: "team-canvas/index",
          missing: false,
          children: [
            {
              id: "team-canvas/reference/chunking",
              missing: false,
              children: [{ id: "laws-of-ux/reference/chunking", missing: false, children: [] }],
            },
          ],
        },
      ],
      unlinked: ["index"],
    };
    const collapseTree = indexShellHtml(ids, nestedKnowledge);
    const kdom = new JSDOM(collapseTree, { runScripts: "dangerously", url: "http://canvas.test/" }).window.document;
    const knowledge = kdom.querySelector('[data-shell="knowledge"]')!;
    expect(
      [...knowledge.querySelectorAll(":scope > .md-group > .md-subheader .md-path")].map((el) => el.textContent),
    ).toEqual(["team-canvas/index", "Unlinked"]);
    const kParent = knowledge.querySelector(":scope > .md-group")!;
    expect(kParent.querySelector(":scope > .md-subheader .md-count")?.textContent).toBe("2");
    kParent.querySelector<HTMLButtonElement>(".md-disclosure")!.click();
    const nestedK = kParent.querySelector(":scope > .md-panel > .md-children > .md-group")!;
    expect(nestedK.querySelector(".md-path")?.textContent).toBe("team-canvas/reference/chunking");
    expect(knowledge.querySelectorAll(":scope > .md-group")).toHaveLength(2);
    nestedK.querySelector<HTMLButtonElement>(".md-disclosure")!.click();
    expect(nestedK.querySelector(".md-grid")?.textContent).toContain("laws-of-ux/reference/chunking.canvas.tsx");
    expect(kdom.querySelector('[data-library-toggle="folders"]')?.getAttribute("aria-pressed")).toBe("true");
    kdom.querySelector<HTMLButtonElement>('[data-library-toggle="knowledge"]')!.click();
    expect(knowledge.hasAttribute("hidden")).toBe(false);

    expect(viewerShellHtml("demo", { kind: "ok", js: "" })).not.toContain("Library style");
    expect(editShellHtml("demo", { kind: "ok", js: "" })).not.toContain("Library style");
    expect(settlementShellHtml([])).not.toContain("Library style");
    expect(indexShellHtml([])).not.toContain("Library style");
  });

  it("a 200 with a skipped revert stays on the page and the status line shows skipped", async () => {
    const html = settlementShellHtml([
      {
        topic: "db",
        status: "escalated",
        positions: [
          { actor: "ada", plan: "postgres", live: true },
          { actor: "bob", plan: "sqlite", live: true },
        ],
      },
    ]);
    const navigations: string[] = [];
    const virtualConsole = new VirtualConsole();
    virtualConsole.on("jsdomError", (err: Error) => navigations.push(err.message));
    const dom = new JSDOM(html, {
      runScripts: "dangerously",
      url: "http://canvas.test/settlement",
      virtualConsole,
      beforeParse(window) {
        const w = window as unknown as { fetch: () => Promise<unknown> };
        w.fetch = () =>
          Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ skipped: [{ n: 2, reason: "leased by bob" }] }),
            text: () => Promise.resolve(""),
          });
      },
    });
    dom.window.document.querySelector<HTMLButtonElement>("[data-settle]")!.click();
    await vi.waitFor(() => {
      expect(dom.window.document.querySelector("[data-settle-status]")?.textContent).toContain("skipped");
    });
    expect(navigations.join("\n")).not.toMatch(/navigation/);
    expect(dom.window.document.querySelector("[data-settle-status]")?.textContent).toContain("leased by bob");
  });
});
