# team-canvas

A self-hosted server that renders `.canvas.tsx` files in the browser, so a team can view, share and edit them. A canvas is one React component in one file that imports from `"team-canvas/canvas"`.

## Quick start

```sh
npm ci
npm run build
node dist/cli.js serve ./canvases        # http://0.0.0.0:3847
```

`<root>` is a folder of `*.canvas.tsx` files. Open the URL, upload a canvas or drop files into the folder, and click **Open**. Use `--host` and `--port` to change the bind address (default `0.0.0.0:3847`).
To get a `team-canvas` command on your PATH, run `npm link` after building.

Canvases written against another canvas module can be converted. The command rewrites that module's import path to `team-canvas/canvas` in place (recursive for directories):

```sh
team-canvas convert --from <old-module> ./canvases
# or: node dist/cli.js convert --from <old-module> path/to/file.canvas.tsx
```

## What you get

- **Library** at `/`: lists canvases, upload by button or drag and drop, Open, Edit and Copy link per canvas.- **Viewer** at `/canvas/:id`: renders the canvas and rebuilds live when the file changes.
- **Editor** at `/canvas/:id/edit` with a **UI | Code** switch:
  - **UI**: live preview plus *Oriented Add*. It finds a repeating block in the canvas (for example a `Card` with a `Button`), clones it with blank slots, and you fill in the text. The result is real `.canvas.tsx` source, with the same handlers wired.
  - **Code**: a full source editor next to the preview. Save with the button or Cmd/Ctrl+S. Build errors show in the status line.
- **State**: `useCanvasState` values are stored next to the canvas as `<name>.canvas.data.json`, so everyone opening the canvas sees the same state.
- **MCP server** so AI agents can read, search and edit canvases (see below).
- **Convert** CLI: `team-canvas convert --from <old-module> <path>...` rewrites another canvas module's imports to `"team-canvas/canvas"`.

### HTTP API

| Method and path | Purpose |
| --- | --- |
| `POST /api/canvas` | Upload. Header `X-Canvas-Name: my.canvas.tsx`, `text/plain` body. Returns `201 {"id": "my"}`. |
| `GET` / `PUT /api/canvas/:id/source` | Read or replace the source. |
| `GET /api/canvas/:id/search?q=` | Search one canvas source. |
| `GET /api/canvas/:id/orientation` | Repeating pattern and whether Add is available. |
| `POST /api/canvas/:id/add-oriented`, `/fill-slots` | Oriented Add. |
| `GET` / `PUT /api/canvas/:id/state` | Canvas state. |

## MCP for AI agents

```sh
node dist/cli.js mcp ./canvases          # stdio server
```

Tools: `list_canvases`, `read_source`, `write_source`, `search_source`, `inspect_orientation`, `add_oriented`, `fill_slots`. Use `search_source` to keep context small instead of reading whole files.

Example MCP client config (`mcp.json`):

```json
{
  "mcpServers": {
    "team-canvas": {
      "command": "node",
      "args": ["/absolute/path/to/team-canvas/dist/cli.js", "mcp", "/absolute/path/to/canvases"]
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

- `CanvasStore` port (`src/ports`): list, read and write source and state. Shipped adapter: local filesystem. New stores (FTP, Samba, S3, ...) only need to implement this port.
- `Auth` port: shipped adapter `DisabledAuthAdapter` (no login, the default). Add your own for password or OIDC.
- Shared edit operations (`src/app`) are used by both the HTTP and the MCP adapters.
- The SDK (`src/sdk`) provides the `team-canvas/canvas` surface: layout, forms, charts, diff view, todo list, DAG layout and theme hooks.

## Security

By default the server binds `0.0.0.0` with **no login**. Anyone who can reach it can upload, edit and overwrite canvases, and a canvas is React code that runs in every viewer's browser. Only run it on a trusted network, behind a reverse proxy or VPN, or bind to loopback with `--host 127.0.0.1`. Treat uploaded canvases as trusted code.

## Limitations

- `useCanvasAction` (open agent, open file, new chat) is a logged no-op until a connector is configured.
- Styling is the team-canvas default theme.
- One store adapter (local filesystem) and no built-in login yet. No realtime collaboration yet.

## Development

```sh
npm ci
npm run build       # tsc
npm test            # vitest
```

## License

MIT, see LICENSE.
