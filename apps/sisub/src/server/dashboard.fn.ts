/**
 * @module dashboard.fn
 * Painel de subsistência da unidade: previsão, presença e o diretório de quem aparece nelas.
 * Thin wrapper over @iefa/sisub-domain (operations/dashboard).
 * @domain core
 * @migration done
 */

import { getUnitDashboard, UnitDashboardSchema } from "@iefa/sisub-domain"
import { createServerFn } from "@tanstack/react-start"
import { requireAuthWithPermission } from "@/lib/auth.server"
import { getDb } from "@/lib/db.server"
import { handleDomainError } from "@/lib/domain-errors"

/**
 * O painel devolve dado pessoal — nome, posto, OM, e-mail e o rastro de presença por pessoa.
 *
 * Até aqui a tela lia isso do navegador, direto de `api.iefa.com.br`, por rotas ANÔNIMAS: o
 * mesmo conteúdo saía num GET sem sessão nenhuma. O guard é `local-analytics` nível 1 na
 * unidade pedida — o mesmo que `$unitId/route.tsx` exige para navegar. O guard da rota não
 * dispensa este: `/_serverFn/...` é chamável direto, sem passar por rota nenhuma.
 */
export const fetchUnitDashboardFn = createServerFn({ method: "GET" })
	.validator(UnitDashboardSchema)
	.handler(async ({ data }) => {
		await requireAuthWithPermission("local-analytics", 1, { type: "unit", id: data.unitId })
		return getUnitDashboard(getDb(), data).catch(handleDomainError)
	})
