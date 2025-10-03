import type { Config } from "tailwindcss";

export default {
  content: [
    "./index.html",
    "./app/**/*.{ts,tsx,js,jsx}",
    // se consumir o código-fonte do monorepo:
    "../../packages/ui/src/**/*.{ts,tsx,js,jsx}",
    "../../packages/auth/src/**/*.{ts,tsx,js,jsx}",
    // se estiver consumindo o build do pacote via node_modules:
    "../../node_modules/@iefa/ui/dist/**/*.{js,jsx,ts,tsx}",
    "../../node_modules/@iefa/auth/dist/**/*.{js,jsx,ts,tsx}",
  ],
  // opcional: presets/plugins compartilhados
  // presets: [require('../../tailwind.preset.cjs')],
} satisfies Config;
