import { DEFAULT_LEGAL_LOCALE, type LegalLocale } from "./types.ts"

/**
 * Formata a data de vigência de um documento legal.
 *
 * `effective_date` é uma coluna `DATE` — chega como `"2026-08-16"`, uma data de
 * calendário sem hora e sem fuso. `new Date("2026-08-16")` a interpreta como
 * meia-noite **UTC**, e o `Intl` renderiza no fuso local: em `America/Sao_Paulo`
 * (UTC-3) isso vira **15 de agosto**. A data de vigência publicada ficaria um dia
 * antes da real para todo usuário brasileiro — e, como o container roda em UTC e o
 * navegador não, o SSR emitiria "16 de agosto" e a hidratação trocaria por "15".
 *
 * `timeZone: "UTC"` cancela os dois problemas: a data de calendário é renderizada
 * como escrita, igual no servidor e no cliente.
 */
export function formatEffectiveDate(effectiveDate: string, locale: LegalLocale = DEFAULT_LEGAL_LOCALE): string {
	return new Intl.DateTimeFormat(locale, { dateStyle: "long", timeZone: "UTC" }).format(new Date(effectiveDate))
}
