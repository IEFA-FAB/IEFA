import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs))
}

/**
 * Normaliza strings de nomes vindas do banco (ex: "JOÃO SILVA" → "João Silva").
 * Usa (?:^|\s)\S para cobrir o charset português com caracteres acentuados.
 * Não deve ser aplicada a siglas/abreviaturas (ex: sgPosto "CAP", "TEN").
 */
export function toNameCase(str: string): string {
	return str.toLowerCase().replace(/(?:^|\s)\S/g, (c) => c.toUpperCase())
}
