import { type ClassValue, clsx } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

/**
 * As classes tipográficas do `styles.css` não são do Tailwind, e o tailwind-merge lê
 * `text-label` como cor de texto: `cn("text-label text-muted-foreground")` descartava uma das
 * duas. Em grupo próprio só conflitam entre si. Classe nova no CSS entra aqui (o teste confere).
 */
const twMerge = extendTailwindMerge<"text-style">({
	extend: {
		classGroups: {
			"text-style": [{ text: ["body", "caption", "display", "heading", "hint", "label", "subheading"] }],
		},
	},
})

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs))
}
