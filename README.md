# team-canvas

A self-hosted server that renders `.canvas.tsx` files in the browser, so a team can view, share and edit them. A canvas is one React component in one file that imports from `"team-canvas/canvas"`.

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

`./canvases` is a folder of `*.canvas.tsx` files. Open the URL, upload a canvas or drop files into the folder, and click **Open**. Use `--host` and `--port` to change the bind address (default `0.0.0.0:3847`).

New here? [Getting started](docs/getting-started.md) walks through it with screenshots.

Canvases written against another canvas module can be converted. The command rewrites that module's import path to `team-canvas/canvas` in place (recursive for directories):

```sh
npx team-canvas convert --from <old-module> ./canvases
```

## What you get

- **Library** at `/`: lists canvases. **New** creates a canvas from a name and opens it in the editor; upload by button or drag and drop; Open, Edit and Copy link per canvas.
- **Viewer** at `/canvas/:id`: renders the canvas and rebuilds live when the file changes.
- **Editor** at `/canvas/:id/edit` with a **UI | Code** switch:
  - **UI**: live preview plus *Oriented Add*. It finds a repeating block in the canvas (for example a `Card` with a `Button`), clones it with blank slots, and you fill in the text. The result is real `.canvas.tsx` source, with the same handlers wired.
  - **Code**: a full source editor next to the preview. Save with the button or Cmd/Ctrl+S. Build errors show in the status line.
- **State**: `useCanvasState` values are stored next to the canvas as `<name>.canvas.data.json`, so everyone opening the canvas sees the same state.
- **MCP server** so AI agents can read, search and edit canvases (see below).
- **Convert** CLI: `team-canvas convert --from <old-module> <path>...` rewrites another canvas module's imports to `"team-canvas/canvas"`.

## Roadmap

Planned:

- Login plugins for the `Auth` port: password and OIDC.
- More stores for the `CanvasStore` port: FTP and Samba, to load a canvas from a server, edit it and upload it back.
- Realtime collaboration on the same canvas.
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
| `GET /api/canvas/:id/orientation` | Repeating pattern and whether Add is available. |
| `POST /api/canvas/:id/add-oriented`, `/fill-slots` | Oriented Add. |
| `GET` / `PUT /api/canvas/:id/state` | Canvas state. |

## MCP for AI agents

```sh
npx team-canvas mcp ./canvases          # stdio server
```

Tools: `list_canvases`, `create_canvas`, `read_source`, `write_source`, `replace_in_source`, `check_canvas`, `search_source`, `inspect_orientation`, `add_oriented`, `fill_slots`. Use `search_source` to keep context small instead of reading whole files, and `replace_in_source` to change part of a canvas: `write_source` replaces the entire file. Call `check_canvas` after edits: it returns build errors as `line:col message`.

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
- Shared edit operations (`src/app/edit`) are used by both the HTTP and the MCP adapters, and return the same result shape (`{ ok, id, slots }`, slots as `{ id, label }` in document order).
- The SDK (`src/sdk`) provides the `team-canvas/canvas` surface: layout, forms, charts, diff view, todo list, DAG layout and theme hooks.

## Security

By default the server binds `0.0.0.0` with **no login**. Anyone who can reach it can upload, edit and overwrite canvases, and a canvas is React code that runs in every viewer's browser. Only run it on a trusted network, behind a reverse proxy or VPN, or bind to loopback with `--host 127.0.0.1`. Treat uploaded canvases as trusted code.

## Limitations

- `useCanvasAction` (open agent, open file, new chat) is a logged no-op until a connector is configured.
- Styling is the team-canvas default theme.
- One store adapter (local filesystem), no built-in login and no realtime collaboration yet (see the roadmap).

## Development

```sh
npm ci
npm run build       # tsc
npm test            # vitest
node dist/cli.js serve ./canvases
```

## License

MIT, see LICENSE.
