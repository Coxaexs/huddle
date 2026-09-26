import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    environment: "node",
    // `.test.tsx` matters: without it a component test is written, silently not
    // collected, and the suite still reports green.
    include: ["**/*.test.ts", "**/*.test.tsx"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./"),
      // Only workerd provides this module, so tests that pull in worker code
      // get a stub instead of failing to resolve it.
      "cloudflare:workers": path.resolve(
        __dirname,
        "./test/stubs/cloudflare-workers.ts",
      ),
    },
  },
});
