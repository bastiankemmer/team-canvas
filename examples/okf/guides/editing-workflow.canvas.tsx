import { CanvasLink, Callout, Code, H1, H2, Stack, Text } from "team-canvas/canvas";

export default function EditingWorkflow() {
  return (
    <Stack gap={16}>
      <Stack gap={4}>
        <H1>Editing workflow</H1>
        <Text tone="secondary">How an agent changes a canvas without rewriting it.</Text>
      </Stack>
      <H2>Order</H2>
      <Stack gap={4}>
        <Text>1. <Code>search_source</Code> finds the text. Do not read a whole large file.</Text>
        <Text>
          2. <Code>replace_in_source</Code> swaps exact text. It fails if the text is missing or
          matches more than once, so an edit never lands in the wrong place.
        </Text>
        <Text>
          3. <Code>check_canvas</Code> confirms the canvas still builds. Errors come back as{" "}
          <Code>line:col message</Code>.
        </Text>
      </Stack>
      <Callout tone="warning">
        write_source replaces the entire file. Use it for a new canvas or a full rewrite only.
      </Callout>
      <H2>Adding a repeated block</H2>
      <Text>
        Use <Code>add_oriented</Code> to clone the repeating block with blank slots, then{" "}
        <Code>fill_slots</Code> to fill them by id.
      </Text>
      <H2>Related</H2>
      <Stack gap={4}>
        <Text>
          <CanvasLink to="reference/mcp-tools">MCP tools</CanvasLink>
        </Text>
        <Text>
          <CanvasLink to="reference/canvas-format">Canvas format</CanvasLink>: the rules check_canvas
          enforces.
        </Text>
        <Text>
          <CanvasLink to="index">Knowledge base index</CanvasLink>
        </Text>
      </Stack>
    </Stack>
  );
}
