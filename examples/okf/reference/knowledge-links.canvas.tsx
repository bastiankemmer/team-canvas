import { CanvasLink, Code, H1, H2, Stack, Text } from "team-canvas/canvas";

export default function KnowledgeLinks() {
  return (
    <Stack gap={16}>
      <Stack gap={4}>
        <H1>Knowledge links</H1>
        <Text tone="secondary">
          Canvases instead of Markdown files: one topic per canvas, linked to each other.
        </Text>
      </Stack>
      <H2>Writing a link</H2>
      <Text>
        Use the CanvasLink component with a literal canvas id:{" "}
        <Code>{'<CanvasLink to="reference/mcp-tools">MCP tools</CanvasLink>'}</Code>. It renders a link to
        the viewer. Only a tag named CanvasLink with a string-literal <Code>to</Code> counts as a
        link for agents; a variable or template string does not.
      </Text>
      <H2>Following links</H2>
      <Stack gap={4}>
        <Text>
          <Code>list_links</Code>: outgoing links as <Code>to</Code>, <Code>line</Code>,{" "}
          <Code>label</Code> and <Code>exists</Code>. A link to a canvas that does not exist stays
          in the list with exists false.
        </Text>
        <Text>
          <Code>backlinks</Code>: which canvases link here, as <Code>from</Code>,{" "}
          <Code>line</Code> and <Code>label</Code>.
        </Text>
        <Text>
          <Code>search_linked</Code>: substring search in the canvases this one links to
          directly, one hop, as <Code>id</Code>, <Code>line</Code> and <Code>snippet</Code>. To
          search the canvas itself use <Code>search_source</Code>.
        </Text>
      </Stack>
      <H2>Related</H2>
      <Stack gap={4}>
        <Text>
          <CanvasLink to="reference/mcp-tools">MCP tools</CanvasLink> and{" "}
          <CanvasLink to="reference/http-api">HTTP API</CanvasLink>
        </Text>
        <Text>
          <CanvasLink to="team-canvas/index">Knowledge base index</CanvasLink>: the entry point.
        </Text>
      </Stack>
    </Stack>
  );
}
