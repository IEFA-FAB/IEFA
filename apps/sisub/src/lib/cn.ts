import { type ClassValue, clsx } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

/**
 * Classes próprias do CSS do app com prefixo do Tailwind. Sem registro, o tailwind-merge lê
 * `text-label` como cor de texto: `cn("text-label text-muted-foreground")` descartava uma das
 * duas. As tipográficas (`text-label`, `text-caption`…) definem tamanho, peso, entrelinha e
 * tracking, então tiram o `text-sm`/`font-medium` que vem antes (o do primitivo, por exemplo).
 * Classe nova no CSS entra aqui; o teste ao lado confere.
 */
const twMerge = extendTailwindMerge<"text-style">({
	extend: {
		classGroups: {
			"text-style": [
				{ text: ["body", "caption", "display", "eyebrow", "heading", "hero", "hint", "label", "lead", "section-title", "step-number", "subheading"] },
			],
			"bg-image": [{ bg: ["dot-pattern"] }],
		},
		conflictingClassGroups: { "text-style": ["font-size", "font-weight", "leading", "tracking"] },
	},
})

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs))
}
