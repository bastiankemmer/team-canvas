import { JSDOM } from "jsdom";
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
    expect(indexRow.querySelector('a[href="/canvas/index/edit"]')?.textContent).toBe("Code");

    const nested = guides.querySelector(".canvas-row")!;
    expect(nested.querySelector('a[href="/canvas/guides/editing-workflow"]')?.textContent).toBe("Open");
    expect(nested.querySelector('a[href="/canvas/guides/editing-workflow/edit"]')?.textContent).toBe("Code");
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
    const itemLabel = (li: Element) => {
      const details = [...li.children].find((el) => el.tagName === "DETAILS");
      if (details) {
        return [...details.children].find((el) => el.tagName === "SUMMARY")?.textContent ?? "";
      }
      return li.querySelector(".canvas-id")?.textContent ?? "";
    };
    const shown = () =>
      [...doc.querySelectorAll("[data-library-panel]")].filter((panel) => !panel.hasAttribute("hidden"));

    const folders = doc.querySelector('ul[data-shell="index"]')!;
    const knowledge = doc.querySelector('ul[data-shell="knowledge"]')!;
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
    expect(folders.innerHTML).toBe(plain.querySelector('ul[data-shell="index"]')!.innerHTML);

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

    expect([...knowledge.children].map(itemLabel)).toEqual([
      "team-canvas/index",
      "proj/index",
      "solo/index",
      "Unlinked",
    ]);
    expect(knowledge.innerHTML).toContain(
      knowledge.children[0]!.outerHTML + knowledge.children[1]!.outerHTML,
    );
    const team = [...knowledge.children].find((li) => itemLabel(li) === "team-canvas/index")!;
    const teamDetails = team.querySelector("details") as HTMLDetailsElement;
    expect(teamDetails.hasAttribute("open")).toBe(true);
    expect(teamDetails.querySelector("summary")?.textContent).toBe("team-canvas/index");
    expect(teamDetails.querySelector("summary")?.querySelector("a, button")).toBeNull();
    expect(
      [...teamDetails.children].find((el) => el.classList.contains("canvas-file"))?.textContent,
    ).toBe("team-canvas/index.canvas.tsx");
    const teamKids = teamDetails.querySelector("ul")!;
    expect([...teamKids.children].map(itemLabel)).toEqual([
      "guides/bill ing",
      "z/late",
      "gone/topic",
    ]);
    expect(teamKids.innerHTML).toContain(
      teamKids.children[0]!.outerHTML + teamKids.children[1]!.outerHTML,
    );

    const branch = teamKids.children[0]!.querySelector("details") as HTMLDetailsElement;
    expect(branch.hasAttribute("open")).toBe(false);
    expect(branch.querySelector("summary")?.textContent).toBe("guides/bill ing");
    expect(branch.querySelector("summary")?.querySelector("a, button")).toBeNull();
    expect(
      [...branch.children].find((el) => el.classList.contains("canvas-file"))?.textContent,
    ).toBe("guides/bill ing.canvas.tsx");
    expect([...branch.querySelector("ul")!.children].map(itemLabel)).toEqual(["reference/http-api"]);

    const leaf = teamKids.children[1]!;
    expect(leaf.classList.contains("canvas-row")).toBe(true);
    expect(leaf.querySelector("details")).toBeNull();
    expect(leaf.querySelector(".canvas-id")?.textContent).toBe("z/late");
    expect(leaf.querySelector(".canvas-file")?.textContent).toBe("z/late.canvas.tsx");

    const solo = [...knowledge.children].find((li) => itemLabel(li) === "solo/index")!;
    expect(solo.classList.contains("canvas-row")).toBe(true);
    expect(solo.querySelector("details")).toBeNull();
    expect(solo.querySelector(".canvas-file")?.textContent).toBe("solo/index.canvas.tsx");

    const broken = knowledge.querySelector('[data-missing="gone/topic"]')!;
    expect(broken.querySelector(".canvas-id")?.textContent).toBe("gone/topic");
    expect(broken.querySelector(".canvas-file")?.textContent).toBe("missing");
    expect(broken.querySelector("a, button")).toBeNull();

    const unlinked = [...knowledge.children].find((li) => itemLabel(li) === "Unlinked")!;
    const unlinkedDetails = unlinked.querySelector("details") as HTMLDetailsElement;
    expect(unlinkedDetails.hasAttribute("open")).toBe(false);
    expect([...unlinkedDetails.querySelector("ul")!.children].map(itemLabel)).toEqual(["notes/loose"]);

    const proj = [...knowledge.children].find((li) => itemLabel(li) === "proj/index")!;
    expect([...proj.querySelector("details ul")!.children].map(itemLabel)).toEqual(["m/two", "m/one"]);

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

    const branchActions = [...branch.children].find((el) => el.classList.contains("canvas-actions"))!;
    expect(branch.querySelector("summary")?.contains(branchActions)).toBe(false);
    branchActions.querySelector("button")!.click();
    expect(branch.open).toBe(false);
    expect(copied).toBe("http://canvas.test/canvas/guides/bill%20ing");
    const branchOpen = branchActions.querySelector("a")!;
    branchOpen.addEventListener("click", (event) => event.preventDefault());
    branchOpen.click();
    expect(branch.open).toBe(false);
    const teamOpen = [...teamDetails.children]
      .find((el) => el.classList.contains("canvas-actions"))!
      .querySelector("a")!;
    teamOpen.addEventListener("click", (event) => event.preventDefault());
    teamOpen.click();
    expect(teamDetails.open).toBe(true);

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
    const looseKnowledge = looseDoc.querySelector('ul[data-shell="knowledge"]')!;
    const looseDetails = looseKnowledge.querySelector("details") as HTMLDetailsElement;
    expect(looseDoc.querySelector('[data-library-toggle="folders"]')?.getAttribute("aria-pressed")).toBe("true");
    expect(looseKnowledge.hasAttribute("hidden")).toBe(true);
    expect(looseDetails.hasAttribute("open")).toBe(true);
    expect(looseDetails.querySelector("summary")?.textContent).toBe("Unlinked");
    looseDoc.querySelector<HTMLButtonElement>('[data-library-toggle="knowledge"]')!.click();
    expect(looseKnowledge.hasAttribute("hidden")).toBe(false);
    expect(looseDetails.open).toBe(true);
    expect([...looseDetails.querySelector("ul")!.children].map(itemLabel)).toEqual(["b", "a"]);
    const looseRows = looseDetails.querySelector("ul")!;
    expect(looseRows.innerHTML).toBe(looseRows.children[0]!.outerHTML + looseRows.children[1]!.outerHTML);
    expect(looseDetails.querySelector(".canvas-row a")?.textContent).toBe("Open");

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
    }).window.document.querySelector('ul[data-shell="knowledge"]')!;
    expect(linkedKnowledge.textContent ?? "").not.toContain("Unlinked");
    expect(linkedKnowledge.innerHTML).toBe([...linkedKnowledge.children].map((el) => el.outerHTML).join(""));
    expect(linkedOnly).toContain("data-library-toggle");
  });
});
