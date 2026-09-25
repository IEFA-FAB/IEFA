import { type ClassValue, clsx } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

// `text-3xs`/`text-2xs` são tamanhos do tema (styles.css). Sem declará-los, o tailwind-merge os lê
// como cor de texto e descarta o tamanho diante de um `text-muted-foreground` depois dele.
const twMerge = extendTailwindMerge({ extend: { theme: { text: ["3xs", "2xs"] } } })

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs))
}
