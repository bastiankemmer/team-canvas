import { CanvasLink, Code, H1, H2, Stack, Text } from "team-canvas/canvas";

export default function Architecture() {
  return (
    <Stack gap={16}>
      <Stack gap={4}>
        <H1>Architecture</H1>
        <Text tone="secondary">
          Hexagonal: the app logic knows two ports, and everything else is an adapter.
        </Text>
      </Stack>
      <H2>Layers</H2>
      <Stack gap={4}>
        <Text>
          Ports (<Code>src/ports</Code>): <Code>CanvasStore</Code> reads, writes and lists canvases,
          and <Code>Auth</Code> decides who may call. Today the adapters are{" "}
          <Code>LocalFilesystemCanvasStore</Code> and <Code>DisabledAuthAdapter</Code>.
        </Text>
        <Text>
          App logic (<Code>src/app</Code>): <Code>build</Code> bundles a canvas with esbuild;{" "}
          <Code>edit</Code> holds the edit operations that work on source text.
        </Text>
        <Text>
          Adapters (<Code>src/adapters</Code>): an HTTP server and an MCP stdio server. Both call
          the same <Code>createCanvasEditOps(store)</Code> object, so a result has the same shape
          over HTTP and MCP.
        </Text>
      </Stack>
      <H2>Related</H2>
      <Stack gap={4}>
        <Text>
          <CanvasLink to="reference/http-api">HTTP API</CanvasLink> and{" "}
          <CanvasLink to="reference/mcp-tools">MCP tools</CanvasLink>: the two adapters.
        </Text>
        <Text>
          <CanvasLink to="reference/canvas-format">Canvas format</CanvasLink>: what the store holds.
        </Text>
        <Text>
          <CanvasLink to="team-canvas/index">Knowledge base index</CanvasLink>
        </Text>
      </Stack>
    </Stack>
  );
}
