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
 * ## Campos legados
 *
 * `level`, `can_see_all`, `can_decide` e `can_manage_access` são o formato de antes do escopo
 * por OM, derivados dos papéis para o contrate já publicado seguir funcionando até ser
 * atualizado. Saem junto com o módulo `alpha`, no PR de limpeza.
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

	/** @deprecated nível do módulo `alpha` antigo: 3 ACI, 2 licitações, 1 requisitante, 0 nenhum. */
	level: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
	/** @deprecated "enxerga a fila": licitações ou ACI em alguma OM. */
	can_see_all: z.boolean(),
	/** @deprecated ACI em alguma OM — a decisão por processo vem em `can_decide` do processo. */
	can_decide: z.boolean(),
	/** @deprecated `alpha-admin` 3 em alguma OM. */
	can_manage_access: z.boolean(),
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
