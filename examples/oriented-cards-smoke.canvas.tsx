/** Fixture: literal repeating Cards + shared Button (not data-array .map). */
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Stack,
  Text,
} from "team-canvas/canvas";

function onAct() {}

export default function OrientedCardsSmoke() {
  return (
    <Stack gap={8} style={{ padding: 16 }}>
      <Text>oriented-cards-smoke</Text>
      <Card>
        <CardHeader>Alpha</CardHeader>
        <CardBody>
          <Text>Body alpha</Text>
          <Button onClick={onAct}>Go alpha</Button>
        </CardBody>
      </Card>
      <Card>
        <CardHeader>Beta</CardHeader>
        <CardBody>
          <Text>Body beta</Text>
          <Button onClick={onAct}>Go beta</Button>
        </CardBody>
      </Card>
    </Stack>
  );
}
