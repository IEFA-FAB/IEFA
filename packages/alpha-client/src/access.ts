/**
 * Contrato de `GET /api/v1/me/access` do Projeto α — o perfil do usuário, para a interface
 * não oferecer o que vai devolver 403. A regra mora no α; o cliente só lê o resultado.
 *
 * Subpath próprio (`@iefa/alpha-client/access`) para quem só precisa do contrato não puxar o
 * LangChain do índice do pacote.
 *
 * ## Papéis por OM
 *
 * Cada papel é um módulo PBAC escopado por OM (`alpha-requester`, `alpha-procurement`,
 * `alpha-aci`, `alpha-admin`). A cobertura vem JÁ expandida pela hierarquia de apoio: grant
 * no GAP-SJ lista também IAE, DCTA e IEFA. `"all"` é o grant global.
 *
 * Os papéis se ACUMULAM: a mesma pessoa pode ter os quatro, na mesma OM (sem segregação de
 * funções, decisão do mantenedor de 2026-09-19).
 *
 * ## Campos legados — removidos
 *
 * `level`, `can_see_all`, `can_decide` e `can_manage_access` (o formato por nível de antes do
 * escopo por OM) saíram no PR de limpeza. O `z.object` descarta chave desconhecida, então um
 * contrate com este schema lê tanto o α que ainda os manda quanto o que não manda — mas o
 * contrate ANTERIOR os exige, e por isso o contrate sobe antes do α (ver o PR).
 */

import { z } from "zod"

export const ALPHA_ROLES = ["requester", "procurement", "aci", "admin"] as const
export type AlphaRole = (typeof ALPHA_ROLES)[number]

/** Unidades alcançadas: `"all"` (global) ou os ids das OMs, já expandidos pelo apoio. */
export const UnitSetSchema = z.union([z.literal("all"), z.array(z.number().int())])
export type UnitSet = z.infer<typeof UnitSetSchema>

export const AccessUnitSchema = z.object({
	id: z.number().int(),
	code: z.string(),
	display_name: z.string().nullable(),
})
export type AccessUnit = z.infer<typeof AccessUnitSchema>

export const MeAccessSchema = z.object({
	roles: z.object({
		requester: UnitSetSchema,
		procurement: UnitSetSchema,
		aci: UnitSetSchema,
		admin: UnitSetSchema,
	}),
	/**
	 * As OMs que o usuário alcança por QUALQUER papel, para os seletores de filtro. Vazia para
	 * quem não tem papel — o envio de documento usa a lista inteira de `GET /api/v1/units`.
	 */
	units: z.array(AccessUnitSchema),
	/** Pode enviar documento. Só um deny sem escopo em `alpha-requester` fecha. */
	can_submit: z.boolean(),
})
export type MeAccess = z.infer<typeof MeAccessSchema>

/** Linha de `GET /api/v1/units` — o seletor de OM do envio. */
export const UnitOptionSchema = AccessUnitSchema.extend({
	supporting_unit_id: z.number().int().nullable(),
})
export type UnitOption = z.infer<typeof UnitOptionSchema>

export const UnitsResponseSchema = z.object({
	units: z.array(UnitOptionSchema),
})
export type UnitsResponse = z.infer<typeof UnitsResponseSchema>
