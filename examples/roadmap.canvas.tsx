import {
  Callout,
  Card,
  CardBody,
  CardHeader,
  Grid,
  H1,
  Pill,
  Row,
  Stack,
  Text,
} from "team-canvas/canvas";

export default function Roadmap() {
  return (
    <Stack gap={16}>
      <Stack gap={4}>
        <H1>team-canvas roadmap</H1>
        <Text>What is planned. Use Add in the editor to append another item.</Text>
      </Stack>
      <Callout tone="info">
        Nothing here is committed to a date. The order is a rough priority.
      </Callout>
      <Grid columns="repeat(auto-fill, minmax(18rem, 1fr))" gap={12} align="stretch">
        <Card>
          <CardHeader>
            <Row gap={8}>
              <Text weight="semibold">Login plugins</Text>
              <Pill tone="info" size="sm">Auth</Pill>
            </Row>
          </CardHeader>
          <CardBody>
            <Text>Password and OIDC login through the Auth port.</Text>
          </CardBody>
        </Card>
        <Card>
          <CardHeader>
            <Row gap={8}>
              <Text weight="semibold">More stores</Text>
              <Pill tone="info" size="sm">CanvasStore</Pill>
            </Row>
          </CardHeader>
          <CardBody>
            <Text>FTP and Samba: load a canvas from a server, edit it and upload it back.</Text>
          </CardBody>
        </Card>
        <Card>
          <CardHeader>
            <Row gap={8}>
              <Text weight="semibold">Realtime collaboration</Text>
              <Pill tone="info" size="sm">Editing</Pill>
            </Row>
          </CardHeader>
          <CardBody>
            <Text>Several people on the same canvas at once.</Text>
          </CardBody>
        </Card>
        <Card>
          <CardHeader>
            <Row gap={8}>
              <Text weight="semibold">Agent collaboration</Text>
              <Pill tone="info" size="sm">MCP</Pill>
            </Row>
          </CardHeader>
          <CardBody>
            <Text>
              An agent leases a write lock before it writes and releases it when done, so other
              agents can read a consistent canvas. Acquire, release and inspect over HTTP and
              MCP, with a timeout so a crashed agent cannot hold a canvas forever.
            </Text>
          </CardBody>
        </Card>
        <Card>
          <CardHeader>
            <Row gap={8}>
              <Text weight="semibold">Agent settlement</Text>
              <Pill tone="info" size="sm">MCP</Pill>
            </Row>
          </CardHeader>
          <CardBody>
            <Text>
              Agents on one shared store find out early when they disagree. Every write records
              who, why and a before/after for rollback. Agents declare intent per topic and get a
              conflict notice right away. Unresolved topics escalate to a decision card where a
              human picks the winner. Notices ride along on MCP responses.
            </Text>
          </CardBody>
        </Card>
        <Card>
          <CardHeader>
            <Row gap={8}>
              <Text weight="semibold">Sessions</Text>
              <Pill tone="info" size="sm">Sharing</Pill>
            </Row>
          </CardHeader>
          <CardBody>
            <Text>Upload a canvas and invite collaborators, with MCP support for those sessions.</Text>
          </CardBody>
        </Card>
        <Card>
          <CardHeader>
            <Row gap={8}>
              <Text weight="semibold">useCanvasAction connector</Text>
              <Pill tone="info" size="sm">SDK</Pill>
            </Row>
          </CardHeader>
          <CardBody>
            <Text>Open agent, open file, new chat. Today it is a logged no-op.</Text>
          </CardBody>
        </Card>
      </Grid>
    </Stack>
  );
}
