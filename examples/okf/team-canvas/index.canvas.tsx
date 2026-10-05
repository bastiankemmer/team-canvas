import { CanvasLink, H1, H2, Stack, Text } from "team-canvas/canvas";

export default function Index() {
  return (
    <Stack gap={16}>
      <Stack gap={4}>
        <H1>team-canvas knowledge base</H1>
        <Text tone="secondary">
          Start here. team-canvas is a self-hosted server that renders .canvas.tsx files, with an
          editor and an MCP server for AI agents. This knowledge base is itself a set of linked
          canvases.
        </Text>
      </Stack>
      <H2>Topics</H2>
      <Stack gap={4}>
        <Text>
          <CanvasLink to="reference/canvas-format">Canvas format</CanvasLink>: what a .canvas.tsx file is
          and what it may import.
        </Text>
        <Text>
          <CanvasLink to="reference/architecture">Architecture</CanvasLink>: ports, adapters and shared
          edit operations.
        </Text>
        <Text>
          <CanvasLink to="reference/http-api">HTTP API</CanvasLink>: routes for creating, reading and
          editing canvases.
        </Text>
        <Text>
          <CanvasLink to="reference/mcp-tools">MCP tools</CanvasLink>: what an AI agent can call.
        </Text>
        <Text>
          <CanvasLink to="guides/editing-workflow">Editing workflow</CanvasLink>: the safe order for an
          agent to change a canvas.
        </Text>
        <Text>
          <CanvasLink to="reference/knowledge-links">Knowledge links</CanvasLink>: how canvases link to
          each other and how agents follow the links.
        </Text>
      </Stack>
    </Stack>
  );
}
