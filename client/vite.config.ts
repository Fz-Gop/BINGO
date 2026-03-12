import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Dev setup:
// - Vite runs on :5173 (accessible from the other laptop on Wi‑Fi).
// - Socket.IO server runs on :3000.
// - Proxy keeps the browser origin single (no CORS headaches).
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    strictPort: true
  }
});
