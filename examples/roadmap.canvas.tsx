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
        <Text>What is planned.</Text>
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
              <Text weight="semibold">Agent settlement follow-ups</Text>
              <Pill tone="info" size="sm">MCP</Pill>
            </Row>
          </CardHeader>
          <CardBody>
            <Text>
              Intents, the change log, negotiation and the decision page are in. Next: a blocking
              await_messages tool or agent hooks for faster delivery, warning on writes that
              contradict a settled decision, and reopening a settled topic.
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
