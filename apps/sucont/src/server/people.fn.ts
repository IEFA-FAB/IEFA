/**
 * @module people.fn
 * Cadastro de pessoas da seção — `core.person` visto pelo sucont.
 *
 * Existe porque o responsável do cronograma e o operador de UG eram TEXTO LIVRE, e
 * texto livre não identifica ninguém: no efetivo da FAB, "3S VANESSA" casa com
 * quatorze pessoas e "3S TALITA" com cinco. Quem resolve a ambiguidade é um humano
 * escolhendo o SARAM nesta tela — nunca um casamento automático de nome.
 *
 * A pessoa aqui pode não ter conta. Três dos operadores de UG nunca logaram, e
 * atribuir tarefa a eles é legítimo: o que muda é que o sino não tem para onde
 * mandar a notificação (ver `sucont.notify_person`, que é silenciosa nesse caso).
 *
 * Gate: leitura com nível 1 em qualquer divisão (a tela do cronograma precisa dos
 * rótulos); escrita do CADASTRO só com `sucont-admin` nível 3 — vincular SARAM é
 * dizer quem é a pessoa, não distribuir trabalho.
 */

import type { PersonIdentity } from "@iefa/database/core"
import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { requireSucontAdmin, requireSucontApp } from "#/lib/auth.server"
import { getCoreClient, getSucontServerClient } from "#/lib/supabase.server"

/**
 * Teto da busca no efetivo. O cadastro tem 68.316 militares; a tela precisa de um
 * punhado para o admin reconhecer o colega, não de uma listagem navegável.
 */
const ROSTER_SEARCH_LIMIT = 20

/** Mínimo de caracteres da busca. Uma letra devolveria milhares de pessoas. */
const ROSTER_SEARCH_MIN = 3

export type SectionPerson = {
	id: string
	/** Melhor rótulo disponível: militar → e-mail → nome de reserva. */
	label: string
	/** O nome que a seção digitou. Fica visível quando difere do rótulo resolvido. */
	displayName: string
	nrOrdem: string | null
	email: string | null
	posto: string | null
	nomeGuerra: string | null
	hasAccount: boolean
	active: boolean
	/** Quantas tarefas do cronograma respondem a esta pessoa hoje. */
	taskCount: number
	/** Quantas Unidades Gestoras ela opera. */
	ugCount: number
}

/**
 * Militar do efetivo, para o vínculo de SARAM.
 *
 * Só quatro campos saem, e nenhum deles é `nrCpf` ou `nmPessoa`: o admin precisa
 * RECONHECER a pessoa, não ter a ficha dela. `sgOrg` entra porque sem a
 * organização não há como escolher entre as quatorze VANESSAs — é ele que faz a
 * lista ser decidível em vez de um sorteio.
 */
export type RosterMatch = {
	nrOrdem: string
	posto: string | null
	nomeGuerra: string | null
	organizacao: string | null
}

/**
 * Exige que a pessoa esteja NA SEÇÃO antes de deixar o admin do sucont editá-la.
 *
 * `core.person` é do ERP inteiro e `sucont.section_member` é a fronteira deste
 * app — a leitura já respeita isso, e a escrita tem que respeitar também. Sem a
 * checagem, um administrador do sucont renomearia ou revincularia o SARAM de uma
 * pessoa cadastrada por outro app, pelo id. É a mesma lição do `module` obrigatório
 * na revogação de grant: numa tabela compartilhada, escrita sem escopo alcança o
 * ERP todo.
 */
async function requireSectionMember(personId: string): Promise<void> {
	const { data, error } = await getSucontServerClient().from("section_member").select("person_id").eq("person_id", personId).maybeSingle()
	if (error) throw new Error(error.message)
	if (!data) throw new Error("Esta pessoa não está na seção.")
}

/** Pessoas da seção, com identidade resolvida e a carga de cada uma. */
export const listSectionPeopleFn = createServerFn({ method: "GET" }).handler(async (): Promise<SectionPerson[]> => {
	// `requireSucontApp`, e não o gate de divisão: quem administra esta tela pode
	// não ter divisão nenhuma. Com o gate de divisão, `/admin/pessoas` abria num
	// erro permanente para a conta só-administradora — que é justamente quem o
	// split criou para operar esta tela.
	await requireSucontApp()
	const sucont = getSucontServerClient()

	const { data: members, error: membersError } = await sucont.from("section_member").select("person_id")
	if (membersError) throw new Error(membersError.message)
	const ids = (members ?? []).map((m) => m.person_id)
	if (ids.length === 0) return []

	const [identities, tasks, ugs] = await Promise.all([
		getCoreClient().from("person_identity").select("*").in("id", ids),
		sucont.from("checklist_item_assignee").select("person_id").in("person_id", ids),
		sucont.from("unidade_gestora").select("operator_person_id").in("operator_person_id", ids),
	])
	if (identities.error) throw new Error(identities.error.message)
	if (tasks.error) throw new Error(tasks.error.message)
	if (ugs.error) throw new Error(ugs.error.message)

	// Contagem em memória: são unidades e tarefas na casa das dezenas, e um
	// `count` por pessoa seriam N consultas para responder o que uma já trouxe.
	const taskCount = new Map<string, number>()
	for (const row of tasks.data ?? []) taskCount.set(row.person_id, (taskCount.get(row.person_id) ?? 0) + 1)
	const ugCount = new Map<string, number>()
	for (const row of ugs.data ?? []) {
		if (row.operator_person_id) ugCount.set(row.operator_person_id, (ugCount.get(row.operator_person_id) ?? 0) + 1)
	}

	return ((identities.data ?? []) as PersonIdentity[])
		.flatMap((p) =>
			p.id
				? [
						{
							id: p.id,
							label: p.label ?? p.display_name ?? p.id,
							displayName: p.display_name ?? "",
							nrOrdem: p.nr_ordem,
							email: p.email,
							posto: p.posto,
							nomeGuerra: p.nome_guerra,
							hasAccount: Boolean(p.user_id),
							active: p.active ?? true,
							taskCount: taskCount.get(p.id) ?? 0,
							ugCount: ugCount.get(p.id) ?? 0,
						},
					]
				: []
		)
		.sort((a, b) => a.label.localeCompare(b.label, "pt-BR"))
})

/**
 * Coloca uma pessoa na seção pelo nome, sem SARAM nem conta.
 *
 * É o caminho normal: primeiro a pessoa existe e recebe trabalho, depois alguém
 * vincula o SARAM. Exigir o SARAM na criação travaria o cadastro de quem o admin
 * não tem em mãos naquele momento.
 *
 * PROCURA antes de inserir, e a busca é pela chave normalizada (`name_key`), não
 * pelo texto: `core.person` é do ERP inteiro, então a pessoa pode já existir
 * porque saiu desta seção um dia ou porque outro app a cadastrou. Inserir
 * cegamente batia no índice único e devolvia "já existe" numa tela que não
 * oferecia saída nenhuma — a pessoa ficava inalcançável sem SQL.
 *
 * A chave é coluna GERADA (20260910234119) justamente para ser filtrável aqui: o
 * índice sobre a expressão não era, e duplicar o normalizador em TypeScript
 * garantiria divergência no primeiro nome acentuado.
 */
export const createSectionPersonFn = createServerFn({ method: "POST" })
	.validator(z.object({ displayName: z.string().trim().min(2) }))
	.handler(async ({ data }): Promise<{ id: string; reused: boolean }> => {
		await requireSucontAdmin()
		const core = getCoreClient()

		const { data: key, error: keyError } = await core.rpc("person_name_key", { p_name: data.displayName })
		if (keyError) throw new Error(keyError.message)

		const { data: existing, error: existingError } = await core
			.from("person")
			.select("id")
			.eq("name_key", key as unknown as string)
			.eq("active", true)
			.maybeSingle()
		if (existingError) throw new Error(existingError.message)

		let personId = existing?.id ?? null
		if (!personId) {
			const { data: person, error } = await core.from("person").insert({ display_name: data.displayName }).select("id").single()
			if (error) throw new Error(error.message)
			personId = person.id
		}

		// Recolocar quem já está na seção não é erro, é ausência de mudança.
		const { error: memberError } = await getSucontServerClient()
			.from("section_member")
			.upsert({ person_id: personId }, { onConflict: "person_id", ignoreDuplicates: true })
		if (memberError) throw new Error(memberError.message)
		return { id: personId, reused: Boolean(existing) }
	})

/**
 * Busca no efetivo da FAB por nome de guerra, para o vínculo de SARAM.
 *
 * `sucont-admin` nível 3 e mínimo de três caracteres: é leitura do cadastro
 * nominal de 68 mil militares, e a lição de `apps/api` servir dado nominal sem
 * autenticação vale aqui como teto, não como proibição — o admin precisa
 * identificar um colega.
 */
export const searchRosterFn = createServerFn({ method: "GET" })
	.validator(z.object({ nomeGuerra: z.string().trim().min(ROSTER_SEARCH_MIN) }))
	.handler(async ({ data }): Promise<RosterMatch[]> => {
		await requireSucontAdmin()
		const { data: rows, error } = await getCoreClient()
			.from("user_military_data")
			.select("nrOrdem, sgPosto, nmGuerra, sgOrg")
			.ilike("nmGuerra", `%${data.nomeGuerra}%`)
			.not("nrOrdem", "is", null)
			.order("nmGuerra", { ascending: true })
			.limit(ROSTER_SEARCH_LIMIT)
		if (error) throw new Error(error.message)

		return (rows ?? []).flatMap((row) => (row.nrOrdem ? [{ nrOrdem: row.nrOrdem, posto: row.sgPosto, nomeGuerra: row.nmGuerra, organizacao: row.sgOrg }] : []))
	})

/**
 * Vincula (ou desvincula) o SARAM de uma pessoa.
 *
 * A partir do vínculo o rótulo passa a vir do efetivo: "SGT KLEBSON" vira a
 * graduação de verdade — "SGT" nem é sigla do cadastro. `core.person.nr_ordem` é
 * UNIQUE, então o mesmo SARAM não pode ser reivindicado por duas pessoas.
 */
export const linkPersonRosterFn = createServerFn({ method: "POST" })
	.validator(z.object({ id: z.uuid(), nrOrdem: z.string().trim().min(1).nullable() }))
	.handler(async ({ data }): Promise<{ ok: true }> => {
		await requireSucontAdmin()
		await requireSectionMember(data.id)
		const { error } = await getCoreClient().from("person").update({ nr_ordem: data.nrOrdem }).eq("id", data.id)
		if (error) {
			if (error.code === "23505") throw new Error("Esse SARAM já está vinculado a outra pessoa do cadastro.")
			throw new Error(error.message)
		}
		return { ok: true }
	})

/**
 * Vincula a pessoa a uma conta do ERP, buscada pelo e-mail.
 *
 * É o que dá caixa de entrada a ela: `sucont.notify_person` só grava quando há
 * `user_id`. Sem vínculo, a pessoa continua recebendo tarefa — só não recebe
 * sino.
 */
export const linkPersonAccountFn = createServerFn({ method: "POST" })
	.validator(z.object({ id: z.uuid(), email: z.string().trim().min(1).nullable() }))
	.handler(async ({ data }): Promise<{ ok: true }> => {
		await requireSucontAdmin()
		await requireSectionMember(data.id)
		const core = getCoreClient()

		let userId: string | null = null
		if (data.email) {
			const { data: account, error: accountError } = await core.from("user_data").select("id").eq("email", data.email).maybeSingle()
			if (accountError) throw new Error(accountError.message)
			// A linha de `core.user_data` só nasce no primeiro login. E-mail que
			// ainda não entrou no ERP não é erro de digitação necessariamente — a
			// mensagem precisa dizer as duas possibilidades.
			if (!account) throw new Error("Nenhuma conta com esse e-mail. A conta só passa a existir depois do primeiro login no ERP.")
			userId = account.id
		}

		const { error } = await core.from("person").update({ user_id: userId }).eq("id", data.id)
		if (error) {
			if (error.code === "23505") throw new Error("Essa conta já está vinculada a outra pessoa do cadastro.")
			throw new Error(error.message)
		}
		return { ok: true }
	})

/**
 * Renomeia a pessoa. Só muda o nome de RESERVA — havendo SARAM, o rótulo continua
 * vindo do efetivo.
 */
export const renamePersonFn = createServerFn({ method: "POST" })
	.validator(z.object({ id: z.uuid(), displayName: z.string().trim().min(2) }))
	.handler(async ({ data }): Promise<{ ok: true }> => {
		await requireSucontAdmin()
		await requireSectionMember(data.id)
		const { error } = await getCoreClient().from("person").update({ display_name: data.displayName }).eq("id", data.id)
		if (error) {
			if (error.code === "23505") throw new Error("Já existe uma pessoa ativa com esse nome no cadastro.")
			throw new Error(error.message)
		}
		return { ok: true }
	})

/**
 * Tira a pessoa da seção.
 *
 * Só a MEMBRESIA sai; `core.person` fica, e com ela as atribuições históricas —
 * quem era responsável em setembro segue tendo sido. A FK de
 * `checklist_item_assignee` é `on delete restrict` justamente para que apagar a
 * pessoa não seja um caminho acidental.
 *
 * As atribuições ativas saem junto: manter alguém que não está mais na seção
 * respondendo por tarefa do mês que vem seria mentira na tela, e o gatilho de
 * `assignee_resolve` fecha as notificações abertas dela.
 */
export const removeSectionPersonFn = createServerFn({ method: "POST" })
	.validator(z.object({ id: z.uuid() }))
	.handler(async ({ data }): Promise<{ ok: true }> => {
		await requireSucontAdmin()
		await requireSectionMember(data.id)
		const sucont = getSucontServerClient()

		const { error: assigneeError } = await sucont.from("checklist_item_assignee").delete().eq("person_id", data.id)
		if (assigneeError) throw new Error(assigneeError.message)

		const { error: ugError } = await sucont.from("unidade_gestora").update({ operator_person_id: null }).eq("operator_person_id", data.id)
		if (ugError) throw new Error(ugError.message)

		const { error } = await sucont.from("section_member").delete().eq("person_id", data.id)
		if (error) throw new Error(error.message)
		return { ok: true }
	})
