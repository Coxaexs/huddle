import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import vinext from "vinext";

// One id per build, stamped into the server and the page alike (read through
// lib/build-id.ts), so an open page can tell that a newer deploy is live. Kept
// in the environment in case the build loads this file more than once.
process.env.HOFFLE_BUILD_ID ||= `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export default defineConfig({
  define: {
    __HOFFLE_BUILD__: JSON.stringify(process.env.HOFFLE_BUILD_ID),
  },
  plugins: [
    vinext(),
    tailwindcss(),
    cloudflare({
      viteEnvironment: {
        name: "rsc",
        childEnvironments: ["ssr"],
      },
    }),
  ],
});
