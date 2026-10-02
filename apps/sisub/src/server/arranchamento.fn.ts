/**
 * @module arranchamento.fn
 * Arranchamento do comensal (will_eat por data + refeição + refeitório).
 * Thin wrappers over @iefa/sisub-domain (operations/arranchamento).
 * @domain core
 * @migration done
 */

import {
	DeleteArranchamentoSchema,
	deleteArranchamento,
	GetUserDefaultMessHallSchema,
	getUserDefaultMessHall,
	ListArranchamentosSchema,
	listArranchamentos,
	PersistDefaultMessHallSchema,
	persistDefaultMessHall,
	UpsertArranchamentoSchema,
	upsertArranchamento,
} from "@iefa/sisub-domain"
import { createServerFn } from "@tanstack/react-start"
import { requireAuth, requireSessionIdentity } from "@/lib/auth.server"
import { getDb } from "@/lib/db.server"
import { handleDomainError } from "@/lib/domain-errors"
import { requireAuthThenRun } from "@/lib/domain-handler.server"
import { withSessionIdentity } from "@/lib/session-identity"

// Toda fn deste módulo é self-only: age sobre o arranchamento de QUEM CHAMA. Os reads
// continuam aceitando `userId` no payload para não quebrar o formato dos chamadores, mas o
// valor é substituído pelo da sessão — `withSessionIdentity` deixa isso no código, e não num
// comentário como antes (a garantia dependia da ordem do spread em `{ ...data, userId }`).
// Antes de haver guard aqui, os reads eram anônimos e o chamador escolhia de quem era o
// arranchamento/refeitório padrão que queria ler.
export const fetchArranchamentosFn = createServerFn({ method: "GET" })
	.validator(ListArranchamentosSchema)
	.handler(async ({ data }) => {
		const session = await requireSessionIdentity()
		return listArranchamentos(getDb(), withSessionIdentity(data, session, ["userId"])).catch(handleDomainError)
	})

export const fetchUserDefaultMessHallFn = createServerFn({ method: "GET" })
	.validator(GetUserDefaultMessHallSchema)
	.handler(async ({ data }) => {
		const session = await requireSessionIdentity()
		return getUserDefaultMessHall(getDb(), withSessionIdentity(data, session, ["userId"])).catch(handleDomainError)
	})

// O `email` também vem da sessão. Vinha do payload, e `persistDefaultMessHall` o grava na
// linha do chamador em `core.user_data`, onde a coluna é UNIQUE: bastava mandar o email de
// outra pessoa para carimbá-lo na própria linha e, com isso, ser encontrado no lugar dela por
// `searchUsersByEmail` — a busca do console de permissões. É a mesma classe de furo que
// `syncUserEmailFn` já havia fechado (ver a nota de `requireUser` em auth.server).
export const persistDefaultMessHallFn = createServerFn({ method: "POST" })
	.validator(PersistDefaultMessHallSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		const session = await requireSessionIdentity()
		return persistDefaultMessHall(getDb(), ctx, withSessionIdentity(data, session, ["email"])).catch(handleDomainError)
	})

export const upsertArranchamentoFn = createServerFn({ method: "POST" }).validator(UpsertArranchamentoSchema).handler(requireAuthThenRun(upsertArranchamento))

export const deleteArranchamentoFn = createServerFn({ method: "POST" }).validator(DeleteArranchamentoSchema).handler(requireAuthThenRun(deleteArranchamento))
