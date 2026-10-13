/**
 * @module user.fn
 * Registro de identidade do usuário do sucont em `core.user_data`.
 *
 * `core.user_data` é o cadastro de pessoas do ERP — é ali que a busca por e-mail
 * da gestão de acessos (`searchUsersByEmail`, @iefa/pbac) procura alguém para
 * conceder acesso, em TODOS os apps. Só que a linha nasce no login: o sisub a
 * grava desde sempre, e o sucont nunca gravou. O resultado é que quem só usa o
 * sucont não existe para a busca — dos quatro usuários com grant `sucont`, três
 * não tinham linha, e eram exatamente os que precisariam ser encontrados.
 *
 * Portanto: ao entrar no sucont, o usuário passa a se registrar, como já fazia ao
 * entrar no sisub.
 */

import { parseSaramOutcome, parseSaramStatus, type SaramLinkOutcome, type SaramStatus } from "@iefa/database/saram-link"
import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { requireSucontApp, requireUser } from "#/lib/auth.server"
import { saramLinkErrorMessage } from "#/lib/saram-link"
import { getCoreClient } from "#/lib/supabase.server"

/**
 * Registra (ou atualiza) o `id` + `email` do PRÓPRIO usuário. Best-effort: roda uma
 * vez por sessão de browser e nunca bloqueia a navegação.
 *
 * Identidade vem do JWT, nunca do payload — a fn não recebe argumento nenhum.
 * `core.user_data.email` é UNIQUE e é a chave de busca do console de permissões:
 * aceitar um e-mail do cliente permitiria reivindicar a identidade de outra conta.
 *
 * Conflito de `id` atualiza o e-mail. Conflito de EMAIL (23505 — outra linha, de
 * outro `id`, já detém este endereço) é desistência silenciosa: o sisub resolve o
 * caso apagando a linha rival (`upsertUserDataReclaimingEmail`), e isso é uma
 * operação destrutiva sobre o cadastro de outra pessoa, deliberada e coberta por
 * teste lá. Duplicá-la aqui criaria um segundo caminho de sequestro de identidade
 * para ganhar nada: o registro rival já responde pela busca.
 */
export const syncSucontIdentityFn = createServerFn({ method: "POST" }).handler(async (): Promise<{ ok: boolean }> => {
	const user = await requireUser()
	const email = user.email?.trim()
	// Conta sem e-mail não tem o que registrar: `""` não é buscável e colidiria com
	// toda outra conta sem e-mail no índice único.
	if (!email) return { ok: false }

	const { error } = await getCoreClient().from("user_data").upsert({ id: user.id, email }, { onConflict: "id" })
	if (!error) return { ok: true }
	if (error.code === "23505") return { ok: false }
	throw new Error(error.message)
})

// ── Vínculo de SARAM (change `saram-verified-link`) ─────────────────────────
//
// As MESMAS funções `core.*` que o sisub chama (a regra mora no banco), aqui por RPC. Conta, e-mail
// e e-mail confirmado vêm SEMPRE da sessão; o payload só traz o que a pessoa declara (o SARAM que
// diz ser o seu, o CPF que o confere, a justificativa) e o banco confere contra o cadastro. O
// `jsonb` de volta é lido pelo parser compartilhado (`@iefa/database/saram-link`), o mesmo do sisub.

/** Conta, e-mail e e-mail confirmado: tudo da sessão, nunca do payload. */
function sessionArgs(user: { id: string; email?: string | null; email_confirmed_at?: string | null }) {
	// `p_email` é `text` no banco e aceita nulo (conta sem e-mail cai em "sem identificação").
	return { p_user: user.id, p_email: (user.email?.trim() || null) as string, p_email_confirmed: Boolean(user.email_confirmed_at) }
}

/** Erro estável da função → frase com o próximo passo; o resto não vai cru para a tela. */
function rpcError(error: { message: string }): never {
	throw new Error(saramLinkErrorMessage(error.message))
}

/**
 * Estado do vínculo da PRÓPRIA conta e as ações possíveis — o aviso de entrada e o diálogo "Meu
 * cadastro militar" são montados só a partir disto. Sem argumento: receber um `userId` aqui
 * devolveria o SARAM de qualquer conta (IDOR), e SARAM é dado pessoal.
 */
export const fetchMySaramStatusFn = createServerFn({ method: "GET" }).handler(async (): Promise<SaramStatus> => {
	const user = await requireUser()
	const { data, error } = await getCoreClient().rpc("saram_link_status", sessionArgs(user))
	if (error) rpcError(error)
	return parseSaramStatus(data)
})

/**
 * Mutações da própria conta. Exigem acesso ao app (`requireSucontApp`, qualquer módulo do sucont):
 * só sessão bastava, e qualquer conta do ERP mexeria no vínculo por este endpoint sem nunca ter
 * acesso ao hub.
 */
export const confirmSaramCandidateFn = createServerFn({ method: "POST" })
	.validator(
		z.object({
			candidateRef: z.number().int().positive(),
			cpfSuffix: z
				.string()
				.regex(/^\d{4}$/)
				.optional(),
		})
	)
	.handler(async ({ data }): Promise<SaramLinkOutcome> => {
		await requireSucontApp()
		const user = await requireUser()
		const { data: result, error } = await getCoreClient().rpc("confirm_saram_candidate", {
			...sessionArgs(user),
			p_candidate: data.candidateRef,
			p_cpf_suffix: (data.cpfSuffix ?? null) as string,
		})
		if (error) rpcError(error)
		return parseSaramOutcome(result)
	})

export const verifySaramByCpfFn = createServerFn({ method: "POST" })
	.validator(z.object({ saram: z.string().regex(/^\d{6,7}$/, "O SARAM tem 6 ou 7 dígitos."), cpf: z.string().regex(/^\d{11}$/, "O CPF tem 11 dígitos.") }))
	.handler(async ({ data }): Promise<SaramLinkOutcome> => {
		await requireSucontApp()
		const user = await requireUser()
		const { data: result, error } = await getCoreClient().rpc("verify_saram_by_cpf", { ...sessionArgs(user), p_saram: data.saram, p_cpf: data.cpf })
		if (error) rpcError(error)
		return parseSaramOutcome(result)
	})

export const requestSaramLinkFn = createServerFn({ method: "POST" })
	.validator(z.object({ saram: z.string().regex(/^\d{6,7}$/, "O SARAM tem 6 ou 7 dígitos."), justification: z.string().trim().min(10).max(1000) }))
	.handler(async ({ data }): Promise<SaramLinkOutcome> => {
		await requireSucontApp()
		const user = await requireUser()
		const { data: result, error } = await getCoreClient().rpc("request_saram_link", {
			...sessionArgs(user),
			p_saram: data.saram,
			p_justification: data.justification,
		})
		if (error) rpcError(error)
		return parseSaramOutcome(result)
	})

export const withdrawSaramRequestFn = createServerFn({ method: "POST" })
	.validator(z.object({ requestId: z.uuid() }))
	.handler(async ({ data }): Promise<SaramLinkOutcome> => {
		await requireSucontApp()
		const user = await requireUser()
		const { data: result, error } = await getCoreClient().rpc("withdraw_saram_request", { ...sessionArgs(user), p_request: data.requestId })
		if (error) rpcError(error)
		return parseSaramOutcome(result)
	})

/** A própria conta se declara de seção (perde SARAM e arranchamentos futuros) ou volta a pessoal. */
export const setOwnAccountKindFn = createServerFn({ method: "POST" })
	.validator(z.object({ kind: z.enum(["pessoal", "institucional"]) }))
	.handler(async ({ data }): Promise<SaramLinkOutcome> => {
		await requireSucontApp()
		const user = await requireUser()
		const { data: result, error } = await getCoreClient().rpc("set_own_account_kind", { ...sessionArgs(user), p_kind: data.kind })
		if (error) rpcError(error)
		return parseSaramOutcome(result)
	})
