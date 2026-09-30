/** Names for new canvases: one path segment of letters, digits, "-" and "_". */
const NEW_ID = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

export function assertNewCanvasId(id: string): void {
  if (!NEW_ID.test(id)) {
    throw new Error(
      `Invalid canvas id "${id}": use letters, digits, "-" and "_", starting with a letter or digit`,
    );
  }
}

/** "my-canvas" -> "MyCanvas"; a leading digit gets a "Canvas" prefix. */
function componentName(id: string): string {
  const pascal = id
    .split(/[-_]+/)
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase() + w.slice(1))
    .join("");
  return /^[0-9]/.test(pascal) ? `Canvas${pascal}` : pascal;
}

/** Starter file for a new canvas: compiles as is, ready to edit. */
export function starterSource(id: string): string {
  return `import { H1, Stack, Text } from "team-canvas/canvas";

export default function ${componentName(id)}() {
  return (
    <Stack gap={12} style={{ padding: 16 }}>
      <H1>${id}</H1>
      <Text>Edit this canvas in the browser or from code.</Text>
    </Stack>
  );
}
`;
}
