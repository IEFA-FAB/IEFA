/**
 * @module military.fn
 * Perfil militar do usuário logado (login é opcional — não bloqueia features).
 *
 * Mapeamento auth -> dados militares:
 *   auth.users.id  ==  sisub.user_data.id  ->  user_data.nrOrdem
 *   user_data.nrOrdem  ==  sisub.user_military_data.nrOrdem  ->  sgPosto / nmPessoa / nmGuerra
 *
 * quadro / especialidade ainda não existem na origem — retornados como null (TODO).
 */

import { createServerFn } from "@tanstack/react-start"
import { getRumaerAuthClient, getSisubReadClient } from "@/lib/supabase.server"

export type MilitaryProfile = {
	sgPosto: string | null
	nmPessoa: string | null
	nmGuerra: string | null
	quadro: string | null
	especialidade: string | null
}

export const getMyMilitaryProfileFn = createServerFn({ method: "GET" }).handler(async (): Promise<MilitaryProfile | null> => {
	const auth = getRumaerAuthClient()
	const {
		data: { user },
	} = await auth.auth.getUser()
	if (!user) return null

	const sisub = getSisubReadClient()

	// auth uid -> user_data.nrOrdem
	const { data: userData } = await sisub.from("user_data").select("nrOrdem").eq("id", user.id).maybeSingle()
	const nrOrdem = userData?.nrOrdem
	if (!nrOrdem) return null

	// nrOrdem -> user_military_data
	const { data: mil } = await sisub.from("user_military_data").select("sgPosto, nmPessoa, nmGuerra").eq("nrOrdem", nrOrdem).maybeSingle()
	if (!mil) return null

	return {
		sgPosto: mil.sgPosto ?? null,
		nmPessoa: mil.nmPessoa ?? null,
		nmGuerra: mil.nmGuerra ?? null,
		quadro: null, // TODO: origem ainda não disponível
		especialidade: null, // TODO: origem ainda não disponível
	}
})
