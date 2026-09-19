/**
 * O perfil do usuário e as OMs — o que a interface precisa para não oferecer o que vai
 * devolver 403, e o seletor de OM do envio.
 *
 * O contrato das respostas mora em `@iefa/alpha-client/access`, compartilhado com o
 * contrate; `access.contract.test.ts` o confere contra o que estas rotas devolvem.
 */

import type { AccessUnit, MeAccess, UnitOption, UnitSet } from "@iefa/alpha-client/access"
import type { User } from "@supabase/supabase-js"
import { Hono } from "hono"
import { core } from "../db/supabase.ts"
import { type AlphaAccess, unitsFor } from "../lib/alpha-access.ts"

type Variables = { user: User; access: AlphaAccess }

/** Corpo de `GET /api/v1/me/access`, sem as OMs (que dependem de leitura). Puro. */
export function buildMeAccess(access: AlphaAccess, units: AccessUnit[]): MeAccess {
	return {
		roles: { ...access.roles },
		units,
		can_submit: access.canSubmit,
	}
}

/** Todas as OMs que o usuário alcança por algum papel — os ids que o seletor de filtro mostra. */
export function coverageForPickers(access: AlphaAccess): UnitSet {
	return unitsFor(access, "requester", "procurement", "aci", "admin")
}

export const accessRoutes = new Hono<{ Variables: Variables }>()
	// GET /api/v1/me/access — papéis por OM (já expandidos pela hierarquia de apoio) e as OMs
	// que eles alcançam.
	.get("/api/v1/me/access", async (c) => {
		const access = c.get("access")
		const coverage = coverageForPickers(access)

		let units: AccessUnit[] = []
		if (coverage === "all" || coverage.length > 0) {
			// Mesmo recorte de `/units`: sem a sentinela de treino e sem a sobra de teste sem tipo.
			let query = core.from("units").select("id, code, display_name").eq("is_training", false).not("type", "is", null).order("code")
			if (coverage !== "all") query = query.in("id", [...coverage])
			const { data, error } = await query
			// Falha aqui NÃO vira "nenhuma OM": a tela esconderia filtros de quem tem papel.
			if (error) return c.json({ error: "Internal Server Error", code: "UNITS_FAILED" }, 500)
			units = (data ?? []) as AccessUnit[]
		}

		return c.json(buildMeAccess(access, units))
	})

	// GET /api/v1/units — as OMs para o seletor do ENVIO. Qualquer autenticado: enviar não
	// exige papel, e o documento pode ser atribuído a qualquer OM. A sentinela de treino do
	// sisub fica de fora — não é OM de processo real —, e a linha sem `type` também: é resto
	// de suíte de integração (`[TEST]…`), não OM cadastrada.
	.get("/api/v1/units", async (c) => {
		const { data, error } = await core
			.from("units")
			.select("id, code, display_name, supporting_unit_id")
			.eq("is_training", false)
			.not("type", "is", null)
			.order("code")
		if (error) return c.json({ error: "Internal Server Error", code: "UNITS_FAILED" }, 500)
		return c.json({ units: (data ?? []) as UnitOption[] })
	})
