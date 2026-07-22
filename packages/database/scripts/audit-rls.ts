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
 *   ERRO   view_security_definer view sem security_invoker → roda com os direitos do dono
 *   AVISO  rls_no_policy         RLS ligada e nenhuma policy → deny-all (ok se for só service-role)
 *   AVISO  policy_grants_anon    policy que concede ao role `anon` (leitura pública deliberada?)
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
						detail: "RLS desligada, mas anon/authenticated não têm nenhum GRANT — inalcançável pela API hoje. Um GRANT futuro a expõe sem barreira: ligue RLS mesmo assim",
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
	const rows = await sql<{ schema: string; name: string }[]>`
		select n.nspname as schema, c.relname as name
		from pg_class c
		join pg_namespace n on n.oid = c.relnamespace
		where c.relkind in ('v', 'm')
			and n.nspname = any(${schemas})
			and coalesce(array_to_string(c.reloptions, ','), '') not like '%security_invoker=%'
		order by n.nspname, c.relname
	`

	// Aviso, não erro: parte destas views é lida por `anon` nas páginas públicas
	// (journal, documentos legais). Ativar o invoker sem antes criar as policies de
	// leitura pública nas tabelas base quebraria esses fluxos — é uma correção que
	// precisa de PR próprio, não de um gate que força a mão.
	return rows.map((r) => ({
		severity: "warn" as const,
		lint: "view_security_definer",
		object: `${r.schema}.${r.name}`,
		detail: "view sem security_invoker=true — consultas rodam com os direitos do dono e furam a RLS das tabelas base",
	}))
}

async function main() {
	const schemas = await resolveExposedSchemas()
	const findings = (await Promise.all([auditTables(schemas), auditAnonPolicies(schemas), auditSecurityDefiner(schemas), auditViews(schemas)])).flat()

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
