/**
 * @module permissions.fn
 * Autogestão de acesso do SUCONT. Cada app do ERP gerencia apenas os grants dos
 * PRÓPRIOS módulos, mesmo compartilhando a tabela access_control.user_permissions.
 * Aqui TODAS as operações são restritas aos quatro do sucont — `sucont-1`,
 * `sucont-3`, `sucont-4` e `sucont-admin` —, e o módulo pedido pelo cliente é
 * validado contra essa lista: sem isso, um administrador do SUCONT concederia
 * `global` do sisub pela mesma chamada. A lógica compartilhada (filtro por módulo,
 * busca por e-mail, upsert de grant unscoped) vem de @iefa/pbac.
 *
 * Gate: administração exige `sucont-admin` nível 3 (requireSucontAdmin).
 * Grants do sucont são sempre globais/unscoped. Nas divisões o nível é 1 (acesso à
 * divisão) ou 2 (editor); no `sucont-admin` é 3 — é o nível que o módulo `sucont`
 * único exigia antes do split, e o backfill o preservou.
 */

import { type AppModule, grantUnscopedModulePermission, resolveModulePermissions, searchUsersByEmail, type UserPermission } from "@iefa/pbac"
import type { SupabaseClient } from "@supabase/supabase-js"
import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { requireSucontAdmin, requireUserId } from "#/lib/auth.server"
import { describePerson } from "#/lib/identity"
import { fetchMilitaryIdentities } from "#/lib/military.server"
import { SUCONT_ADMIN_MODULE, SUCONT_PERMISSION_MODULES } from "#/lib/permission-modules"
import { getAccessControlClient, getCoreClient } from "#/lib/supabase.server"

const MODULES = SUCONT_PERMISSION_MODULES

/**
 * Módulo + nível que o cliente pode pedir.
 *
 * O par é validado JUNTO, e não em dois campos independentes, porque os níveis não
 * são os mesmos: divisão vai a 1 (acesso) ou 2 (editor), e `sucont-admin` só existe
 * em 3. Aceitar `sucont-3` nível 3 gravaria um grant que nenhum guard lê — acesso
 * que a tela mostra como concedido e que não abre porta nenhuma.
 *
 * O `enum` do módulo é a trava que impede esta tela de conceder `global`, `kitchen`
 * ou qualquer outro módulo do ERP na tabela compartilhada.
 */
const GrantTargetSchema = z.discriminatedUnion("module", [
	z.object({ module: z.enum(["sucont-1", "sucont-3", "sucont-4"]), level: z.union([z.literal(1), z.literal(2)]) }),
	z.object({ module: z.literal(SUCONT_ADMIN_MODULE), level: z.literal(3) }),
])

/**
 * O par (módulo, nível) concedível. A tela de acessos tipa as opções do seletor com
 * ele: assim uma combinação que o servidor recusaria não chega a existir no menu.
 */
export type SucontGrantTarget = z.infer<typeof GrantTargetSchema>

// biome-ignore lint/suspicious/noExplicitAny: aceita qualquer schema de SupabaseClient, como no @iefa/pbac
type AnySupabaseClient = SupabaseClient<any, any>

/**
 * Permissões efetivas do PRÓPRIO usuário (deny removido, filtradas pelos quatro
 * módulos do sucont — grants de outros apps nunca vão para o browser). O `userId`
 * vem da sessão (`requireUserId`), NUNCA do cliente — senão qualquer um leria as
 * permissões de qualquer userId (IDOR). Usado pelos guards de rota e pelo hook.
 *
 * Os quatro saem num fetch só: o guard da raiz precisa saber se há ALGUM, e o de
 * cada rota, qual divisão — uma query por módulo pagaria a resolução inteira quatro
 * vezes por carga de página.
 */
export const fetchMySucontPermissionsFn = createServerFn({ method: "GET" }).handler(async (): Promise<UserPermission[]> => {
	const userId = await requireUserId()
	return resolveModulePermissions(userId, getAccessControlClient(), MODULES)
})

export type SucontUserSearchResult = { id: string; email: string; nrOrdem: string | null; posto: string | null; nomeGuerra: string | null }

/**
 * Busca usuários por e-mail (para conceder acesso). Só admin do sucont.
 *
 * O resultado sai identificado como a lista de acessos: dois endereços parecidos
 * (`lsantosnels@` e `larissalsb@`) são fáceis de trocar, e conceder nível 3 à pessoa
 * errada é o erro que esta tela existe para não cometer.
 */
export const searchUsersByEmailFn = createServerFn({ method: "GET" })
	.validator(z.object({ email: z.string().min(1) }))
	.handler(async ({ data }): Promise<SucontUserSearchResult[]> => {
		await requireSucontAdmin()
		const rows = await searchUsersByEmail(getCoreClient(), data.email)
		const military = await fetchMilitaryIdentities(rows.map((r) => r.nrOrdem ?? ""))
		return rows.map(({ id, email, nrOrdem }) => ({
			id,
			email,
			nrOrdem,
			posto: (nrOrdem && military.get(nrOrdem)?.posto) || null,
			nomeGuerra: (nrOrdem && military.get(nrOrdem)?.nomeGuerra) || null,
		}))
	})

/**
 * Concede/atualiza um grant de módulo do sucont (global/unscoped) a um usuário. Só
 * admin. O upsert seguro sob concorrência (update-first → insert → retry-em-23505,
 * apoiado no índice parcial único do DB) vive em `grantUnscopedModulePermission`
 * (@iefa/pbac). Não colide com grants de outros apps na mesma tabela.
 *
 * Uma chamada = UM módulo. Conceder as três divisões são três chamadas, e é assim
 * que se quer: a tela pede um módulo por vez, e cada linha é revogável sozinha.
 */
export const grantSucontPermissionFn = createServerFn({ method: "POST" })
	.validator(z.object({ userId: z.string().min(1) }).and(GrantTargetSchema))
	.handler(async ({ data }): Promise<{ ok: true }> => {
		const ctx = await requireSucontAdmin()
		assertNotSelf(ctx.userId, data.userId)
		return grantUnscopedModulePermission(getAccessControlClient(), { module: data.module, userId: data.userId, level: data.level })
	})

/**
 * Revoga um grant do sucont. Só admin, e nunca o próprio.
 *
 * `module` é obrigatório e restrito à lista do app: apagar "o acesso ao sucont" sem
 * dizer qual módulo retiraria as três divisões e a administração de uma vez — e
 * numa tabela compartilhada, um `delete` sem `module` alcançaria o ERP inteiro.
 */
export const revokeSucontPermissionFn = createServerFn({ method: "POST" })
	.validator(z.object({ userId: z.string().min(1), module: z.enum(MODULES as [AppModule, ...AppModule[]]) }))
	.handler(async ({ data }): Promise<{ ok: true }> => {
		const ctx = await requireSucontAdmin()
		assertNotSelf(ctx.userId, data.userId)
		const { error } = await getAccessControlClient().from("user_permissions").delete().eq("user_id", data.userId).eq("module", data.module)
		if (error) throw new Error(error.message)
		return { ok: true }
	})

/**
 * Recusa a alteração do próprio acesso.
 *
 * Rebaixar-se para nível 1 ou revogar o próprio grant tranca o administrador para
 * fora desta tela — e, se ele for o último nível 3, tranca TODO MUNDO para fora
 * dela, sem caminho de volta pela interface: o conserto passa a ser SQL no banco
 * de produção. O gate mora no servidor, e não só no botão desabilitado, porque a
 * chamada é alcançável direto pelo endpoint.
 *
 * Não é uma trava de "último admin" — contar administradores teria corrida entre a
 * contagem e o delete. Ninguém mexe no próprio acesso; outro administrador mexe.
 */
function assertNotSelf(actorId: string, targetId: string): void {
	if (actorId === targetId) throw new Error("Você não pode alterar o próprio acesso. Peça a outro administrador do SUCONT.")
}

export type SucontGrant = {
	userId: string
	/** Módulo do sucont que o grant concede — a divisão, ou a administração de acessos. */
	module: AppModule
	/** E-mail institucional. Vazio só quando a conta não tem e-mail no GoTrue. */
	email: string
	/** SARAM vinculado à conta, e a identificação militar que ele resolve. */
	nrOrdem: string | null
	posto: string | null
	nomeGuerra: string | null
	level: number
	/** ISO 8601, ou `null` para grant sem prazo. Vencido é AUSÊNCIA de acesso, não deny. */
	expiresAt: string | null
	/**
	 * De onde o acesso vem. `policy` é acesso emprestado por uma política anexada ao
	 * usuário, e NÃO é revogável por esta tela — apagar a linha de `user_permissions`
	 * não desfaz um anexo de política, e a chamada devolveria sucesso com o acesso
	 * intacto.
	 */
	source: "inline" | "policy"
	/** Nome da política que empresta o acesso. Só em `source: "policy"`. */
	policyName?: string
}

/**
 * Todos os grants dos módulos do sucont com o e-mail de quem os tem — a lista de
 * conferência da tela de permissões. Só admin.
 *
 * Uma linha por (pessoa, módulo): quem tem SUCONT-3 e SUCONT-4 aparece duas vezes,
 * porque são dois acessos e cada um se revoga sozinho.
 *
 * As DUAS origens do modelo, como `resolveUserPermissions` faz: o grant inline em
 * `user_permissions` e os statements de política anexada ao usuário. Ler só a
 * primeira era o defeito: quem recebeu `sucont` por política simplesmente não
 * aparecia aqui, e o "Revogar" respondia sucesso enquanto o acesso continuava de pé.
 *
 * Devolve inclusive o grant VENCIDO: para a resolução ele não existe (a tela marca
 * como "expirado"), mas omiti-lo faria a linha sumir sem que ninguém a tivesse
 * revogado, e o administrador procuraria um acesso que continua gravado.
 *
 * Consultas planas em vez de embed: `user_permissions` e `user_data` moram em
 * schemas diferentes (`access_control` e `core`), cada um com o seu client, e o
 * PostgREST não atravessa schema no `select` aninhado.
 *
 * Cada linha sai IDENTIFICADA — nunca um UUID cru. O `core.user_data` é o cadastro
 * do ERP e a linha só nasce no login, então quem recebeu grant e ainda não entrou
 * simplesmente não estava lá: a tela mostrava três UUIDs e um e-mail, e o
 * administrador não tinha como saber de quem eram os acessos que ele administra.
 * Duas emendas, nesta ordem:
 *   - falta de linha em `core.user_data` cai no GoTrue (`auth.admin.getUserById`),
 *     que é onde a conta existe desde o convite;
 *   - havendo SARAM vinculado, `core.user_military_data` responde posto e nome de
 *     guerra, que é como a pessoa é conhecida na OM.
 */
export const listSucontGrantsFn = createServerFn({ method: "GET" }).handler(async (): Promise<SucontGrant[]> => {
	await requireSucontAdmin()
	const accessControl = getAccessControlClient()

	const [inline, byPolicy] = await Promise.all([fetchInlineGrants(accessControl), fetchPolicyGrants(accessControl)])
	const all = [...inline, ...byPolicy]
	if (all.length === 0) return []

	const userIds = [...new Set(all.map((g) => g.userId))]
	const core = getCoreClient()

	const { data: users, error: usersError } = await core.from("user_data").select("id, email, nrOrdem").in("id", userIds)
	if (usersError) throw new Error(usersError.message)

	const rowById = new Map(
		((users ?? []) as Array<{ id: string; email: string | null; nrOrdem: string | null }>).map((u) => [u.id, { email: u.email ?? "", nrOrdem: u.nrOrdem }])
	)

	const [emailFallback, military] = await Promise.all([
		fetchEmailsFromAuth(
			core,
			userIds.filter((id) => !rowById.get(id)?.email)
		),
		fetchMilitaryIdentities(userIds.map((id) => rowById.get(id)?.nrOrdem ?? "")),
	])

	const identified = all.map((g): SucontGrant => {
		const row = rowById.get(g.userId)
		const nrOrdem = row?.nrOrdem?.trim() || null
		const person = nrOrdem ? military.get(nrOrdem) : undefined
		return {
			...g,
			email: row?.email || emailFallback.get(g.userId) || "",
			nrOrdem,
			posto: person?.posto ?? null,
			nomeGuerra: person?.nomeGuerra ?? null,
		}
	})

	// Pessoa primeiro, e agora ela é o agrupamento que a tela mostra: com quatro
	// módulos, ordenar por nível espalharia os grants de uma mesma pessoa pela lista
	// inteira, e conferir "o que fulano tem" viraria uma varredura. Dentro da pessoa,
	// o nível decide (administração no topo, que é o que se confere) e o módulo
	// desempata, para a ordem não oscilar entre dois grants do mesmo nível.
	return identified.sort(
		(a, b) => describePerson(a).primary.localeCompare(describePerson(b).primary, "pt-BR") || b.level - a.level || a.module.localeCompare(b.module)
	)
})

/**
 * E-mails lidos direto do GoTrue, para os `userId` sem e-mail no cadastro do ERP.
 *
 * `auth.users` não é alcançável pelo PostgREST — o schema não é exposto —, então a
 * leitura passa pela API de administração, que a chave service-role destrava. É
 * LEITURA: gravar a linha de `core.user_data` de outra pessoa a partir daqui seria
 * escrever cadastro alheio, e é justamente o que `getCoreClient` proíbe.
 *
 * Uma chamada por usuário faltante, e só faltam os que nunca entraram — a
 * alternativa (`listUsers`, paginada sobre a base inteira) custaria mais para
 * responder a mesma pergunta. Conta apagada no GoTrue volta vazia e o rótulo cai
 * para o `userId`, que é o que sobra para identificá-la.
 */
async function fetchEmailsFromAuth(core: AnySupabaseClient, userIds: readonly string[]): Promise<Map<string, string>> {
	if (userIds.length === 0) return new Map()

	const resolved = await Promise.all(
		userIds.map(async (id) => {
			const { data, error } = await core.auth.admin.getUserById(id)
			return [id, error ? "" : (data.user?.email ?? "")] as const
		})
	)
	return new Map(resolved.filter(([, email]) => email !== ""))
}

type PartialGrant = Omit<SucontGrant, "email" | "nrOrdem" | "posto" | "nomeGuerra">

/** Grants gravados direto na linha do usuário, nos quatro módulos do sucont. */
async function fetchInlineGrants(accessControl: AnySupabaseClient): Promise<PartialGrant[]> {
	const { data, error } = await accessControl.from("user_permissions").select("module, user_id, level, expires_at").in("module", MODULES)
	if (error) throw new Error(error.message)
	return ((data ?? []) as Array<{ module: AppModule; user_id: string; level: number; expires_at: string | null }>).map((row) => ({
		userId: row.user_id,
		module: row.module,
		level: row.level,
		expiresAt: row.expires_at,
		source: "inline" as const,
	}))
}

/**
 * Acesso emprestado por política anexada — o caminho inverso do que
 * `resolveUserPermissions` percorre: sai dos statements de `sucont`, chega nos
 * usuários.
 *
 * Banco sem o modelo de políticas responde "nenhuma política", não erro: é a mesma
 * degradação tolerada em `@iefa/pbac`, e aqui ela só encolhe uma lista de
 * conferência — nunca concede acesso.
 */
async function fetchPolicyGrants(accessControl: AnySupabaseClient): Promise<PartialGrant[]> {
	const { data: statements, error: statementError } = await accessControl.from("policy_statement").select("policy_id, module, level").in("module", MODULES)
	if (statementError) {
		if (isMissingTable(statementError)) return []
		throw new Error(statementError.message)
	}

	// Chaveado por política E MÓDULO: uma política que empresta `sucont-3` e
	// `sucont-4` são dois acessos distintos, e colapsá-los numa linha só faria a
	// tela mostrar um deles e esconder o outro.
	const levelByPolicyModule = new Map<string, { policyId: string; module: AppModule; level: number }>()
	for (const row of (statements ?? []) as Array<{ policy_id: string; module: AppModule; level: number }>) {
		// Uma política pode ter mais de um statement do MESMO módulo (níveis/escopos
		// diferentes); vale o maior nível, que é a semântica da resolução.
		const key = `${row.policy_id}:${row.module}`
		const current = levelByPolicyModule.get(key)
		if (!current || row.level > current.level) levelByPolicyModule.set(key, { policyId: row.policy_id, module: row.module, level: row.level })
	}
	if (levelByPolicyModule.size === 0) return []

	const ids = [...new Set([...levelByPolicyModule.values()].map((v) => v.policyId))]
	const [{ data: policies, error: policyError }, { data: attachments, error: attachmentError }] = await Promise.all([
		accessControl.from("policy").select("id, name").in("id", ids).is("deleted_at", null),
		accessControl.from("user_policy_attachment").select("user_id, policy_id, expires_at").in("policy_id", ids),
	])
	if (policyError) throw new Error(policyError.message)
	if (attachmentError) throw new Error(attachmentError.message)

	// Política com soft delete não empresta nada — mesma regra da resolução.
	const nameById = new Map((policies ?? []).map((p: { id: string; name: string }) => [p.id, p.name]))

	// Um anexo por política vira UMA linha por módulo que ela empresta.
	return ((attachments ?? []) as Array<{ user_id: string; policy_id: string; expires_at: string | null }>)
		.filter((row) => nameById.has(row.policy_id))
		.flatMap((row) =>
			[...levelByPolicyModule.values()]
				.filter((statement) => statement.policyId === row.policy_id)
				.map((statement) => ({
					userId: row.user_id,
					module: statement.module,
					level: statement.level,
					expiresAt: row.expires_at,
					source: "policy" as const,
					policyName: nameById.get(row.policy_id),
				}))
		)
}

/** `PGRST205`/`42P01`: o banco não tem o modelo de políticas. Ver `@iefa/pbac`. */
function isMissingTable(error: { code?: string }): boolean {
	return error.code === "PGRST205" || error.code === "42P01"
}
