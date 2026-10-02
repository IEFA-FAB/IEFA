/**
 * @module response-limits
 * Tetos da escrita de resposta — validados na borda das server functions.
 *
 * Antes, `saveAnswerFn` aceitava `value: z.any()` e `observation` sem limite, e a sessão aceitava
 * `om`/`secao` de qualquer tamanho: qualquer usuário logado gravava megabytes por chamada em
 * `forms.response` (e de novo em `response_version`, a cada envio). Os tetos abaixo ficam muito
 * acima do uso real (em 2026-10-01: maior `value` com 11 bytes, observação vazia, OM com 6
 * caracteres, no máximo 1 versão por resposta).
 *
 * Puro de propósito (sem env, sem banco): é o que deixa `response-limits.test.ts` provar os tetos.
 */

import type { Json } from "@iefa/database"
import { z } from "zod"

/** Resposta de texto livre (`text`/`textarea`), em caracteres. */
export const MAX_ANSWER_TEXT_CHARS = 5_000
/** Valor inteiro da resposta serializado em JSON (escolha múltipla, número, texto…). */
export const MAX_ANSWER_JSON_CHARS = 10_000
/** Observação opcional da pergunta. */
export const MAX_OBSERVATION_CHARS = 2_000
/** Sigla/nome da OM (as de `om_option` têm até 10). */
export const MAX_OM_CHARS = 120
/** Seção do respondente. */
export const MAX_SECAO_CHARS = 120
/**
 * Versões por resposta. Cada reabrir + reenviar grava uma cópia inteira das respostas em
 * `response_version`; sem teto, um laço de reenvio crescia a tabela sem limite.
 */
export const MAX_RESPONSE_VERSIONS = 20

export const VERSION_CAP_MESSAGE = `Esta resposta já tem ${MAX_RESPONSE_VERSIONS} versões, o máximo permitido. Para corrigir, fale com quem administra o questionário.`

/** JSON puro: primitivo, lista ou objeto simples, até 8 níveis (a tela grava no máximo 2). */
export function isJsonValue(value: unknown, depth = 0): boolean {
	if (depth > 8) return false
	if (value === null || typeof value === "string" || typeof value === "boolean") return true
	if (typeof value === "number") return Number.isFinite(value)
	if (Array.isArray(value)) return value.every((item) => isJsonValue(item, depth + 1))
	if (typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
		return Object.values(value).every((item) => isJsonValue(item, depth + 1))
	}
	return false
}

/** Tamanho do valor serializado; `Infinity` para o que não serializa (ciclo, BigInt). */
export function serializedLength(value: unknown): number {
	try {
		return JSON.stringify(value ?? null).length
	} catch {
		return Number.POSITIVE_INFINITY
	}
}

/**
 * Valor de resposta: JSON válido, texto até o teto e o todo até o teto em JSON. Ausente vira
 * `null` (a pergunta limpa), como o autosave já manda.
 */
export const answerValueSchema = z
	.unknown()
	.refine((value) => value === undefined || isJsonValue(value), { message: "Resposta em formato inválido" })
	.refine((value) => typeof value !== "string" || value.length <= MAX_ANSWER_TEXT_CHARS, {
		message: `Resposta com mais de ${MAX_ANSWER_TEXT_CHARS} caracteres`,
	})
	.refine((value) => serializedLength(value) <= MAX_ANSWER_JSON_CHARS, { message: "Resposta grande demais" })
	// O `isJsonValue` acima garante a forma; o cast só a conta ao tipo da coluna.
	.transform((value) => (value ?? null) as Json)

export const observationSchema = z.string().max(MAX_OBSERVATION_CHARS, `Observação com mais de ${MAX_OBSERVATION_CHARS} caracteres`).nullable().optional()

export const omInputSchema = z.string().trim().min(1, "Informe a OM").max(MAX_OM_CHARS)

export const secaoInputSchema = z.string().trim().min(1, "Informe a seção").max(MAX_SECAO_CHARS, `Seção com mais de ${MAX_SECAO_CHARS} caracteres`)

/** Já chegou ao teto? `current` é o `current_version` da resposta (null antes do 1º envio). */
export function isVersionCapReached(current: number | null | undefined): boolean {
	return (current ?? 0) >= MAX_RESPONSE_VERSIONS
}
