/**
 * @module saram-link.fn
 * Vínculo de SARAM verificado da PRÓPRIA conta (change `saram-verified-link`).
 * Thin wrappers over @iefa/sisub-domain (operations/saram-link).
 *
 * AUTH — self-only. Conta, e-mail e e-mail confirmado vêm da sessão (`requireSaramSession`); o
 * payload só traz o que a pessoa declara (o SARAM que diz ser o seu, o CPF que o confere, a
 * justificativa) e o banco confere contra o cadastro de pessoal. A regra mora em funções `core.*`
 * (migration 20261003100000), as mesmas que o sucont chama por RPC.
 *
 * A tela (FASE 2) é montada só a partir de `fetchMySaramStatusFn`: `status` diz o estado e
 * `actions` diz o que oferecer. Toda mutação devolve `{ outcome, status }` com o estado novo.
 *
 * @domain core
 * @migration 20261003100000_saram_verified_link
 */

import {
	ConfirmSaramCandidateSchema,
	confirmSaramCandidate,
	fetchMySaramStatus,
	RequestSaramLinkSchema,
	requestSaramLink,
	type SaramLinkOutcome,
	type SaramStatus,
	SetOwnAccountKindSchema,
	setOwnAccountKind,
	VerifySaramByCpfSchema,
	verifySaramByCpf,
	WithdrawSaramRequestSchema,
	withdrawSaramRequest,
} from "@iefa/sisub-domain"
import { createServerFn } from "@tanstack/react-start"
import { requireSaramSession } from "@/lib/auth.server"
import { getDb } from "@/lib/db.server"
import { handleDomainError } from "@/lib/domain-errors"

export type { SaramLinkOutcome, SaramStatus }

/** Estado do vínculo e as ações possíveis (`verified`, `suggestion`, `homonyms`, `no_match`, …). */
export const fetchMySaramStatusFn = createServerFn({ method: "GET" }).handler(async (): Promise<SaramStatus> => {
	const session = await requireSaramSession()
	return fetchMySaramStatus(getDb(), session).catch(handleDomainError)
})

/**
 * Confirma o candidato da chave do e-mail ("Identificamos você como 3S SILVA"). Homônimo, ou
 * e-mail com dígito de homônimo: `cpfSuffix` (4 últimos dígitos do CPF), com tentativas limitadas.
 */
export const confirmSaramCandidateFn = createServerFn({ method: "POST" })
	.validator(ConfirmSaramCandidateSchema)
	.handler(async ({ data }): Promise<SaramLinkOutcome> => {
		const session = await requireSaramSession()
		return confirmSaramCandidate(getDb(), session, data).catch(handleDomainError)
	})

/** SARAM + CPF completo. `mismatch` e `locked` são resultados (a tentativa fica registrada), não erros. */
export const verifySaramByCpfFn = createServerFn({ method: "POST" })
	.validator(VerifySaramByCpfSchema)
	.handler(async ({ data }): Promise<SaramLinkOutcome> => {
		const session = await requireSaramSession()
		return verifySaramByCpf(getDb(), session, data).catch(handleDomainError)
	})

/** Pedido de vínculo para o administrador; SARAM já vinculado a outra conta vira contestação. */
export const requestSaramLinkFn = createServerFn({ method: "POST" })
	.validator(RequestSaramLinkSchema)
	.handler(async ({ data }): Promise<SaramLinkOutcome> => {
		const session = await requireSaramSession()
		return requestSaramLink(getDb(), session, data).catch(handleDomainError)
	})

/** Desiste do pedido (ou contestação) pendente da própria conta. */
export const withdrawSaramRequestFn = createServerFn({ method: "POST" })
	.validator(WithdrawSaramRequestSchema)
	.handler(async ({ data }): Promise<SaramLinkOutcome> => {
		const session = await requireSaramSession()
		return withdrawSaramRequest(getDb(), session, data).catch(handleDomainError)
	})

/**
 * A própria conta se declara institucional (conta de seção: perde o SARAM, o pedido pendente e os
 * arranchamentos de hoje em diante) ou volta a pessoal (e verifica o SARAM de novo).
 */
export const setOwnAccountKindFn = createServerFn({ method: "POST" })
	.validator(SetOwnAccountKindSchema)
	.handler(async ({ data }): Promise<SaramLinkOutcome> => {
		const session = await requireSaramSession()
		return setOwnAccountKind(getDb(), session, data).catch(handleDomainError)
	})
