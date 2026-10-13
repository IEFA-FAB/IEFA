/**
 * @module saram-admin.fn
 * Console de vínculos de SARAM (change `saram-verified-link`): fila de pedidos, contestações,
 * legacy a revisar e candidatas a institucional; decidir, vincular, desvincular, marcar tipo.
 *
 * Mesma linha das fns de permissão: `admin` nível 2 (global — `sgOrg` não tem mapeamento
 * confiável para `core.units`, design.md D9), garantia `fresh` pelo registro e `withAtomicAudit`:
 * quem grava `access_control.sensitive_operation_log` é a função SQL, na mesma transação, com o
 * ator da sessão. Cada mutação leva a versão que a tela viu (pedido pendente, SARAM esperado, tipo
 * esperado) e o banco confere (EDIT-SAFETY).
 *
 * @domain core
 * @migration 20261003100000_saram_verified_link
 */

import {
	DecideSaramRequestSchema,
	decideSaramRequest,
	LinkUserSaramSchema,
	linkUserSaram,
	listSaramReviewQueue,
	type SaramAdminResult,
	type SaramReviewQueue,
	type SaramSearchAccount,
	SearchSaramAccountsSchema,
	SetUserAccountKindSchema,
	searchSaramAccounts,
	setUserAccountKind,
	UnlinkUserSaramSchema,
	unlinkUserSaram,
} from "@iefa/sisub-domain"
import { createServerFn } from "@tanstack/react-start"
import { withAtomicAudit } from "@/lib/audit.server"
import { requireAuthWithPermission } from "@/lib/auth.server"
import { getDb } from "@/lib/db.server"
import { handleDomainError } from "@/lib/domain-errors"
import { enforcedAssuranceFor } from "@/server/assurance-registry"

export type { SaramAdminResult, SaramReviewQueue, SaramSearchAccount }

export const fetchSaramReviewQueueFn = createServerFn({ method: "GET" }).handler(async (): Promise<SaramReviewQueue> => {
	const ctx = await requireAuthWithPermission("admin", 2)
	return listSaramReviewQueue(getDb(), ctx).catch(handleDomainError)
})

/** Busca de qualquer conta (e-mail, nome de guerra ou SARAM) para agir fora das filas. Só leitura. */
export const searchSaramAccountsFn = createServerFn({ method: "GET" })
	.validator(SearchSaramAccountsSchema)
	.handler(async ({ data }): Promise<SaramSearchAccount[]> => {
		const ctx = await requireAuthWithPermission("admin", 2)
		return searchSaramAccounts(getDb(), ctx, data).catch(handleDomainError)
	})

export const decideSaramRequestFn = createServerFn({ method: "POST" })
	.validator(DecideSaramRequestSchema)
	.handler(async ({ data }): Promise<SaramAdminResult> => {
		const ctx = await requireAuthWithPermission("admin", 2, undefined, enforcedAssuranceFor("decideSaramRequestFn"))
		return withAtomicAudit("decideSaramRequestFn", ({ assurance, audit }) => decideSaramRequest(getDb(), ctx, data, assurance, audit)).catch(handleDomainError)
	})

export const linkUserSaramFn = createServerFn({ method: "POST" })
	.validator(LinkUserSaramSchema)
	.handler(async ({ data }): Promise<SaramAdminResult> => {
		const ctx = await requireAuthWithPermission("admin", 2, undefined, enforcedAssuranceFor("linkUserSaramFn"))
		return withAtomicAudit("linkUserSaramFn", ({ assurance, audit }) => linkUserSaram(getDb(), ctx, data, assurance, audit)).catch(handleDomainError)
	})

export const unlinkUserSaramFn = createServerFn({ method: "POST" })
	.validator(UnlinkUserSaramSchema)
	.handler(async ({ data }): Promise<SaramAdminResult> => {
		const ctx = await requireAuthWithPermission("admin", 2, undefined, enforcedAssuranceFor("unlinkUserSaramFn"))
		return withAtomicAudit("unlinkUserSaramFn", ({ assurance, audit }) => unlinkUserSaram(getDb(), ctx, data, assurance, audit)).catch(handleDomainError)
	})

export const setUserAccountKindFn = createServerFn({ method: "POST" })
	.validator(SetUserAccountKindSchema)
	.handler(async ({ data }): Promise<SaramAdminResult> => {
		const ctx = await requireAuthWithPermission("admin", 2, undefined, enforcedAssuranceFor("setUserAccountKindFn"))
		return withAtomicAudit("setUserAccountKindFn", ({ assurance, audit }) => setUserAccountKind(getDb(), ctx, data, assurance, audit)).catch(handleDomainError)
	})
