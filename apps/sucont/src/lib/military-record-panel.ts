/**
 * Derivações puras do diálogo "Meu cadastro militar" que são só do sucont: o passo do diálogo e a
 * cor do selo. O que vale também para o sisub está em `describeSaramPanel`
 * (`@iefa/database/saram-link`).
 */
import type { SaramOutcomeView, SaramTone } from "@iefa/database/saram-link"
import { SARAM_LINK_FALLBACK_MESSAGE } from "#/lib/saram-link"

export type MilitaryRecordStep = null | "alternatives" | "cpf" | "request" | "institutional" | "personal" | "withdraw"

export const TONE_BADGE: Record<SaramTone, "success" | "destructive" | "warning" | "outline"> = {
	ok: "success",
	blocked: "destructive",
	attention: "warning",
	info: "outline",
}

/** Escolher uma alternativa (CPF, pedido, seção) continua dentro do bloco de alternativas. */
export function isAlternativesStep(step: MilitaryRecordStep): boolean {
	return step === "alternatives" || step === "cpf" || step === "request" || step === "institutional"
}

export function getErrorText(error: unknown): string {
	return error instanceof Error && error.message ? error.message : SARAM_LINK_FALLBACK_MESSAGE
}

export function getFeedbackVariant(kind: SaramOutcomeView["kind"]): "destructive" | "success" | "info" {
	if (kind === "error") return "destructive"
	return kind === "success" ? "success" : "info"
}
