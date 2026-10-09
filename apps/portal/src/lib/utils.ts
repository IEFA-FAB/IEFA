import { type ClassValue, clsx } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

/**
 * Classes próprias do CSS do app com prefixo do Tailwind. Sem registro, o tailwind-merge lê
 * `text-label` como cor de texto: `cn("text-label text-muted-foreground")` descartava uma das
 * duas. Aqui elas são CSS solto em `@layer utilities` e vêm depois de todo utilitário gerado:
 * já vencem no CSS o que declaram, e não declaram tudo (`text-label` não tem entrelinha). Por
 * isso não conflitam com `text-sm`/`leading-*`, só deixam de sumir. Classe nova no CSS entra
 * aqui; o teste ao lado confere contra as declarações.
 */
const twMerge = extendTailwindMerge<"text-style">({
	extend: {
		classGroups: {
			"text-style": [{ text: ["display", "headline", "hero", "label"] }],
			// `shadow-hard-*` e `border-hard` definem o `box-shadow` e a borda inteiros.
			shadow: [{ shadow: ["hard-sm", "hard-md", "hard-lg"] }],
			"border-w": [{ border: ["hard"] }],
		},
	},
})

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs))
}
