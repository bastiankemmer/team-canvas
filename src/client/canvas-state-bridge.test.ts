/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createHttpCanvasStateStore,
  readTeamCanvasBoot,
  surfaceViewerWriteError,
  type TeamCanvasBoot,
} from "./canvas-state-bridge.js";

afterEach(() => {
  delete (globalThis as { __TEAM_CANVAS__?: TeamCanvasBoot }).__TEAM_CANVAS__;
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("canvas-state-bridge edge paths", () => {
  it("crap:readTeamCanvasBoot: missing or non-string canvasId returns null", () => {
    expect(readTeamCanvasBoot()).toBeNull();

    (globalThis as { __TEAM_CANVAS__?: unknown }).__TEAM_CANVAS__ = {
      canvasId: 1,
      state: {},
    };
    expect(readTeamCanvasBoot()).toBeNull();
  });

  it("crap:readTeamCanvasBoot: non-object state becomes empty object", () => {
    (globalThis as { __TEAM_CANVAS__?: TeamCanvasBoot }).__TEAM_CANVAS__ = {
      canvasId: "x",
      state: null as unknown as Record<string, unknown>,
    };
    expect(readTeamCanvasBoot()).toEqual({ canvasId: "x", state: {} });

    (globalThis as { __TEAM_CANVAS__?: unknown }).__TEAM_CANVAS__ = {
      canvasId: "y",
      state: ["not", "object"],
    };
    expect(readTeamCanvasBoot()).toEqual({ canvasId: "y", state: {} });

    (globalThis as { __TEAM_CANVAS__?: TeamCanvasBoot }).__TEAM_CANVAS__ = {
      canvasId: "z",
      state: { a: 1 },
    };
    expect(readTeamCanvasBoot()).toEqual({ canvasId: "z", state: { a: 1 } });
  });

  it("mutation: invalid/missing boot state is rejected (null/array/string → empty)", () => {
    expect(readTeamCanvasBoot()).toBeNull();

    (globalThis as { __TEAM_CANVAS__?: unknown }).__TEAM_CANVAS__ = undefined;
    expect(readTeamCanvasBoot()).toBeNull();

    (globalThis as { __TEAM_CANVAS__?: unknown }).__TEAM_CANVAS__ = {
      canvasId: "s",
      state: "not-an-object",
    };
    expect(readTeamCanvasBoot()).toEqual({ canvasId: "s", state: {} });

    (globalThis as { __TEAM_CANVAS__?: unknown }).__TEAM_CANVAS__ = {
      canvasId: "arr",
      state: [1, 2, 3],
    };
    const arrBoot = readTeamCanvasBoot();
    expect(arrBoot).toEqual({ canvasId: "arr", state: {} });
    expect(Object.keys(arrBoot!.state)).toEqual([]);
  });

  it("crap:surfaceViewerWriteError: no viewer shell is a no-op; with shell sets tone and text", () => {
    surfaceViewerWriteError("gone");
    expect(document.body.textContent).toBe("");

    const el = document.createElement("p");
    el.setAttribute("data-shell", "viewer");
    el.hidden = true;
    document.body.appendChild(el);
    surfaceViewerWriteError("disk full");
    expect(el.textContent).toBe("disk full");
    expect(el.getAttribute("data-tone")).toBe("error");
    expect(el.hidden).toBe(false);
  });

  it("crap:createHttpCanvasStateStore: network throw surfaces via onWriteError", async () => {
    const msg = await new Promise<string>((resolve) => {
      const store = createHttpCanvasStateStore(
        { canvasId: "c", state: {} },
        {
          fetch: async () => {
            throw new Error("network down");
          },
          onWriteError: (m) => resolve(m),
        },
      );
      store.set("k", 1);
    });
    expect(msg).toMatch(/network down/);
  });

  it("crap:createHttpCanvasStateStore: non-ok response without body uses status text", async () => {
    const msg = await new Promise<string>((resolve) => {
      const store = createHttpCanvasStateStore(
        { canvasId: "c", state: { k: 0 } },
        {
          fetch: async () =>
            new Response(null, { status: 503, statusText: "Unavailable" }),
          onWriteError: (m) => resolve(m),
        },
      );
      store.set("k", 2);
    });
    expect(msg).toMatch(/Unavailable|503/);
  });

  it("crap:createHttpCanvasStateStore: get returns undefined for missing keys", () => {
    const store = createHttpCanvasStateStore({
      canvasId: "c",
      state: { present: 1 },
    });
    expect(store.get("present")).toBe(1);
    expect(store.get("absent")).toBeUndefined();
  });

  it('@task-7: it PUTs "/api/canvas/guides/editing-workflow/state"', async () => {
    (globalThis as { __TEAM_CANVAS__?: TeamCanvasBoot }).__TEAM_CANVAS__ = {
      canvasId: "guides/editing-workflow",
      state: {},
    };
    const boot = readTeamCanvasBoot();
    expect(boot?.canvasId).toBe("guides/editing-workflow");

    let seenUrl = "";
    let seenMethod = "";
    const store = createHttpCanvasStateStore(boot!, {
      fetch: async (url, init) => {
        seenUrl = String(url);
        seenMethod = init?.method ?? "";
        return new Response(null, { status: 204 });
      },
    });
    store.set("draft", true);
    await vi.waitFor(() => {
      expect(seenMethod).toBe("PUT");
    });
    expect(seenUrl).toBe("/api/canvas/guides/editing-workflow/state");
    expect(seenUrl).not.toBe("/api/canvas/guides%2Fediting-workflow/state");
  });

  it("mutation: state bag is a copy; PUT sends application/json content-type", async () => {
    const bootState: Record<string, unknown> = { n: 1 };
    ;(globalThis as { __TEAM_CANVAS__?: TeamCanvasBoot }).__TEAM_CANVAS__ = {
      canvasId: "copy",
      state: bootState,
    };
    const boot = readTeamCanvasBoot()!;
    expect(boot.state).toEqual({ n: 1 });
    bootState.n = 99;
    expect(boot.state.n).toBe(1);

    let seenContentType: string | null = null;
    let seenBody: string | null = null;
    const store = createHttpCanvasStateStore(
      { canvasId: "c", state: { k: 0 } },
      {
        fetch: async (_url, init) => {
          const h = init?.headers as Record<string, string> | undefined;
          seenContentType = h?.["content-type"] ?? null;
          seenBody = typeof init?.body === "string" ? init.body : null;
          return new Response(null, { status: 204 });
        },
      },
    );
    const bagSeed = { k: 0 };
    const store2 = createHttpCanvasStateStore({
      canvasId: "c2",
      state: bagSeed,
    });
    bagSeed.k = 7;
    expect(store2.get("k")).toBe(0);

    store.set("k", 2);
    await vi.waitFor(() => {
      expect(seenContentType).toBe("application/json");
    });
    expect(seenBody).toBe(JSON.stringify({ k: 2 }));
  });

  it("mutation: a 200 PUT does not call onWriteError", async () => {
    const errors: string[] = [];
    let fetched = false;
    const store = createHttpCanvasStateStore(
      { canvasId: "c", state: {} },
      {
        fetch: async () => {
          fetched = true;
          return new Response("saved", { status: 200, statusText: "OK" });
        },
        onWriteError: (message) => errors.push(message),
      },
    );
    store.set("draft", true);
    await vi.waitFor(() => expect(fetched).toBe(true));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(errors).toEqual([]);
  });

  it("mutation: text() rejection reports statusText", async () => {
    const msg = await new Promise<string>((resolve) => {
      const store = createHttpCanvasStateStore(
        { canvasId: "c", state: {} },
        {
          fetch: async () => {
            const res = new Response("ignored", {
              status: 502,
              statusText: "Bad Gateway",
            });
            res.text = () => Promise.reject(new Error("no body"));
            return res;
          },
          onWriteError: (message) => resolve(message),
        },
      );
      store.set("k", 1);
    });
    expect(msg).toBe("Bad Gateway");
  });

  it("mutation: a failed PUT without onWriteError does not throw", async () => {
    const rejections: unknown[] = [];
    const onRejection = (reason: unknown) => {
      rejections.push(reason);
    };
    process.on("unhandledRejection", onRejection);
    try {
      const httpFail = createHttpCanvasStateStore(
        { canvasId: "c", state: {} },
        {
          fetch: async () => new Response("nope", { status: 500, statusText: "Nope" }),
        },
      );
      httpFail.set("k", 1);

      const thrown = createHttpCanvasStateStore(
        { canvasId: "d", state: {} },
        {
          fetch: async () => {
            throw new Error("network down");
          },
        },
      );
      thrown.set("k", 2);

      for (let i = 0; i < 5; i++) await new Promise((resolve) => setTimeout(resolve, 0));
      expect(rejections).toEqual([]);
      expect(httpFail.get("k")).toBe(1);
      expect(thrown.get("k")).toBe(2);
    } finally {
      process.off("unhandledRejection", onRejection);
    }
  });
});
