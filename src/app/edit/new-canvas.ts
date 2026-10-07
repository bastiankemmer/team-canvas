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

const INVALID_ID =
  'use letters, digits, "-" and "_", starting with a letter or digit';

/** Folder path: each segment is a legal canvas-id segment. Route words are allowed here. */
export function assertCanvasPath(id: string): void {
  if (id.split("/").some((segment) => !SEGMENT.test(segment))) {
    throw new Error(`Invalid canvas id "${id}": ${INVALID_ID}`);
  }
}

export function assertNewCanvasId(id: string): void {
  assertCanvasPath(id);
  const last = id.slice(id.lastIndexOf("/") + 1);
  if (id.includes("/") && RESERVED_LAST.has(last)) {
    throw new Error(`Invalid canvas id "${id}": ${INVALID_ID}`);
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
