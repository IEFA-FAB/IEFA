/**
 * @module military.server
 * Leitura do cadastro de pessoal da FAB (`core.user_military_data`) pelo SARAM.
 *
 * A tabela é o espelho nominal de ~68 mil militares, compartilhado por todo o ERP.
 * Aqui ela é lida SÓ por `nrOrdem` conhecido — nunca varrida — e só duas colunas
 * saem: `sgPosto` e `nmGuerra`. `nrCpf` e `nmPessoa` ficam onde estão; o que a tela
 * de acessos precisa é reconhecer a pessoa, não ter a ficha dela (LGPD, minimização
 * — a mesma lição de `apps/api` servir dado nominal sem autenticação).
 *
 * Nunca importe no cliente: usa o client service-role.
 */

import { getCoreClient } from "#/lib/supabase.server"

export type MilitaryIdentity = {
	/** Sigla do posto/graduação (`sgPosto`). */
	posto: string | null
	/** Nome de guerra (`nmGuerra`). */
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

	const { data, error } = await getCoreClient().from("user_military_data").select("nrOrdem, sgPosto, nmGuerra").in("nrOrdem", wanted)
	if (error) throw new Error(error.message)

	return new Map(
		((data ?? []) as Array<{ nrOrdem: string; sgPosto: string | null; nmGuerra: string | null }>).map((row) => [
			row.nrOrdem,
			{ posto: row.sgPosto, nomeGuerra: row.nmGuerra },
		])
	)
}

/** Atalho de um SARAM só — a confirmação do diálogo de primeiro acesso. */
export async function fetchMilitaryIdentity(nrOrdem: string): Promise<MilitaryIdentity | null> {
	return (await fetchMilitaryIdentities([nrOrdem])).get(nrOrdem) ?? null
}
