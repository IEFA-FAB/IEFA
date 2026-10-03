/**
 * @module military.fn
 * Perfil militar do usuário logado (login é opcional — não bloqueia features).
 *
 * Mapeamento auth -> dados militares:
 *   auth.users.id  ->  core.visible_saram(id)  (SARAM VERIFICADO, ou legacy ainda não revisado)
 *   saram  ==  core.military_identity.saram  ->  posto / nome_guerra
 *
 * Desde 20261003100000 (change `saram-verified-link`) a coluna `user_data.saram` não basta: um
 * SARAM em pedido, gravado fora do fluxo verificado ou de conta institucional não mostra o
 * cadastro de ninguém. A regra é a mesma do sisub e do sucont, na função do banco.
 *
 * A view `core.military_identity` não tem CPF nem nome completo (change
 * `lgpd-military-roster-key`); o cabeçalho só usa posto e nome de guerra.
 *
 * quadro / especialidade: não há fonte. Nenhuma tabela mapeia o SARAM -> quadro/especialidade
 * (o espelho `core.user_military_data` não tem essas colunas; rumaer.piece_item as usa só como
 * atributo de catálogo de uniformes, sem vínculo com o militar). Permanecem null até existir essa
 * origem (ex.: nova coluna no espelho ou tabela de perfil militar).
 */

import { createServerFn } from "@tanstack/react-start"
import { getRequestUser } from "@/lib/auth.server"
import { getCoreReadClient } from "@/lib/supabase.server"

export type MilitaryProfile = {
	sgPosto: string | null
	nmGuerra: string | null
	quadro: string | null
	especialidade: string | null
}

/**
 * `core.visible_saram` nasce em 20261003100000; o client tipado só a conhece depois do `db:types`
 * que segue o apply. Assinatura declarada aqui, e só ela — a chamada continua sendo método do
 * client (o `rpc` solto perderia o `this`).
 */
type VisibleSaramClient = {
	rpc(fn: "visible_saram", args: { p_user: string }): PromiseLike<{ data: string | null; error: { message: string } | null }>
}

// Login é opcional no rumaer: sem sessão isto devolve `null` em vez de 401 — o perfil
// militar é um enfeite do cabeçalho, não um gate. A identidade vem SEMPRE da sessão
// (nenhum saram entra por payload), então não há alvo a escolher.
// nosemgrep: server-fn-missing-auth-guard
export const getMyMilitaryProfileFn = createServerFn({ method: "GET" }).handler(async (): Promise<MilitaryProfile | null> => {
	const user = await getRequestUser()
	if (!user) return null

	const core = getCoreReadClient()

	// auth uid -> SARAM verificado (`core.visible_saram`)
	const { data: saram } = await (core as unknown as VisibleSaramClient).rpc("visible_saram", { p_user: user.id })
	if (!saram) return null

	// SARAM -> core.military_identity (o cadastro mais recente, como no sisub)
	const { data: mil } = await core
		.from("military_identity")
		.select("posto, nome_guerra")
		.eq("saram", saram)
		.order("data_atualizacao", { ascending: false, nullsFirst: false })
		.limit(1)
		.maybeSingle()
	if (!mil) return null

	return {
		sgPosto: mil.posto ?? null,
		nmGuerra: mil.nome_guerra ?? null,
		quadro: null, // sem origem no banco (ver doc do módulo)
		especialidade: null, // sem origem no banco (ver doc do módulo)
	}
})
