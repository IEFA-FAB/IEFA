import { type ClassValue, clsx } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

/**
 * Classes próprias do CSS do app com prefixo do Tailwind. Sem registro, o tailwind-merge lê
 * `text-label` como cor de texto: `cn("text-label text-muted-foreground")` descartava uma das
 * duas. As tipográficas são `@utility` e declaram tamanho, peso, entrelinha e tracking, então
 * tiram o `text-sm`/`font-medium` que vem antes (o do primitivo, por exemplo); sem isso o
 * utilitário de uma propriedade só sai depois no CSS e vence. Classe nova no CSS entra aqui; o
 * teste ao lado confere contra as declarações.
 */
const twMerge = extendTailwindMerge<"text-style">({
	extend: {
		classGroups: {
			"text-style": [{ text: ["body", "caption", "display", "heading", "hint", "label", "subheading"] }],
		},
		conflictingClassGroups: { "text-style": ["font-size", "font-weight", "leading", "tracking"] },
	},
})

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs))
}
