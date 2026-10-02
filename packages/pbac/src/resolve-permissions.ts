import type { SupabaseClient } from "@supabase/supabase-js"
import { resolveEffectivePermissions } from "./effective-permissions.ts"
import type { UserPermission } from "./types.ts"

// biome-ignore lint/suspicious/noExplicitAny: aceita qualquer schema de SupabaseClient
type AnySupabaseClient = SupabaseClient<any, any>

/** Colunas de uma `UserPermission`. As duas origens as nomeiam igual. */
const PERMISSION_COLUMNS = "module, level, mess_hall_id, kitchen_id, unit_id"

/**
 * Códigos de "esta tabela não existe neste banco":
 *   PGRST205 — o PostgREST não achou a tabela no cache de schema;
 *   42P01    — `undefined_table`, do próprio Postgres.
 *
 * Por padrão, estes códigos FALHAM FECHADO como qualquer outro erro: a resolução lança.
 * Descartar a origem de política descarta também os DENY que vêm dela — um usuário com
 * allow inline e um deny por política voltaria a ter o allow enquanto a falha durasse.
 * E `PGRST205` não significa só "tabela ausente": o PostgREST também o devolve com o
 * cache de schema velho, a janela logo depois de qualquer DDL no `access_control`, e
 * nesse caso "sem políticas" seria um fail-open silencioso num banco que TEM o modelo.
 *
 * Degradar para "sem políticas" só com `allowMissingPolicyModel: true`, opção que o
 * consumidor liga conscientemente por apontar para um banco sem o modelo de políticas.
 * Mesmo aí a degradação NÃO é silenciosa: ver `warnMissingPolicyModel`.
 */
const MISSING_TABLE_CODES = new Set(["PGRST205", "42P01"])

function isMissingTable(error: { code?: string | null }): boolean {
	return error.code != null && MISSING_TABLE_CODES.has(error.code)
}

/**
 * Só roda com `allowMissingPolicyModel: true`. Nenhum consumidor de hoje liga a opção:
 * todos apontam para o MESMO schema `access_control`, onde as tabelas de política existem.
 * Se este aviso aparecer, ou o consumidor que ligou a opção tem de fato um banco sem o
 * modelo, ou o cache de schema do PostgREST está velho — e no segundo caso permissão está
 * sendo resolvida a menos. Fica no log porque um fail-open sem rastro é indistinguível de
 * configuração.
 */
function warnMissingPolicyModel(error: { code?: string | null; message: string }): void {
	// biome-ignore lint/suspicious/noConsole: o pacote não tem logger próprio, e um fail-open sem rastro é indistinguível de configuração — o aviso É o mecanismo
	console.warn(`[pbac] modelo de políticas inacessível (${error.code}): ${error.message} — resolvendo só com os grants inline`)
}

/**
 * Filtro PostgREST "a linha ainda vale": sem prazo, ou com prazo no futuro.
 *
 * `now()` vai como VALOR do filtro, e quem o avalia é o Postgres — o parser de
 * data/hora aceita a string `now()` do mesmo jeito que aceita `now`, e ambas resolvem
 * para o `now()` da transação. Isso é deliberado: o relógio do processo Node/Bun não é
 * fonte da verdade para autorização, e mandar um ISO calculado em JS deixaria um
 * container com clock adiantado conceder acesso já vencido (ou revogar acesso vivo).
 *
 * Grant expirado some do conjunto — ele NÃO vira deny. Um `level 0` expirado deixa de
 * negar, porque a precedência de deny em `effective-permissions.ts` só enxerga as linhas
 * que chegam até ela.
 */
export const NOT_EXPIRED = "expires_at.is.null,expires_at.gt.now()"

/** Opções de `resolveUserPermissions`. */
export interface ResolveUserPermissionsOptions {
	/**
	 * Trata tabela de política ausente (`PGRST205`/`42P01` em `user_policy_attachment`)
	 * como "nenhuma política", com aviso no log, em vez de lançar. É fail-OPEN: os DENY
	 * vindos de política somem junto. Ligue só para um banco que comprovadamente não tem
	 * o modelo de políticas — ver `MISSING_TABLE_CODES`. Default: `false` (lança).
	 */
	allowMissingPolicyModel?: boolean
}

/** Grants inline — as linhas de `user_permissions` do próprio usuário. */
async function fetchInlinePermissions(userId: string, supabase: AnySupabaseClient): Promise<UserPermission[]> {
	const { data, error } = await supabase.from("user_permissions").select(PERMISSION_COLUMNS).eq("user_id", userId).or(NOT_EXPIRED)

	if (error) throw new Error(`Falha ao buscar permissões: ${error.message}`)

	return (data ?? []) as UserPermission[]
}

/**
 * Segunda origem: os statements das políticas anexadas ao usuário
 * (`user_policy_attachment` → `policy` → `policy_statement`), ignorando política
 * com soft delete — a mesma leitura que `listUserPolicyPermissions` faz em
 * `@iefa/sisub-domain` via Drizzle.
 *
 * Em queries PostgREST planas, sem embed, de propósito: o `@iefa/pbac` recebe um
 * `SupabaseClient` cru justamente para não depender do schema de ninguém, e um
 * embed dependeria da inferência de relacionamento do PostgREST (nome de FK,
 * cache de schema) para um caminho que hoje é só um `.in()`.
 *
 * Sem anexo, sai na primeira query e devolve `[]` — que é como rumaer e sucont
 * seguem resolvendo exatamente o mesmo conjunto de antes.
 */
async function fetchPolicyPermissions(userId: string, supabase: AnySupabaseClient, allowMissingPolicyModel: boolean): Promise<UserPermission[]> {
	// O prazo vale para as DUAS origens: anexo vencido não empresta os statements da
	// política, do mesmo jeito que grant inline vencido não concede.
	const { data: attachments, error: attachmentError } = await supabase.from("user_policy_attachment").select("policy_id").eq("user_id", userId).or(NOT_EXPIRED)

	if (attachmentError) {
		// Tabela ausente só vira "nenhuma política" quando o consumidor declarou um banco
		// sem o modelo. Sem a opção, lança como qualquer outro erro: resolver sem a origem
		// de política descartaria os DENY dela — ver `MISSING_TABLE_CODES`.
		if (allowMissingPolicyModel && isMissingTable(attachmentError)) {
			warnMissingPolicyModel(attachmentError)
			return []
		}
		throw new Error(`Falha ao buscar políticas do usuário: ${attachmentError.message}`)
	}

	const attachedIds = [
		...new Set(
			(attachments ?? [])
				.map((row: { policy_id?: string | null }) => row.policy_id)
				.filter((id: string | null | undefined): id is string => typeof id === "string")
		),
	]
	if (attachedIds.length === 0) return []

	// Daqui em diante a tolerância acaba: `policy` e `policy_statement` chegam na MESMA
	// migration que `user_policy_attachment`. Um banco com o anexo e sem elas está
	// quebrado, não sem políticas — e resolver isso como `[]` esconderia o estrago.
	const [{ data: livePolicies, error: policyError }, { data: statements, error: statementError }] = await Promise.all([
		supabase.from("policy").select("id").in("id", attachedIds).is("deleted_at", null),
		supabase.from("policy_statement").select(`policy_id, ${PERMISSION_COLUMNS}`).in("policy_id", attachedIds),
	])

	if (policyError) throw new Error(`Falha ao buscar políticas do usuário: ${policyError.message}`)
	if (statementError) throw new Error(`Falha ao buscar permissões de política: ${statementError.message}`)

	const liveIds = new Set((livePolicies ?? []).map((row: { id: string }) => row.id))

	return (statements ?? [])
		.filter((row: { policy_id: string }) => liveIds.has(row.policy_id))
		.map(
			(row: UserPermission & { policy_id: string }): UserPermission => ({
				module: row.module,
				level: row.level,
				mess_hall_id: row.mess_hall_id,
				kitchen_id: row.kitchen_id,
				unit_id: row.unit_id,
			})
		)
}

/**
 * Busca e resolve as permissões efetivas de um usuário diretamente no banco.
 * Sem dependência de TanStack — usável em qualquer runtime Bun/Node.
 *
 * Aceita qualquer cliente Supabase (qualquer schema/db) para máxima compatibilidade.
 * Une as DUAS origens do modelo — grants inline (`user_permissions`) e statements das
 * políticas anexadas — e aplica as mesmas regras do sisub, pela resolução compartilhada:
 *   1. Implicit Allow: injeta "diner" level 1 se nenhuma regra explícita existir.
 *   2. Precedência de deny: um level=0 de QUALQUER origem anula os allows que ele cobre,
 *      em vez de ser apenas descartado — ver `effective-permissions.ts`.
 *   3. Grant expirado é AUSENTE, nas DUAS origens: a linha nem chega à resolução — ver
 *      `NOT_EXPIRED`.
 *
 * É a mesma semântica de `listEffectiveUserPermissions` em `@iefa/sisub-domain`. Enquanto
 * esta função lia só a origem inline, quem recebia acesso por política gerenciada (o
 * "Conjunto Treino", por exemplo) existia para o app e não existia para o `sisub-mcp`.
 *
 * As duas leituras saem em paralelo: a de políticas não entra no caminho crítico dos apps
 * que não têm política nenhuma anexada.
 *
 * Falha FECHADO: erro em qualquer leitura lança, inclusive tabela de política ausente —
 * a não ser com `options.allowMissingPolicyModel` (ver `MISSING_TABLE_CODES`).
 *
 * @param userId   - UUID do usuário autenticado
 * @param supabase - Cliente Supabase com service role (bypass RLS)
 * @param options  - Ver `ResolveUserPermissionsOptions`
 */
export async function resolveUserPermissions(
	userId: string,
	supabase: AnySupabaseClient,
	options: ResolveUserPermissionsOptions = {}
): Promise<UserPermission[]> {
	const allowMissingPolicyModel = options.allowMissingPolicyModel === true
	const [inline, policy] = await Promise.all([fetchInlinePermissions(userId, supabase), fetchPolicyPermissions(userId, supabase, allowMissingPolicyModel)])

	// Resolução compartilhada com o sisub (comensal implícito + precedência de deny).
	// Sem política anexada — o caso de todo usuário de rumaer e sucont hoje — `policy` é
	// `[]` e o resultado é idêntico ao de antes, item a item e na mesma ordem. Os quatro
	// consumidores apontam para o MESMO schema `access_control`: quem GANHA anexo passa a
	// ser autorizado por ele em todos eles, que é justamente a semântica pretendida.
	return resolveEffectivePermissions(inline, policy)
}
