/** One path segment: letters, digits, "-" and "_", starting with a letter or digit. */
const SEGMENT = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

/** Route words. Illegal only as the last segment of an id that contains "/". */
const RESERVED_LAST = new Set([
  "edit",
  "source",
  "state",
  "watch",
  "check",
  "replace",
  "search",
  "search-linked",
  "orientation",
  "add-oriented",
  "fill-slots",
  "links",
  "backlinks",
]);

export function assertNewCanvasId(id: string): void {
  const segments = id.split("/");
  const last = segments[segments.length - 1] ?? "";
  if (
    segments.some((segment) => !SEGMENT.test(segment)) ||
    (id.includes("/") && RESERVED_LAST.has(last))
  ) {
    throw new Error(
      `Invalid canvas id "${id}": use letters, digits, "-" and "_", starting with a letter or digit`,
    );
  }
}

/** "my-canvas" -> "MyCanvas"; "notes/demo" -> "NotesDemo"; a leading digit gets a "Canvas" prefix. */
function componentName(id: string): string {
  const pascal = id
    .split(/[-_/]+/)
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
      <Text>Agents edit this canvas over MCP.</Text>
    </Stack>
  );
}
`;
}
