/** Fixture exercising forms + diff via `"team-canvas/canvas"` only. */
import {
  Checkbox,
  DiffStats,
  DiffView,
  H1,
  Row,
  Select,
  Stack,
  Text,
  TextArea,
  TextInput,
  Toggle,
  useState,
} from "team-canvas/canvas";

export default function FormsDiffSmoke() {
  const [name, setName] = useState("fixture");
  const [notes, setNotes] = useState("");
  const [on, setOn] = useState(true);
  const [role, setRole] = useState("viewer");
  const [agree, setAgree] = useState(false);

  return (
    <Stack gap={16} style={{ padding: 16 }}>
      <H1>forms-diff-smoke</H1>
      <Text>Acceptance fixture: forms + DiffView / DiffStats.</Text>
      <TextInput value={name} onChange={setName} placeholder="Name" />
      <TextArea value={notes} onChange={setNotes} placeholder="Notes" rows={2} />
      <Row gap={8} align="center">
        <Toggle checked={on} onChange={setOn} />
        <Text>Enabled</Text>
      </Row>
      <Checkbox checked={agree} onChange={setAgree} label="Agree" />
      <Select
        value={role}
        onChange={setRole}
        options={[
          { value: "viewer", label: "Viewer" },
          { value: "editor", label: "Editor" },
        ]}
      />
      <DiffStats additions={3} deletions={1} />
      <DiffView
        path="example.ts"
        lines={[
          { type: "unchanged", content: "export const ok = true", lineNumber: 1 },
          { type: "removed", content: "export const old = 1", lineNumber: 2 },
          { type: "added", content: "export const next = 2", lineNumber: 2 },
        ]}
      />
    </Stack>
  );
}
