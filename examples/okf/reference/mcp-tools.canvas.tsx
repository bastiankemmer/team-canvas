import { CanvasLink, Code, H1, H2, Stack, Text } from "team-canvas/canvas";

export default function McpTools() {
  return (
    <Stack gap={16}>
      <Stack gap={4}>
        <H1>MCP tools</H1>
        <Text tone="secondary">
          Run <Code>team-canvas mcp ./canvases</Code> as a stdio server in the agent's MCP config.
        </Text>
      </Stack>
      <H2>Tools</H2>
      <Stack gap={4}>
        <Text>
          Find and read: <Code>list_canvases</Code>, <Code>read_source</Code>,{" "}
          <Code>search_source</Code>.
        </Text>
        <Text>
          Create and change: <Code>create_canvas</Code>, <Code>write_source</Code> (whole file),{" "}
          <Code>replace_in_source</Code> (part of a file), <Code>check_canvas</Code>, <Code>move</Code>{" "}
          (one canvas, or a folder with <Code>folder</Code>, or a filename glob in <Code>match</Code>
          ).
        </Text>
        <Text>
          Oriented Add: <Code>inspect_orientation</Code>, <Code>add_oriented</Code>,{" "}
          <Code>fill_slots</Code>.
        </Text>
        <Text>
          Follow links: <Code>list_links</Code>, <Code>backlinks</Code>,{" "}
          <Code>search_linked</Code>.
        </Text>
        <Text>
          Agents that share a store: <Code>acquire_lease</Code>, <Code>release_lease</Code>,{" "}
          <Code>list_leases</Code>, <Code>declare_intent</Code>, <Code>list_topics</Code>,{" "}
          <Code>escalate_topic</Code>, <Code>list_changes</Code>. A write needs an{" "}
          <Code>actor</Code> that holds the canvas lease, and takes optional <Code>reason</Code> and{" "}
          <Code>topic</Code>; pass the same actor on every call to receive notices.
        </Text>
      </Stack>
      <H2>Related</H2>
      <Stack gap={4}>
        <Text>
          <CanvasLink to="guides/editing-workflow">Editing workflow</CanvasLink>: which tool to use when.
        </Text>
        <Text>
          <CanvasLink to="reference/knowledge-links">Knowledge links</CanvasLink>: the three link tools.
        </Text>
        <Text>
          <CanvasLink to="reference/http-api">HTTP API</CanvasLink>: the same operations over HTTP.
        </Text>
      </Stack>
    </Stack>
  );
}
