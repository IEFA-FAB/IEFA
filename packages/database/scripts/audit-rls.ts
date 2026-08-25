/**
 * Auditoria de RLS dos schemas expostos no PostgREST.
 *
 * Por que isto existe: os apps do monorepo falam com o Postgres por dois caminhos.
 * No servidor, com a service key (Drizzle/`getDb()`), RLS é IGNORADA de propósito — a
 * autorização mora nos guards PBAC. No cliente, com a publishable key (anon), RLS é a
 * ÚNICA barreira. Hoje 18 schemas estão em `pgrst.db_schemas`, ou seja, toda tabela
 * neles é alcançável por qualquer pessoa que tenha a URL do projeto e a chave anon
 * (que é pública por definição — ela vai no bundle).
 *
 * O que é verificado (mesma família de lints do Splinter/Security Advisor da Supabase):
 *   ERRO   rls_disabled          tabela em schema exposto sem RLS → CRUD anônimo
 *   ERRO   secdef_search_path    função SECURITY DEFINER sem search_path fixo → hijack
 *   ERRO   view_security_definer view sem security_invoker E com GRANT para anon/authenticated
 *   ERRO   secdef_client_execute função SECURITY DEFINER executável por anon/authenticated
 *   AVISO  view_secdef_no_grant  view sem security_invoker, mas sem GRANT de cliente hoje
 *   AVISO  secdef_execute_latent EXECUTE de cliente numa SECURITY DEFINER de schema sem USAGE
 *   AVISO  rls_no_policy         RLS ligada e nenhuma policy → deny-all (ok se for só service-role)
 *   AVISO  policy_grants_anon    policy que concede ao role `anon` (leitura pública deliberada?)
 *
 * Os dois lints de ERRO sobre SECURITY DEFINER nasceram da auditoria de 2026-08-25: view e
 * função definer eram o caminho REAL para furar a RLS (nenhuma tabela sem RLS estava
 * alcançável). `journal.published_articles` dava UPDATE/DELETE em `journal.articles` a
 * qualquer usuário logado, e `journal.get_article_details` entregava o peer review cego a
 * anônimo. Ver a migration 20260825155457.
 *
 * Uso:
 *   SISUB_DATABASE_URL=postgres://... bun run audit:rls
 *   ... --json    saída para máquina
 *
 * Sai com código 1 se houver qualquer ERRO. Read-only: só consulta o catálogo.
 */

import postgres from "postgres"

/**
 * Espelha `alter role authenticator set pgrst.db_schemas` da última migration. É lido
 * do banco quando o role permite; esta lista é o fallback e serve de documentação.
 */
const FALLBACK_EXPOSED_SCHEMAS = [
	"public",
	"sisub",
	"iefa",
	"journal",
	"forms",
	"rumaer",
	"core",
	"access_control",
	"kitchen",
	"procurement",
	"finance",
	"compras_gov_integration",
	"inventory",
	"siafi_integration",
	"gs1_integration",
	"nutrition_reference",
	"assignment_selection",
	"sucont",
	"alpha",
]

type Severity = "error" | "warn"

type Finding = {
	severity: Severity
	lint: string
	object: string
	detail: string
}

const url = process.env.SISUB_DATABASE_URL ?? process.env.SUPABASE_DB_URL
if (!url) {
	console.error("SISUB_DATABASE_URL (ou SUPABASE_DB_URL) não definida — necessária para a auditoria de RLS.")
	process.exit(2)
}

const asJson = process.argv.includes("--json")
// Transaction pooler (6543) não suporta prepared statements — mesmo motivo do db.server.ts.
const sql = postgres(url, { prepare: false })

/**
 * Lê os schemas expostos direto do setting do role `authenticator`. Se o role da
 * conexão não puder lê-lo, cai na lista fixa acima — melhor auditar demais do que
 * silenciosamente auditar nada.
 */
async function resolveExposedSchemas(): Promise<string[]> {
	try {
		const rows = await sql<{ setting: string | null }[]>`
			select regexp_replace(unnest(rolconfig), '^pgrst\\.db_schemas=', '') as setting
			from pg_roles
			where rolname = 'authenticator'
				and exists (select 1 from unnest(rolconfig) c where c like 'pgrst.db_schemas=%')
		`
		const raw = rows.find((r) => r.setting && !r.setting.includes("="))?.setting
		if (!raw) return FALLBACK_EXPOSED_SCHEMAS
		return raw
			.split(",")
			.map((s) => s.trim())
			.filter(Boolean)
			.filter((s) => s !== "graphql_public")
	} catch {
		return FALLBACK_EXPOSED_SCHEMAS
	}
}

async function auditTables(schemas: string[]): Promise<Finding[]> {
	// `anon_privs`/`auth_privs` são o que separa "RLS desligada e exposta de verdade"
	// de "RLS desligada mas inalcançável por falta de GRANT". Sem esse recorte a
	// auditoria vira ruído: os schemas criados pelas migrations do monorepo em geral
	// NÃO concedem nada aos roles do PostgREST, e só o service_role os alcança.
	const rows = await sql<{ schema: string; table: string; rls_enabled: boolean; policy_count: number; anon_privs: string[]; auth_privs: string[] }[]>`
		select
			n.nspname as schema,
			c.relname as table,
			c.relrowsecurity as rls_enabled,
			(select count(*)::int from pg_policy p where p.polrelid = c.oid) as policy_count,
			array(
				select priv from unnest(array['SELECT','INSERT','UPDATE','DELETE']) priv
				where has_table_privilege('anon', c.oid, priv)
			) as anon_privs,
			array(
				select priv from unnest(array['SELECT','INSERT','UPDATE','DELETE']) priv
				where has_table_privilege('authenticated', c.oid, priv)
			) as auth_privs
		from pg_class c
		join pg_namespace n on n.oid = c.relnamespace
		where c.relkind in ('r', 'p')
			and n.nspname = any(${schemas})
		order by n.nspname, c.relname
	`

	return rows.flatMap((r): Finding[] => {
		const object = `${r.schema}.${r.table}`
		const reachable = [...new Set([...r.anon_privs, ...r.auth_privs])]
		if (!r.rls_enabled) {
			if (reachable.length === 0) {
				return [
					{
						severity: "warn",
						lint: "rls_disabled_no_grant",
						object,
						detail:
							"RLS desligada, mas anon/authenticated não têm nenhum GRANT — inalcançável pela API hoje. Um GRANT futuro a expõe sem barreira: ligue RLS mesmo assim",
					},
				]
			}
			return [
				{
					severity: "error",
					lint: "rls_disabled",
					object,
					detail: `RLS desligada e alcançável pela API: anon=[${r.anon_privs.join(",") || "-"}] authenticated=[${r.auth_privs.join(",") || "-"}]`,
				},
			]
		}
		if (r.policy_count === 0) {
			return [
				{
					severity: "warn",
					lint: "rls_no_policy",
					object,
					detail: "RLS ligada sem nenhuma policy: nega tudo para anon/authenticated (esperado se a tabela for só service-role)",
				},
			]
		}
		return []
	})
}

async function auditAnonPolicies(schemas: string[]): Promise<Finding[]> {
	const rows = await sql<{ schema: string; table: string; policy: string; command: string; roles: string[] }[]>`
		select
			n.nspname as schema,
			c.relname as table,
			p.polname as policy,
			case p.polcmd when 'r' then 'SELECT' when 'a' then 'INSERT' when 'w' then 'UPDATE' when 'd' then 'DELETE' else 'ALL' end as command,
			coalesce(
				(select array_agg(r.rolname order by r.rolname) from pg_roles r where r.oid = any(p.polroles)),
				array['PUBLIC']
			) as roles
		from pg_policy p
		join pg_class c on c.oid = p.polrelid
		join pg_namespace n on n.oid = c.relnamespace
		where n.nspname = any(${schemas})
		order by n.nspname, c.relname, p.polname
	`

	return rows
		.filter((r) => r.roles.includes("anon") || r.roles.includes("PUBLIC"))
		.map((r) => ({
			severity: "warn" as const,
			lint: "policy_grants_anon",
			object: `${r.schema}.${r.table}`,
			detail: `policy "${r.policy}" (${r.command}) concede a ${r.roles.join(", ")} — confirme que o dado é mesmo público`,
		}))
}

async function auditSecurityDefiner(schemas: string[]): Promise<Finding[]> {
	const rows = await sql<{ schema: string; name: string }[]>`
		select n.nspname as schema, p.proname as name
		from pg_proc p
		join pg_namespace n on n.oid = p.pronamespace
		where p.prosecdef
			and n.nspname = any(${schemas})
			and not exists (
				select 1 from unnest(coalesce(p.proconfig, '{}'::text[])) cfg where cfg like 'search_path=%'
			)
		order by n.nspname, p.proname
	`

	return rows.map((r) => ({
		severity: "error" as const,
		lint: "secdef_search_path",
		object: `${r.schema}.${r.name}()`,
		detail: "SECURITY DEFINER sem search_path fixo — um schema no caminho de busca do chamador pode sequestrar as referências da função",
	}))
}

async function auditViews(schemas: string[]): Promise<Finding[]> {
	// O GRANT é o que separa "defeito latente" de "furo aberto": view definer só fura a
	// RLS de verdade quando anon/authenticated conseguem selecioná-la. Mesmo recorte de
	// `auditTables`.
	const rows = await sql<{ schema: string; name: string; anon_privs: string[]; auth_privs: string[] }[]>`
		select
			n.nspname as schema,
			c.relname as name,
			array(
				select priv from unnest(array['SELECT','INSERT','UPDATE','DELETE']) priv
				where has_table_privilege('anon', c.oid, priv)
			) as anon_privs,
			array(
				select priv from unnest(array['SELECT','INSERT','UPDATE','DELETE']) priv
				where has_table_privilege('authenticated', c.oid, priv)
			) as auth_privs
		from pg_class c
		join pg_namespace n on n.oid = c.relnamespace
		where c.relkind in ('v', 'm')
			and n.nspname = any(${schemas})
			and coalesce(array_to_string(c.reloptions, ','), '') not like '%security_invoker=%'
		order by n.nspname, c.relname
	`

	return rows.map((r): Finding => {
		const object = `${r.schema}.${r.name}`
		const reachable = [...new Set([...r.anon_privs, ...r.auth_privs])]
		if (reachable.length === 0) {
			return {
				severity: "warn",
				lint: "view_secdef_no_grant",
				object,
				detail: "view sem security_invoker=true, mas sem GRANT para anon/authenticated — inalcançável hoje. Um GRANT futuro a transforma em túnel pela RLS",
			}
		}
		return {
			severity: "error",
			lint: "view_security_definer",
			object,
			detail: `view sem security_invoker=true e alcançável pela API: anon=[${r.anon_privs.join(",") || "-"}] authenticated=[${r.auth_privs.join(",") || "-"}] — as consultas rodam com os direitos do dono e furam a RLS das tabelas base`,
		}
	})
}

/**
 * Função SECURITY DEFINER com EXECUTE para anon/authenticated é um endpoint
 * `/rest/v1/rpc/<nome>` que roda com os privilégios do dono — a RLS das tabelas que ela
 * toca não é avaliada. O EXECUTE quase nunca é explícito: o ACL default do Postgres já
 * concede a PUBLIC, e os roles do PostgREST herdam daí. Por isso a checagem é por
 * `has_function_privilege`, não por leitura de `proacl`.
 */
async function auditDefinerExecuteGrants(schemas: string[]): Promise<Finding[]> {
	const rows = await sql<{ schema: string; signature: string; anon: boolean; authenticated: boolean; schema_reachable: boolean }[]>`
		select
			n.nspname as schema,
			p.oid::regprocedure::text as signature,
			has_function_privilege('anon', p.oid, 'EXECUTE') as anon,
			has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated,
			(has_schema_privilege('anon', n.oid, 'USAGE') or has_schema_privilege('authenticated', n.oid, 'USAGE')) as schema_reachable
		from pg_proc p
		join pg_namespace n on n.oid = p.pronamespace
		where p.prosecdef
			and n.nspname = any(${schemas})
			and (has_function_privilege('anon', p.oid, 'EXECUTE') or has_function_privilege('authenticated', p.oid, 'EXECUTE'))
		order by n.nspname, p.proname
	`

	return rows.map((r): Finding => {
		const roles = [r.anon ? "anon" : null, r.authenticated ? "authenticated" : null].filter(Boolean).join(", ")
		if (!r.schema_reachable) {
			return {
				severity: "warn",
				lint: "secdef_execute_latent",
				object: r.signature,
				detail: `SECURITY DEFINER com EXECUTE para ${roles}, mas o schema não tem USAGE para esses roles — inalcançável hoje. Um \`grant usage\` futuro publica a função como RPC sem ninguém perceber`,
			}
		}
		return {
			severity: "error",
			lint: "secdef_client_execute",
			object: r.signature,
			detail: `SECURITY DEFINER executável por ${roles} via /rest/v1/rpc — roda com os privilégios do dono e ignora a RLS das tabelas que toca. Revogue de PUBLIC/anon/authenticated e conceda só a service_role`,
		}
	})
}

async function main() {
	const schemas = await resolveExposedSchemas()
	const findings = (
		await Promise.all([
			auditTables(schemas),
			auditAnonPolicies(schemas),
			auditSecurityDefiner(schemas),
			auditViews(schemas),
			auditDefinerExecuteGrants(schemas),
		])
	).flat()

	const errors = findings.filter((f) => f.severity === "error")
	const warnings = findings.filter((f) => f.severity === "warn")

	if (asJson) {
		console.log(JSON.stringify({ schemas, findings }, null, 2))
	} else {
		console.log(`Schemas auditados (${schemas.length}): ${schemas.join(", ")}\n`)
		for (const group of [errors, warnings]) {
			for (const f of group) {
				console.log(`${f.severity === "error" ? "ERRO " : "AVISO"} [${f.lint}] ${f.object}\n      ${f.detail}`)
			}
		}
		console.log(`\n${errors.length} erro(s), ${warnings.length} aviso(s).`)
	}

	await sql.end()
	process.exit(errors.length > 0 ? 1 : 0)
}

main().catch(async (error) => {
	console.error("Falha na auditoria de RLS:", error instanceof Error ? error.message : error)
	await sql.end({ timeout: 5 }).catch(() => {})
	process.exit(2)
})
