import { defineConfig } from "vitest/config";
import { withCrapTypescriptVitest } from "@barney-media/crap-typescript-vitest";

export default defineConfig(
  withCrapTypescriptVitest(
    {
      test: {
        environment: "node",
        include: ["src/**/*.test.{ts,tsx}", "src/**/*.spec.{ts,tsx}"],
        pool: "forks",
        maxWorkers: 1,
        coverage: {
          exclude: [
            "node_modules/**",
            "dist/**",
            ".stryker-tmp/**",
            "coverage/**",
            "src/**/*.test.{ts,tsx}",
            "src/**/*.spec.{ts,tsx}",
            "examples/**",
          ],
        },
      },
    },
    {
      threshold: 10,
      format: "text",
      agent: true,
    },
  ),
);
