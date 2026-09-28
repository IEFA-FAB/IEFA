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

import { getCoreClient } from "#/lib/supabase.server"

export type MilitaryIdentity = {
	/** Sigla do posto/graduação (`posto`). */
	posto: string | null
	/** Nome de guerra (`nome_guerra`). */
	nomeGuerra: string | null
}

/**
 * Identificação militar de cada `nrOrdem` pedido, indexada pelo próprio `nrOrdem`.
 * SARAM sem correspondência simplesmente não entra no mapa — quem chama já trata
 * a ausência (o rótulo cai para o e-mail).
 */
export async function fetchMilitaryIdentities(nrOrdens: readonly string[]): Promise<Map<string, MilitaryIdentity>> {
	const wanted = [...new Set(nrOrdens.filter((n) => n.trim().length > 0))]
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
export async function fetchMilitaryIdentity(nrOrdem: string): Promise<MilitaryIdentity | null> {
	return (await fetchMilitaryIdentities([nrOrdem])).get(nrOrdem) ?? null
}
