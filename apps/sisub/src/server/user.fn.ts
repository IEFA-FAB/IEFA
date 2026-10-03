/**
 * @module user.fn
 * User profile and military data sync in the sisub schema.
 * Thin wrappers over @iefa/sisub-domain (operations/user).
 *
 * AUTH — self-only. Todas exigem sessão e derivam a identidade do JWT, IGNORANDO o
 * `userId`/`email` do payload. Antes eram anônimas ("by design", para o bootstrap de
 * login), o que abria três buracos no endpoint `/_serverFn/...`, chamável direto:
 *   - `fetchMilitaryDataFn` devolvia CPF + nome completo + posto para qualquer
 *     `saram` — enumeração de dados pessoais sem autenticação (LGPD);
 *   - `fetchUserDataFn`/`fetchUserSaramFn` liam o perfil de qualquer `userId` (IDOR);
 *   - `syncUserEmailFn` escrevia email arbitrário e, na colisão, APAGA a linha que
 *     detém aquele email (`upsertUserDataReclaimingEmail`) — sequestro de identidade.
 *
 * O bootstrap continua funcionando: todos os chamadores rodam depois do login
 * (`useProfile`, `useUserSaram`, `_protected/route.tsx`), com sessão válida.
 *
 * @domain core
 * @migration done
 */

import {
	FetchMilitaryDataSchema,
	FetchUserDataSchema,
	FetchUserSaramSchema,
	fetchMaskedCpf,
	fetchMilitaryData,
	fetchSisubUserData,
	fetchVisibleSaram,
	syncUserEmail,
} from "@iefa/sisub-domain"
import { createServerFn } from "@tanstack/react-start"
import { requireUser, requireUserId } from "@/lib/auth.server"
import { getDb } from "@/lib/db.server"
import { handleDomainError } from "@/lib/domain-errors"
import type { MilitaryDataRow } from "@/types/domain/admin"

/**
 * O validator é mantido para não quebrar o formato do payload dos chamadores, mas
 * `data.userId` é descartado: a identidade vem sempre da sessão.
 */
export const fetchUserDataFn = createServerFn({ method: "GET" })
	.validator(FetchUserDataSchema)
	.handler(async () => {
		const userId = await requireUserId()
		return fetchSisubUserData(getDb(), { userId }).catch(handleDomainError)
	})

/**
 * O `saram` é resolvido a partir da sessão, não do payload — comparar a string do
 * cliente convidaria divergência de formato (zero à esquerda, número vs string) e um
 * 403 falso na tela de perfil. Sem saram vinculado à conta: `null`.
 *
 * O CPF sai MASCARADO, e a máscara é montada no banco (`core.military_masked_cpf`): o documento
 * inteiro não chega nem a este servidor. Enquanto o saram era regravável à vontade, esta fn era
 * uma consulta de CPF por SARAM; desde 20261003100000 ele só vale VERIFICADO (`core.visible_saram`,
 * change `saram-verified-link`). O nome completo não sai: a identificação é posto e nome de guerra
 * (`core.military_identity`, change `lgpd-military-roster-key`).
 */
export const fetchMilitaryDataFn = createServerFn({ method: "GET" })
	.validator(FetchMilitaryDataSchema)
	.handler(async (): Promise<MilitaryDataRow | null> => {
		const userId = await requireUserId()
		const db = getDb()
		// Só o SARAM VERIFICADO (ou legacy ainda não revisado) abre o cadastro: pedido pendente,
		// SARAM gravado fora do fluxo verificado e conta institucional não veem nada (20261003100000).
		const saram = await fetchVisibleSaram(db, { userId }).catch(handleDomainError)
		if (!saram) return null
		const [row, maskedCpf] = await Promise.all([fetchMilitaryData(db, { saram }), fetchMaskedCpf(db, { saram })]).catch(handleDomainError)
		if (!row) return null
		return { ...row, maskedCpf }
	})

/** SARAM da conta que vale para os dados militares (verificado, ou legacy ainda não revisado). */
export const fetchUserSaramFn = createServerFn({ method: "GET" })
	.validator(FetchUserSaramSchema)
	.handler(async () => {
		const userId = await requireUserId()
		return fetchVisibleSaram(getDb(), { userId }).catch(handleDomainError)
	})

/** Sem validator: ambos os campos vêm do JWT — o corpo enviado pelo cliente é irrelevante. */
export const syncUserEmailFn = createServerFn({ method: "POST" }).handler(async () => {
	const user = await requireUser()
	return syncUserEmail(getDb(), { userId: user.id, email: user.email }).catch(handleDomainError)
})
