import { CanvasLink, Code, H1, H2, Stack, Text } from "team-canvas/canvas";

export default function CanvasFormat() {
  return (
    <Stack gap={16}>
      <Stack gap={4}>
        <H1>Canvas format</H1>
        <Text tone="secondary">
          A canvas is one React component in one file named <Code>id.canvas.tsx</Code>.
        </Text>
      </Stack>
      <H2>Rules</H2>
      <Stack gap={4}>
        <Text>The file default-exports the component. Without a default export it does not build.</Text>
        <Text>
          It may import only <Code>team-canvas/canvas</Code>, <Code>react</Code>,{" "}
          <Code>react-dom</Code> and the JSX runtime. Any other package is rejected with an error
          that names the import.
        </Text>
        <Text>
          Values from <Code>useCanvasState</Code> are saved next to the file as{" "}
          <Code>id.canvas.data.json</Code>, so everyone who opens the canvas sees the same state.
        </Text>
        <Text>
          A canvas written for another canvas module is converted with{" "}
          <Code>team-canvas convert --from old-module path</Code>.
        </Text>
      </Stack>
      <H2>Related</H2>
      <Stack gap={4}>
        <Text>
          <CanvasLink to="index">Knowledge base index</CanvasLink>
        </Text>
        <Text>
          <CanvasLink to="guides/editing-workflow">Editing workflow</CanvasLink>: check_canvas reports
          the build errors these rules cause.
        </Text>
      </Stack>
    </Stack>
  );
}
