# team-canvas

A self-hosted server that renders `.canvas.tsx` files in the browser, so a team can view and share them. Agents write the canvas source. People use the rendered result. A canvas is one React component in one file that imports from `"team-canvas/canvas"`.

## Install

```sh
npm install -g team-canvas               # gives you the `team-canvas` command
# or, inside a project (also needed to import "team-canvas/canvas" in your own React app):
npm install team-canvas react react-dom
```

Or skip the install and run it with `npx team-canvas ...`. Needs Node 20 or newer.

## Quick start

```sh
team-canvas serve ./canvases            # or: npx team-canvas serve ./canvases
                                        # http://0.0.0.0:3847
```

`./canvases` is the store root: a folder of `*.canvas.tsx` files. A canvas id may contain `/`. The library is a tree. Agents add and edit canvases over MCP. Open the URL and click **Open**. Use `--host` and `--port` to change the bind address (default `0.0.0.0:3847`).

The example is served with `team-canvas serve examples/okf`. Those ids start at `team-canvas/index`, `guides/editing-workflow`, and `reference/mcp-tools`. An OKF root is `<project-name>/index`. The library toggle is Folders (filesystem) and Knowledge (canvases reached from each id whose last segment is `index`, with everything else under Unlinked).

New here? [Getting started](docs/getting-started.md) walks through it with screenshots.

Canvases written against another canvas module can be converted. The command rewrites that module's import path to `team-canvas/canvas` in place (recursive for directories):

```sh
npx team-canvas convert --from <old-module> ./canvases
```

## What you get

- **Library** at `/`: the library is a tree. Open, Code and Copy link per canvas. Agents add and edit canvases over MCP.
- **Viewer** at `/canvas/:id`: renders the canvas and rebuilds live when the file changes.
- **Code** at `/canvas/:id/edit`: the canvas source, read-only, next to the live preview. Build errors show on the page.
- **State**: `useCanvasState` values are stored next to the canvas as `<name>.canvas.data.json`, so everyone opening the canvas sees the same state.
- **Knowledge base**: canvases can link to each other with `<CanvasLink to="reference/mcp-tools">MCP tools</CanvasLink>` (a literal canvas id from the store root), and live in folders. Agents follow the links with `list_links`, `backlinks` and `search_linked`. The library's **Knowledge** view shows each `<project-name>/index` as a tree of the canvases it links to. `examples/okf` is a worked example.
- **Agent settlement**: when several agents share one store, a write needs a lease on the canvas, every write is logged (who, why, topic) with rollback, agents declare what they are about to decide and are told right away when another agent holds a different plan, and a contested topic goes to a decision page at `/settlement` where a human picks the winner (see [Agents that share a store](#agents-that-share-a-store)).
- **MCP server** so AI agents can read, search and edit canvases (see below).
- **Convert** CLI: `team-canvas convert --from <old-module> <path>...` rewrites another canvas module's imports to `"team-canvas/canvas"`.

## Roadmap

Planned:

- Login plugins for the `Auth` port: password and OIDC.
- More stores for the `CanvasStore` port: FTP and Samba, to load a canvas from a server, edit it and upload it back.
- Agent settlement follow-ups: a blocking `await_messages` tool or agent hooks for faster delivery than "next tool call", warning or rejecting writes that contradict a settled decision, and reopening a settled topic.
- Sessions: upload a canvas and invite collaborators, with MCP support for those sessions.
- A connector for `useCanvasAction` (open agent, open file, new chat), which is a logged no-op today.

### HTTP API

| Method and path | Purpose |
| --- | --- |
| `POST /api/canvas/new` | Create. JSON body `{"id": "my-canvas", "source"?: "..."}`; without `source` a starter canvas is written. `201 {"ok": true, "id": "my-canvas"}`, `409` if it exists, `400` for a bad id. |
| `POST /api/canvas` | Upload. Header `X-Canvas-Name: my.canvas.tsx`, `text/plain` body. Returns `201 {"id": "my"}`. |
| `GET` / `PUT /api/canvas/:id/source` | Read or replace the whole source. |
| `POST /api/canvas/:id/replace` | Replace exact text in place, without rewriting the file. JSON body `{"old_string": "...", "new_string": "...", "replace_all"?: true}`. `200 {"ok": true, "id": "...", "replacements": 1}`; `400` if the text is not found or matches more than once (unless `replace_all`). |
| `GET /api/canvas/:id/check` | Does the canvas still build? `200 {"ok": true, "id": "..."}` or `{"ok": false, "id": "...", "error": "12:5 ..."}`. |
| `GET /api/canvas/:id/search?q=` | Search one canvas source. |
| `GET /api/canvas/:id/links` | Outgoing links to other canvases. |
| `GET /api/canvas/:id/backlinks` | Canvases that link here. |
| `GET /api/canvas/:id/search-linked?q=` | Search source in those direct linked canvases. |
| `GET /api/canvas/:id/orientation` | Repeating pattern and whether Add is available. |
| `POST /api/canvas/:id/add-oriented`, `/fill-slots` | Oriented Add. |
| `GET` / `PUT /api/canvas/:id/state` | Canvas state. |
| `GET /api/settlement/leases`, `POST /api/settlement/leases/acquire`, `/release` | Write leases: `{"actor", "canvas", "ttl_seconds"?}` to acquire (`{acquired, holder, expiresAt}`), `{"actor", "canvas"}` to release, `"force": true` for a human to free a stuck canvas. |
| `POST /api/settlement/intent`, `/notices` | Declare an intent, or take pending notices for an actor. See [Agents that share a store](#agents-that-share-a-store). |
| `GET /api/settlement/topics[?status=]`, `/changes[?canvas=&topic=&actor=&limit=]` | Topics with every agent's plan, and the change log. |
| `POST /api/settlement/topics/:topic/escalate`, `/settle` | Escalate to a human, or settle with `{"plan", "by"?, "revert"?}`. |
| `POST /api/settlement/revert` | Roll back log entries: `{"entries": [3, 4]}` or `{"topic": "name"}`, plus optional `"by"`. |
| `GET /settlement` | The decision page. |

## MCP for AI agents

```sh
npx team-canvas mcp ./canvases          # stdio server
```

Tools: `list_canvases`, `create_canvas`, `read_source`, `write_source`, `replace_in_source`, `check_canvas`, `search_source`, `inspect_orientation`, `add_oriented`, `fill_slots`, `move`, `list_links`, `backlinks`, `search_linked`, and for agents that share a store `acquire_lease`, `release_lease`, `list_leases`, `declare_intent`, `list_topics`, `escalate_topic`, `list_changes`. Use `search_source` to keep context small instead of reading whole files, and `replace_in_source` to change part of a canvas: `write_source` replaces the entire file. Call `check_canvas` after edits: it returns build errors as `line:col message`.

`move` renames one canvas (`from`, `to`) or a folder (`folder: true`, or when `from` is only a folder). `match` is a filename glob (`*.canvas.tsx`, `*Test.canvas.tsx`) and moves only those canvases inside the folder. State files move with the canvas. Lease every source id and every new id first. CanvasLink targets are left as written.

Example MCP client config (`mcp.json`):

```json
{
  "mcpServers": {
    "team-canvas": {
      "command": "npx",
      "args": ["-y", "team-canvas", "mcp", "/absolute/path/to/canvases"]
    }
  }
}
```

### Agents that share a store

Several agents on one store, each running its own `team-canvas mcp` process, must not overwrite each other, and will sooner or later decide the same thing differently. team-canvas serializes writes with leases, logs every change, finds conflicting decisions early and lets a human settle them. State is shared through the store (`.settlement.canvas.data.json` and `.snap/` next to the canvases, written under a lock), so it works across processes.

1. **Lease before you write.** Every write (`create_canvas`, `write_source`, `replace_in_source`, `add_oriented`, `fill_slots`, `move`, the HTTP write routes and upload) needs an `actor` that holds the lease on that canvas. This is not optional: without an actor or a lease the write is refused (HTTP 400 and 409) and nothing is written. `acquire_lease({actor, canvas, ttl_seconds?})` returns `{acquired, holder, expiresAt}`; when someone else holds it you get `acquired: false`, the holder is told you are waiting, and you get a notice when it is released. A lease lasts 5 minutes by default (max 1 hour) and expires on its own, so a crashed agent cannot hold a canvas; call `acquire_lease` again to renew. `release_lease` gives it back, `list_leases` shows who holds what. To create a canvas, lease its new id first. Reads never need a lease.
2. **Say why.** Writes also take optional `reason` and `topic`. Over HTTP the actor, reason and topic are the headers `X-Canvas-Actor`, `X-Canvas-Reason` and `X-Canvas-Topic`. Each write is logged with a hash of the content before and after, and the old content is kept so it can be rolled back. Read the log with `list_changes`.
3. **Declare intent before deciding.** `declare_intent({actor, topic, plan, canvas?, reason?, ttl_seconds?})` claims a topic (lowercase, for example `auth-session-storage`; use `list_topics` to reuse a name). If another live agent holds a different plan, or the topic was settled differently, the result says `conflict: true`. `related` lists other open topics on the same canvas, which is where contradictions hide when two agents name the same decision differently. A claim lapses after `ttl_seconds` (default 30 minutes).
4. **Negotiate.** Calling `declare_intent` again with the other agent's plan concedes, and when all live plans match the topic is settled by agreement. Insisting counts as a round; after 2 rounds the topic is `escalated`. `escalate_topic` skips the wait. An escalated topic accepts no more plans.
5. **A human settles.** Open `/settlement`: each topic shows every agent's plan and one button per plan. Settling can also revert the writes tagged with that topic by the agents whose plan lost. A revert only happens where the canvas still holds exactly what that write produced and nobody else holds its lease; anything else is reported and left alone. `settle`, `revert` and forced lease release are HTTP only, not MCP tools, so access follows your Auth setup.
6. **Notices.** Pass the same `actor` on every MCP call. Pending notices for that actor (a conflict, another agent writing under your contested topic, an escalation, a decision, someone waiting for or freeing a lease) come back as a second text item `{"notices": [...]}` on the reply and are delivered once. There is no push: an agent sees a notice the next time it calls a tool. Over HTTP use `POST /api/settlement/notices`.

Embedding the library in a single process where nothing else writes can pass `requireLease: false` to `createCanvasEditOps` or `startHttpServer`. The CLI never does.

Limits: the log keeps the last 1000 writes; snapshots are never cleaned up; a store without `updateState` can lose an update when two agents write at the very same moment; the lease is checked just before the write, so a lease that expires in that instant can still let one write through.

## Use canvases in a normal React app

Import from `team-canvas/canvas`; Vite/TS resolve it through the package exports, no alias needed. `examples/vite/vite.config.ts`:

```ts
resolve: {
  dedupe: ["react", "react-dom"],
}
```

Outside the server, `useCanvasState` is plain in-memory state.

## Architecture

Ports and adapters, so storage and login can be swapped without touching the rest:

- `CanvasStore` port (`src/ports`, adapters under `src/adapters/{store,auth,http,mcp}`): list, read and write source and state. Shipped adapter: local filesystem. New stores (FTP, Samba, S3, ...) only need to implement this port.
- `Auth` port: shipped adapter `DisabledAuthAdapter` (no login, the default). Add your own for password or OIDC.
- Shared edit operations (`src/app/edit`) are used by both the HTTP and the MCP adapters. `add_oriented` and `fill_slots` return `{ ok, id, slots }`, slots as `{ id, label }` in document order. Link following (`list_links`, `backlinks`, `search_linked`) returns the list, backlink, and search arrays.
- The SDK (`src/sdk`) provides the `team-canvas/canvas` surface: layout, forms, charts, diff view, todo list, DAG layout and theme hooks.

## Security

By default the server binds `0.0.0.0` with **no login**. A write needs an actor and a lease, but anyone who can reach the server can take that lease, upload, edit and overwrite canvases. A canvas is React code that runs in every viewer's browser. Only run it on a trusted network, behind a reverse proxy or VPN, or bind to loopback with `--host 127.0.0.1`. Treat uploaded canvases as trusted code.

## Limitations

- `useCanvasAction` (open agent, open file, new chat) is a logged no-op until a connector is configured.
- Styling is the team-canvas default theme.
- One store adapter (local filesystem) and no built-in login (see the roadmap).

## Development

```sh
npm ci
npm run build       # tsc
npm test            # vitest
node dist/cli.js serve ./canvases
```

## License

MIT, see LICENSE.
