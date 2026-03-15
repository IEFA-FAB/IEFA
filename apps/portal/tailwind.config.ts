import type { Config } from "tailwindcss";

export default {
    content: [
        "./index.html",
        "./app/**/*.{ts,tsx,js,jsx}",
        "./src/**/*.{ts,tsx,js,jsx}",
    ],
	theme: {
		extend: {
			fontFamily: {
				sans: ["IBM Plex Sans", "ui-sans-serif", "system-ui"],
				serif: ["Lora", "Georgia", "serif"],
			},
		},
	},
    // opcional: presets/plugins compartilhados
    // presets: [require('../../tailwind.preset.cjs')],
} satisfies Config;
