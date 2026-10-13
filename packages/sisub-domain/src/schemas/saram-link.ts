import { z } from "zod"
import { UuidSchema } from "./common.ts"

/**
 * Vínculo de SARAM verificado (change `saram-verified-link`, migration 20261003100000).
 *
 * Nenhum schema aqui tem `userId` nem `email`: a conta e o e-mail vêm SEMPRE da sessão. O que o
 * comensal manda é input legítimo dele (o SARAM que diz ser o seu, o CPF que o confere) e é
 * conferido no banco contra o cadastro; o que o administrador manda nomeia o ALVO da decisão
 * (`userId` nas fns de admin), autorizado por `admin:2`.
 */

/** SARAM: 6 ou 7 dígitos (o mesmo CHECK do banco). */
export const SaramSchema = z
	.string()
	.trim()
	.regex(/^\d{6,7}$/, "O SARAM tem 6 ou 7 dígitos.")

/** Tipo de conta: valor de domínio, não se traduz. */
export const ACCOUNT_KINDS = ["pessoal", "institucional"] as const
export const AccountKindSchema = z.enum(ACCOUNT_KINDS)
export type AccountKind = z.infer<typeof AccountKindSchema>

/** Justificativa e motivo: o banco exige 10 caracteres (lidos em auditoria). */
export const SARAM_JUSTIFICATION_MIN_LENGTH = 10
export const SARAM_JUSTIFICATION_MAX_LENGTH = 1000

const ReasonSchema = z
	.string()
	.trim()
	.min(SARAM_JUSTIFICATION_MIN_LENGTH, `Informe o motivo (mínimo de ${SARAM_JUSTIFICATION_MIN_LENGTH} caracteres).`)
	.max(SARAM_JUSTIFICATION_MAX_LENGTH, `O motivo deve ter no máximo ${SARAM_JUSTIFICATION_MAX_LENGTH} caracteres.`)

// ── Comensal ────────────────────────────────────────────────────────────────

/** Confirma o candidato sugerido pela chave do e-mail. `cpfSuffix` só no desempate de homônimos. */
export const ConfirmSaramCandidateSchema = z.object({
	candidateRef: z.number().int().positive(),
	cpfSuffix: z
		.string()
		.trim()
		.regex(/^\d{4}$/, "Informe os 4 últimos dígitos do CPF.")
		.optional(),
})
export type ConfirmSaramCandidate = z.infer<typeof ConfirmSaramCandidateSchema>

/** SARAM + CPF completo. O CPF aceita máscara; o banco compara só os dígitos e não o guarda. */
export const VerifySaramByCpfSchema = z.object({
	saram: SaramSchema,
	cpf: z
		.string()
		.trim()
		.refine((v) => v.replace(/\D/g, "").length === 11, "O CPF tem 11 dígitos."),
})
export type VerifySaramByCpf = z.infer<typeof VerifySaramByCpfSchema>

export const RequestSaramLinkSchema = z.object({
	saram: SaramSchema,
	justification: ReasonSchema,
})
export type RequestSaramLink = z.infer<typeof RequestSaramLinkSchema>

export const WithdrawSaramRequestSchema = z.object({ requestId: UuidSchema })
export type WithdrawSaramRequest = z.infer<typeof WithdrawSaramRequestSchema>

export const SetOwnAccountKindSchema = z.object({ kind: AccountKindSchema })
export type SetOwnAccountKind = z.infer<typeof SetOwnAccountKindSchema>

// ── Administrador (admin:2) ─────────────────────────────────────────────────

export const DecideSaramRequestSchema = z
	.object({
		requestId: UuidSchema,
		decision: z.enum(["approve", "reject"]),
		note: z.string().trim().max(SARAM_JUSTIFICATION_MAX_LENGTH).optional(),
	})
	.refine((v) => v.decision === "approve" || (v.note?.length ?? 0) >= SARAM_JUSTIFICATION_MIN_LENGTH, {
		message: `Informe o motivo da recusa (mínimo de ${SARAM_JUSTIFICATION_MIN_LENGTH} caracteres).`,
		path: ["note"],
	})
export type DecideSaramRequest = z.infer<typeof DecideSaramRequestSchema>

/**
 * Vínculo manual (também confirma um legacy: mesmo SARAM). `expectedSaram` é o SARAM que a tela
 * viu na conta (`null` = sem vínculo): o banco confere na mesma transação (EDIT-SAFETY).
 */
export const LinkUserSaramSchema = z.object({
	userId: UuidSchema,
	saram: SaramSchema,
	expectedSaram: z.string().trim().nullable(),
	reason: ReasonSchema,
})
export type LinkUserSaram = z.infer<typeof LinkUserSaramSchema>

export const UnlinkUserSaramSchema = z.object({
	userId: UuidSchema,
	expectedSaram: z.string().trim().min(1),
	reason: ReasonSchema,
})
export type UnlinkUserSaram = z.infer<typeof UnlinkUserSaramSchema>

export const SetUserAccountKindSchema = z.object({
	userId: UuidSchema,
	kind: AccountKindSchema,
	expectedKind: AccountKindSchema,
	reason: ReasonSchema,
})
export type SetUserAccountKind = z.infer<typeof SetUserAccountKindSchema>

/**
 * Busca de conta no console (admin:2): parte do e-mail, nome de guerra ou o SARAM inteiro. Lê só o
 * que a fila já mostra (e-mail, SARAM, como foi verificado, posto/nome de guerra/OM).
 */
export const SearchSaramAccountsSchema = z.object({
	query: z.string().trim().min(3, "Digite ao menos 3 caracteres.").max(120, "Busca longa demais."),
})
export type SearchSaramAccounts = z.infer<typeof SearchSaramAccountsSchema>
