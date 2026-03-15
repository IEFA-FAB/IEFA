import type { Config } from "tailwindcss";

export default {
	content: [
		"./index.html",
		"./app/**/*.{ts,tsx,js,jsx}",
	],
	theme: {
		extend: {
			fontFamily: {
				sans: ["Manrope", "ui-sans-serif", "system-ui"],
				mono: ["JetBrains Mono", "ui-monospace", "monospace"],
			},
		},
	},
	// opcional: presets/plugins compartilhados
	// presets: [require('../../tailwind.preset.cjs')],
} satisfies Config;

