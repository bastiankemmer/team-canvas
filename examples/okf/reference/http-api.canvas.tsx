import { CanvasLink, Code, H1, H2, Stack, Text } from "team-canvas/canvas";

export default function HttpApi() {
  return (
    <Stack gap={16}>
      <Stack gap={4}>
        <H1>HTTP API</H1>
        <Text tone="secondary">
          Served by <Code>team-canvas serve</Code>, by default on 0.0.0.0:3847.
        </Text>
      </Stack>
      <H2>Routes</H2>
      <Stack gap={4}>
        <Text><Code>POST /api/canvas/new</Code>: create from an id and an optional source.</Text>
        <Text><Code>POST /api/canvas</Code>: upload, header X-Canvas-Name.</Text>
        <Text><Code>GET, PUT /api/canvas/:id/source</Code>: read or replace the whole source.</Text>
        <Text><Code>POST /api/canvas/:id/replace</Code>: replace exact text in place.</Text>
        <Text><Code>GET /api/canvas/:id/check</Code>: does the canvas still build?</Text>
        <Text><Code>GET /api/canvas/:id/search?q=</Code>: search one canvas.</Text>
        <Text>
          <Code>GET /api/canvas/:id/links</Code>, <Code>/backlinks</Code>,{" "}
          <Code>/search-linked?q=</Code>: follow links between canvases.
        </Text>
        <Text>
          <Code>POST /api/canvas/:id/add-oriented</Code>, <Code>/fill-slots</Code>: Oriented Add.
        </Text>
        <Text>
          <Code>GET /api/settlement/leases</Code>, <Code>POST /api/settlement/leases/acquire</Code>,{" "}
          <Code>/release</Code>: a write needs an actor that holds the canvas lease, otherwise it is
          refused (400 without an actor, 409 without the lease).
        </Text>
        <Text>
          <Code>POST /api/settlement/intent</Code>, <Code>/notices</Code>,{" "}
          <Code>/topics/:topic/escalate</Code>: agents declare intent, take their notices and
          escalate a conflict. Writes can carry <Code>X-Canvas-Actor</Code>,{" "}
          <Code>X-Canvas-Reason</Code> and <Code>X-Canvas-Topic</Code>.
        </Text>
        <Text>
          <Code>GET /api/settlement/topics</Code>, <Code>/changes</Code>: topics with every
          agent's plan, and the change log.
        </Text>
        <Text>
          <Code>POST /api/settlement/topics/:topic/settle</Code>, <Code>/revert</Code>: a human
          settles a topic and rolls back writes. <Code>GET /settlement</Code> is the decision page.
        </Text>
      </Stack>
      <H2>Related</H2>
      <Stack gap={4}>
        <Text>
          <CanvasLink to="reference/mcp-tools">MCP tools</CanvasLink>: the same operations for agents.
        </Text>
        <Text>
          <CanvasLink to="reference/knowledge-links">Knowledge links</CanvasLink>: what the link routes
          return.
        </Text>
        <Text>
          <CanvasLink to="reference/architecture">Architecture</CanvasLink>
        </Text>
      </Stack>
    </Stack>
  );
}
