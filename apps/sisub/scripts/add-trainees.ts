/**
 * Coloca uma lista de emails no ambiente de treino.
 *
 * Entrar em treino é anexar a política gerenciada "Conjunto Treino" (`access_control.policy`)
 * ao usuário — exatamente o que o botão "Adicionar treinando" da SDAB faz, um por vez. Este
 * script existe para o caso em lote: uma turma inteira pedindo acesso de uma vez.
 *
 * A identidade é resolvida em `auth.users`, não em `core.user_data`: o anexo aponta para o uid
 * de autenticação, e `user_data` só é preenchido no primeiro login (sync de email por sessão).
 * Buscar em `user_data` deixaria de fora quem criou a conta e ainda não entrou.
 *
 * **Só anexa em quem já tem conta.** Não existe convite: o cadastro é self-service em
 * `/register` e restrito a `@fab.mil.br` (`src/auth/config.ts`). Email sem conta é RELATADO,
 * não criado — daí a lista viver em arquivo: rodar de novo depois que a pessoa se cadastrar
 * completa o que faltou, e quem já está em treino é ignorado pelo unique do anexo.
 *
 * **A lista NÃO é versionada.** O padrão é `scripts/trainees.local.txt`, que está no
 * `.gitignore`: um rol de treinandos é um conjunto de pessoas identificáveis, e este
 * repositório é PÚBLICO. O modelo do formato fica em `scripts/trainees.example.txt`. Pelo
 * mesmo motivo, não colar email nem nome de treinando em corpo de PR, commit ou issue —
 * relatório de execução se reporta agregado ("1 anexado, 26 sem conta").
 *
 * Uso:
 *   bun run scripts/add-trainees.ts                       # dry-run com scripts/trainees.local.txt
 *   bun run scripts/add-trainees.ts --apply
 *   bun run scripts/add-trainees.ts --file outra-lista.txt --apply
 *   bun run scripts/add-trainees.ts --apply fulano@fab.mil.br  # emails soltos, sem arquivo
 *   bun run scripts/add-trainees.ts --apply --actor <uuid>     # grava o autor no anexo
 *
 * Requer `SISUB_DATABASE_URL` (pooler). Sem `--apply` a transação termina em ROLLBACK, então o
 * dry-run exercita os inserts de verdade e o relatório é o mesmo que o `--apply` produziria.
 */

import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import postgres from "postgres"

/** Nome da política gerenciada — resolvido por nome porque o id é gerado por migration e difere entre ambientes. */
const TRAINING_POLICY = "Conjunto Treino"

const DEFAULT_FILE = "scripts/trainees.local.txt"

type Args = { apply: boolean; file: string | null; actor: string | null; emails: string[] }

function parseArgs(argv: string[]): Args {
	const args: Args = { apply: false, file: null, actor: null, emails: [] }
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i]
		if (a === "--apply") args.apply = true
		else if (a === "--file") args.file = argv[++i] ?? null
		else if (a === "--actor") args.actor = argv[++i] ?? null
		else if (a.startsWith("--")) throw new Error(`flag desconhecida: ${a}`)
		else args.emails.push(a)
	}
	// Arquivo só entra quando nenhum email foi passado à mão: `--apply a@b` não deve arrastar a
	// turma inteira junto.
	if (args.emails.length === 0) args.file ??= DEFAULT_FILE
	return args
}

/**
 * Lê o arquivo do rol.
 *
 * Mensagem própria para o ausente porque o caminho padrão é gitignorado: numa checkout limpa
 * ele nunca existe, e o ENOENT cru do `readFileSync` leria como script quebrado em vez de
 * "monte a sua lista".
 */
function readRoster(file: string): string {
	try {
		return readFileSync(resolve(process.cwd(), file), "utf8")
	} catch (e) {
		if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e
		throw new Error(
			`rol não encontrado em "${file}". A lista não é versionada (contém pessoas identificáveis, e o repo é público): ` +
				`copie scripts/trainees.example.txt para ${DEFAULT_FILE}, ou passe os emails como argumento.`,
		)
	}
}

/** Uma entrada por linha; `#` inicia comentário (inclusive no fim da linha, onde ficam os nomes). */
function parseRoster(text: string): string[] {
	return text
		.split("\n")
		.map((line) => line.split("#")[0].trim())
		.filter(Boolean)
}

function normalize(emails: string[]): string[] {
	const seen = new Set<string>()
	for (const raw of emails) {
		const email = raw.trim().toLowerCase()
		if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error(`email inválido: "${raw}"`)
		seen.add(email)
	}
	return [...seen]
}

/** Carrega o relatório do dry-run pelo caminho de erro — único jeito de sair de `begin()` em ROLLBACK. */
class Rollback<T> extends Error {
	constructor(readonly report: T) {
		super("rollback")
	}
}

/**
 * Roda o corpo numa transação e desfaz tudo quando `apply` é falso.
 *
 * O dry-run executa os MESMOS inserts e só então volta atrás: um relatório montado sem
 * escrever de fato prometeria um resultado que o `--apply` poderia não reproduzir (FK, unique,
 * permissão da role).
 */
async function runInTransaction<T>(sql: postgres.Sql, apply: boolean, body: (tx: postgres.TransactionSql) => Promise<T>): Promise<T> {
	try {
		// Cast: `begin()` promete `UnwrapPromiseArray<T>` (achata retorno de query), e o corpo aqui
		// devolve um objeto de relatório, não linhas.
		return (await sql.begin(async (tx) => {
			const report = await body(tx)
			if (!apply) throw new Rollback(report)
			return report
		})) as T
	} catch (e) {
		if (e instanceof Rollback) return e.report as T
		throw e
	}
}

async function main() {
	const { apply, file, actor, emails: inline } = parseArgs(process.argv.slice(2))
	const url = process.env.SISUB_DATABASE_URL
	if (!url) throw new Error("SISUB_DATABASE_URL ausente")

	const fromFile = file ? parseRoster(readRoster(file)) : []
	const emails = normalize([...fromFile, ...inline])
	if (emails.length === 0) throw new Error("nenhum email para processar")

	const sql = postgres(url, { max: 1, prepare: false })
	try {
		const report = await runInTransaction(sql, apply, async (tx) => {
			const [policy] = await tx<{ id: string }[]>`
				select id from access_control.policy
				where name = ${TRAINING_POLICY} and managed and deleted_at is null
			`
			if (!policy) throw new Error(`política "${TRAINING_POLICY}" não encontrada — o seed de treino foi aplicado neste banco?`)

			if (actor) {
				const [row] = await tx`select 1 from auth.users where id = ${actor}::uuid`
				if (!row) throw new Error(`--actor ${actor} não existe em auth.users`)
			}

			// lower() dos dois lados: auth.users guarda o email como o usuário digitou.
			const accounts = await tx<{ id: string; email: string }[]>`
				select id, lower(email) as email from auth.users where lower(email) = any(${emails}::text[])
			`
			const byEmail = new Map(accounts.map((a) => [a.email, a.id]))

			const attached: string[] = []
			const already: string[] = []
			for (const [email, userId] of byEmail) {
				const inserted = await tx<{ id: string }[]>`
					insert into access_control.user_policy_attachment (user_id, policy_id, created_by)
					values (${userId}::uuid, ${policy.id}::uuid, ${actor}::uuid)
					on conflict (user_id, policy_id) do nothing
					returning id
				`
				;(inserted.length > 0 ? attached : already).push(email)
			}

			return { attached, already, missing: emails.filter((e) => !byEmail.has(e)) }
		})

		const { attached, already, missing } = report
		console.log(`\n${apply ? "APLICADO" : "DRY-RUN (nada gravado)"} — política "${TRAINING_POLICY}"\n`)
		console.log(`  ${attached.length} anexado(s)${attached.length ? ":" : ""}`)
		for (const e of attached) console.log(`    + ${e}`)
		console.log(`  ${already.length} já estava(m) em treino${already.length ? ":" : ""}`)
		for (const e of already) console.log(`    = ${e}`)
		console.log(`  ${missing.length} sem conta no sistema${missing.length ? " (precisam se cadastrar em /register):" : ""}`)
		for (const e of missing) console.log(`    ! ${e}`)
		if (!apply) console.log("\nRode de novo com --apply para gravar.")
	} finally {
		await sql.end()
	}
}

await main()
