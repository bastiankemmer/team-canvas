import type { CanvasStateStore } from "../sdk/hooks.js";

export type TeamCanvasBoot = {
  canvasId: string;
  state: Record<string, unknown>;
};

declare global {
  interface Window {
    __TEAM_CANVAS__?: TeamCanvasBoot;
  }
}

/** Read host-injected boot payload; null when missing (e.g. unit harness). */
export function readTeamCanvasBoot(): TeamCanvasBoot | null {
  const boot =
    typeof globalThis !== "undefined"
      ? (globalThis as unknown as { __TEAM_CANVAS__?: TeamCanvasBoot })
          .__TEAM_CANVAS__
      : undefined;
  if (!boot || typeof boot.canvasId !== "string") return null;
  const state =
    boot.state !== null &&
    typeof boot.state === "object" &&
    !Array.isArray(boot.state)
      ? { ...(boot.state as Record<string, unknown>) }
      : {};
  return { canvasId: boot.canvasId, state };
}

export type HttpCanvasStateStoreOptions = {
  fetch?: typeof globalThis.fetch;
  onWriteError?: (message: string) => void;
};

/**
 * Client store: local bag + serialized PUT of the full sidecar object.
 * Write failures call onWriteError instead of being swallowed.
 */
export function createHttpCanvasStateStore(
  boot: TeamCanvasBoot,
  opts: HttpCanvasStateStoreOptions = {},
): CanvasStateStore {
  const bag: Record<string, unknown> = { ...boot.state };
  const fetchFn = opts.fetch ?? globalThis.fetch.bind(globalThis);
  const url = `/api/canvas/${encodeURIComponent(boot.canvasId)}/state`;
  // ponytail: serialize writes so rapid set()s don't clobber; ceiling = multi-tab; upgrade = ETag/merge
  let tail: Promise<void> = Promise.resolve();

  return {
    get(key) {
      return Object.prototype.hasOwnProperty.call(bag, key)
        ? bag[key]
        : undefined;
    },
    set(key, value) {
      bag[key] = value;
      tail = tail.then(async () => {
        try {
          const res = await fetchFn(url, {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(bag),
          });
          if (!res.ok) {
            const text = await res.text().catch(() => res.statusText);
            opts.onWriteError?.(
              text || `State write failed (${res.status})`,
            );
          }
        } catch (err) {
          opts.onWriteError?.(
            err instanceof Error ? err.message : String(err),
          );
        }
      });
    },
  };
}

/** Surface persist errors on the viewer status strip. */
export function surfaceViewerWriteError(message: string): void {
  const el = document.querySelector<HTMLElement>('[data-shell="viewer"]');
  if (!el) return;
  el.textContent = message;
  el.setAttribute("data-tone", "error");
  el.hidden = false;
}
