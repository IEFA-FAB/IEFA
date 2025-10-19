// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

// https://astro.build/config
export default defineConfig({
  integrations: [
    starlight({
      title: "IEFA docs",
      logo: {
        src: "./src/assets/favicon.svg",
      },
      social: [
        {
          icon: "github",
          label: "GitHub",
          href: "https://github.com/IEFA-FAB/IEFA",
        },
      ],
      sidebar: [
        {
          label: "Iefa",
          autogenerate: { directory: "iefa" },
        },
        {
          label: "Sifare",
          autogenerate: { directory: "sifare" },
        },
        {
          label: "Sisub",
          autogenerate: { directory: "sisub" },
        },
        {
          label: "Previsão Sisub",
          autogenerate: { directory: "prev_sisub" },
        },
      ],
    }),
  ],
});
