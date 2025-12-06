import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";

import sanity from "@sanity/astro";

// https://astro.build/config
export default defineConfig({
  vite: {
    plugins: [tailwindcss()],
  },
  integrations: [
    sanity({
      projectId: "ct3sbcgw",
      dataset: "production",
      useCdn: false,
    }),
  ],
});