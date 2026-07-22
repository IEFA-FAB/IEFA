/**
 * @module military.fn
 * Perfil militar do usuário logado (login é opcional — não bloqueia features).
 *
 * Mapeamento auth -> dados militares:
 *   auth.users.id  ==  sisub.user_data.id  ->  user_data.nrOrdem
 *   user_data.nrOrdem  ==  sisub.user_military_data.nrOrdem  ->  sgPosto / nmPessoa / nmGuerra
 *
 * quadro / especialidade: não há fonte. Nenhuma tabela mapeia nrOrdem -> quadro/especialidade
 * (sisub.user_military_data não tem essas colunas; rumaer.piece_item as usa só como atributo de
 * catálogo de uniformes, sem vínculo com o militar). Permanecem null até existir essa origem
 * (ex.: nova coluna em user_military_data ou tabela de perfil militar).
 */

import { createServerFn } from "@tanstack/react-start"
import { getRequestUser } from "@/lib/auth.server"
import { getCoreReadClient } from "@/lib/supabase.server"

export type MilitaryProfile = {
	sgPosto: string | null
	nmPessoa: string | null
	nmGuerra: string | null
	quadro: string | null
	especialidade: string | null
}

// Login é opcional no rumaer: sem sessão isto devolve `null` em vez de 401 — o perfil
// militar é um enfeite do cabeçalho, não um gate. A identidade vem SEMPRE da sessão
// (nenhum nrOrdem entra por payload), então não há alvo a escolher.
// nosemgrep: server-fn-missing-auth-guard
export const getMyMilitaryProfileFn = createServerFn({ method: "GET" }).handler(async (): Promise<MilitaryProfile | null> => {
	const user = await getRequestUser()
	if (!user) return null

	const core = getCoreReadClient()

	// auth uid -> user_data.nrOrdem
	const { data: userData } = await core.from("user_data").select("nrOrdem").eq("id", user.id).maybeSingle()
	const nrOrdem = userData?.nrOrdem
	if (!nrOrdem) return null

	// nrOrdem -> user_military_data
	const { data: mil } = await core.from("user_military_data").select("sgPosto, nmPessoa, nmGuerra").eq("nrOrdem", nrOrdem).maybeSingle()
	if (!mil) return null

	return {
		sgPosto: mil.sgPosto ?? null,
		nmPessoa: mil.nmPessoa ?? null,
		nmGuerra: mil.nmGuerra ?? null,
		quadro: null, // sem origem no banco (ver doc do módulo)
		especialidade: null, // sem origem no banco (ver doc do módulo)
	}
})
