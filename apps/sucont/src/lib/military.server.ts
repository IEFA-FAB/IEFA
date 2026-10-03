/**
 * @module military.server
 * Leitura do cadastro de pessoal da FAB pelo SARAM, pela view `core.military_identity`.
 *
 * O espelho (`core.user_military_data`) é o cadastro nominal de ~68 mil militares,
 * compartilhado por todo o ERP. A view dá só o que os apps usam, sem CPF e sem nome
 * completo (change `lgpd-military-roster-key`). Aqui ela é lida SÓ por SARAM conhecido
 * — nunca varrida — e só duas colunas saem: posto e nome de guerra; o que a tela de
 * acessos precisa é reconhecer a pessoa, não ter a ficha dela (LGPD, minimização — a
 * mesma lição de `apps/api` servir dado nominal sem autenticação).
 *
 * Nunca importe no cliente: usa o client service-role.
 */

import { visibleSaramOf } from "@iefa/database/saram-link"
import { getCoreClient } from "#/lib/supabase.server"

export type MilitaryIdentity = {
	/** Sigla do posto/graduação (`posto`). */
	posto: string | null
	/** Nome de guerra (`nome_guerra`). */
	nomeGuerra: string | null
}

/**
 * Identificação militar de cada `saram` pedido, indexada pelo próprio `saram`.
 * SARAM sem correspondência simplesmente não entra no mapa — quem chama já trata
 * a ausência (o rótulo cai para o e-mail).
 */
export async function fetchMilitaryIdentities(sarams: readonly string[]): Promise<Map<string, MilitaryIdentity>> {
	const wanted = [...new Set(sarams.filter((n) => n.trim().length > 0))]
	if (wanted.length === 0) return new Map()

	// Da carga mais antiga para a mais recente: no `Map`, a última linha do SARAM vence, como no
	// sisub e no rumaer (o espelho não tem o SARAM como UNIQUE).
	const { data, error } = await getCoreClient()
		.from("military_identity")
		.select("saram, posto, nome_guerra")
		.in("saram", wanted)
		.order("data_atualizacao", { ascending: true, nullsFirst: true })
	if (error) throw new Error(error.message)

	return new Map((data ?? []).flatMap((row) => (row.saram ? [[row.saram, { posto: row.posto, nomeGuerra: row.nome_guerra }] as const] : [])))
}

/** Atalho de um SARAM só — a confirmação do diálogo de primeiro acesso. */
export async function fetchMilitaryIdentity(saram: string): Promise<MilitaryIdentity | null> {
	return (await fetchMilitaryIdentities([saram])).get(saram) ?? null
}

/**
 * O SARAM que identifica cada conta (change `saram-verified-link`): só o vínculo verificado, ou o
 * antigo (`legacy`) sem o mesmo SARAM verificado em outra conta — a regra de `core.visible_saram`,
 * aplicada em lote. A coluna crua não serve: um SARAM digitado por outra pessoa, ainda sem
 * verificação, rotularia a conta com o posto e o nome de guerra do dono.
 */
export async function fetchVisibleSarams(userIds: readonly string[]): Promise<Map<string, string | null>> {
	const ids = [...new Set(userIds)]
	if (ids.length === 0) return new Map()
	const core = getCoreClient()
	const { data, error } = await core.from("user_data").select("id, saram, saram_verified_by, account_kind").in("id", ids)
	if (error) throw new Error(error.message)
	const rows = data ?? []

	const legacy = [...new Set(rows.flatMap((r) => (r.saram_verified_by === "legacy" && r.saram ? [r.saram] : [])))]
	const verifiedHolders = new Map<string, Set<string>>()
	if (legacy.length > 0) {
		const { data: holders, error: holdersError } = await core
			.from("user_data")
			.select("id, saram")
			.in("saram", legacy)
			.in("saram_verified_by", ["email", "cpf", "admin"])
		if (holdersError) throw new Error(holdersError.message)
		for (const h of holders ?? []) {
			if (!h.saram) continue
			const set = verifiedHolders.get(h.saram) ?? new Set<string>()
			set.add(h.id)
			verifiedHolders.set(h.saram, set)
		}
	}

	return new Map(rows.map((r) => [r.id, visibleSaramOf(r, (saram) => [...(verifiedHolders.get(saram) ?? [])].some((holder) => holder !== r.id))]))
}
