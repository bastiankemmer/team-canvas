import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// team-canvas/canvas resolves via package exports; no alias needed.
export default defineConfig({
  plugins: [react()],
  resolve: {
    dedupe: ["react", "react-dom"],
  },
});
