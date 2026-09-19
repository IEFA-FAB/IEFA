/**
 * @module user.fn
 * User profile and military data sync in the sisub schema.
 * Thin wrappers over @iefa/sisub-domain (operations/user).
 *
 * AUTH — self-only. Todas exigem sessão e derivam a identidade do JWT, IGNORANDO o
 * `userId`/`email` do payload. Antes eram anônimas ("by design", para o bootstrap de
 * login), o que abria três buracos no endpoint `/_serverFn/...`, chamável direto:
 *   - `fetchMilitaryDataFn` devolvia nrCpf + nome completo + posto para qualquer
 *     `nrOrdem` — enumeração de dados pessoais sem autenticação (LGPD);
 *   - `fetchUserDataFn`/`fetchUserNrOrdemFn` liam o perfil de qualquer `userId` (IDOR);
 *   - `syncUserEmailFn` escrevia email arbitrário e, na colisão, APAGA a linha que
 *     detém aquele email (`upsertUserDataReclaimingEmail`) — sequestro de identidade.
 *
 * O bootstrap continua funcionando: todos os chamadores rodam depois do login
 * (`useProfile`, `useUserNrOrdem`, `_protected/route.tsx`), com sessão válida.
 *
 * @domain core
 * @migration done
 */

import {
	FetchMilitaryDataSchema,
	FetchUserDataSchema,
	FetchUserNrOrdemSchema,
	fetchMilitaryData,
	fetchSisubUserData,
	fetchUserNrOrdem,
	SyncUserNrOrdemSchema,
	syncUserEmail,
	syncUserNrOrdem,
} from "@iefa/sisub-domain"
import { createServerFn } from "@tanstack/react-start"
import { requireUser, requireUserId } from "@/lib/auth.server"
import { maskCpf } from "@/lib/cpf-mask"
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
 * O `nrOrdem` é resolvido a partir da sessão, não do payload — comparar a string do
 * cliente convidaria divergência de formato (zero à esquerda, número vs string) e um
 * 403 falso na tela de perfil. Sem nrOrdem vinculado à conta: `null`.
 *
 * O CPF sai MASCARADO. Enquanto o nrOrdem era regravável à vontade, esta fn era uma
 * consulta de CPF por número de ordem; o vínculo agora é write-once e exclusivo
 * (`syncUserNrOrdem`), e o documento inteiro deixa de viajar de qualquer forma.
 */
export const fetchMilitaryDataFn = createServerFn({ method: "GET" })
	.validator(FetchMilitaryDataSchema)
	.handler(async (): Promise<MilitaryDataRow | null> => {
		const userId = await requireUserId()
		const db = getDb()
		const nrOrdem = await fetchUserNrOrdem(db, { userId }).catch(handleDomainError)
		if (!nrOrdem) return null
		const row = await fetchMilitaryData(db, { nrOrdem }).catch(handleDomainError)
		if (!row) return null
		const { nrCpf, ...rest } = row
		return { ...rest, nrCpfMasked: maskCpf(nrCpf) }
	})

export const fetchUserNrOrdemFn = createServerFn({ method: "GET" })
	.validator(FetchUserNrOrdemSchema)
	.handler(async () => {
		const userId = await requireUserId()
		return fetchUserNrOrdem(getDb(), { userId }).catch(handleDomainError)
	})

/**
 * `nrOrdem` vem do formulário (input legítimo do usuário); `userId`/`email`, da sessão.
 * O vínculo é write-once e exclusivo — a regra mora em `syncUserNrOrdem`.
 */
export const syncUserNrOrdemFn = createServerFn({ method: "POST" })
	.validator(SyncUserNrOrdemSchema)
	.handler(async ({ data }) => {
		const user = await requireUser()
		return syncUserNrOrdem(getDb(), { userId: user.id, email: user.email ?? "", nrOrdem: data.nrOrdem }).catch(handleDomainError)
	})

/** Sem validator: ambos os campos vêm do JWT — o corpo enviado pelo cliente é irrelevante. */
export const syncUserEmailFn = createServerFn({ method: "POST" }).handler(async () => {
	const user = await requireUser()
	return syncUserEmail(getDb(), { userId: user.id, email: user.email }).catch(handleDomainError)
})
