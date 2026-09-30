/** Fixture exercising chart primitives via `"team-canvas/canvas"` only. */
import {
  BarChart,
  H1,
  LineChart,
  PieChart,
  Stack,
  Text,
} from "team-canvas/canvas";

export default function ChartsSmoke() {
  return (
    <Stack gap={16} style={{ padding: 16 }}>
      <H1>charts-smoke</H1>
      <Text>Acceptance fixture: BarChart, LineChart, PieChart.</Text>
      <BarChart
        categories={["Mon", "Tue", "Wed"]}
        series={[
          { name: "Requests", data: [12, 19, 15] },
          { name: "Errors", data: [1, 2, 0], tone: "danger" },
        ]}
      />
      <LineChart
        categories={["Jan", "Feb", "Mar"]}
        series={[{ name: "Revenue", data: [10, 14, 12] }]}
        fill
      />
      <PieChart
        data={[
          { label: "IDE", value: 40 },
          { label: "CLI", value: 25, tone: "info" },
          { label: "Cloud", value: 35 },
        ]}
        donut
      />
    </Stack>
  );
}
