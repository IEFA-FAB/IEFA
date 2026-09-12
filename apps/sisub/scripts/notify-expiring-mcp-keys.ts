/**
 * Avisa os donos das chaves de API do MCP que estão perto de vencer.
 *
 * ## Por que um script, e não uma rotina automática
 *
 * O sisub não tem agendador. Fingir um — disparando o aviso dentro de alguma requisição de
 * usuário — criaria uma tarefa de fundo pendurada no tempo de resposta de quem só abriu uma
 * tela, e que não roda quando ninguém abre tela nenhuma. Enquanto não houver agendador de
 * verdade, o honesto é um comando que uma pessoa roda e cujo resultado ela lê.
 *
 * O canal GARANTIDO de aviso não é este script: é a tela `/diner/mcp-keys`, que destaca a
 * chave a menos de 30 dias do vencimento toda vez que o dono a abre. O e-mail aqui é
 * best-effort, como todo e-mail desta mudança (design.md D16) — sem `SISUB_RESEND_API_KEY`
 * ele não sai, e o script diz isso em vez de fingir que avisou.
 *
 * ## Quando rodar
 *
 * Uma vez logo depois de aplicar `20260911120300_access_control_mcp_api_key_expiry.sql` — que
 * dá 180 dias às chaves que já existiam —, com `--within 200`, para que ninguém descubra o
 * prazo no dia em que a integração parar. Depois disso, periodicamente com o padrão de 30
 * dias.
 *
 * Uso:
 *   bun run mcp-keys:notify-expiry                  # dry-run: lista quem SERIA avisado
 *   bun run mcp-keys:notify-expiry --apply
 *   bun run mcp-keys:notify-expiry --within 200 --apply
 *
 * Requer `SISUB_DATABASE_URL` (pooler) e, para o envio, `SISUB_RESEND_API_KEY`.
 *
 * O relatório sai AGREGADO por padrão. O endereço do dono é dado pessoal e este repositório é
 * público: não colar a saída de `--show-emails` em PR, commit ou issue.
 */

import postgres from "postgres"
import { isSecurityEmailConfigured, sendSecurityNotice } from "../src/lib/security-email.server.ts"

/** Antecedência padrão, em dias — a mesma janela que a tela destaca. */
const DEFAULT_WITHIN_DAYS = 30

type Args = { apply: boolean; withinDays: number; showEmails: boolean }

function parseArgs(argv: string[]): Args {
	const args: Args = { apply: false, withinDays: DEFAULT_WITHIN_DAYS, showEmails: false }
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i]
		if (a === "--apply") args.apply = true
		else if (a === "--show-emails") args.showEmails = true
		else if (a === "--within") {
			const raw = argv[++i]
			const days = Number(raw)
			if (!Number.isInteger(days) || days <= 0) throw new Error(`--within precisa de um número inteiro de dias (recebido: "${raw}")`)
			args.withinDays = days
		} else throw new Error(`flag desconhecida: ${a}`)
	}
	return args
}

type ExpiringKey = { id: string; label: string; expires_at: Date; email: string | null }

async function main() {
	const { apply, withinDays, showEmails } = parseArgs(process.argv.slice(2))
	const url = process.env.SISUB_DATABASE_URL
	if (!url) throw new Error("SISUB_DATABASE_URL ausente")

	const sql = postgres(url, { max: 1, prepare: false })
	try {
		// Só chave ATIVA e ainda válida: a revogada não vence (já morreu) e a vencida não tem
		// aviso prévio a dar — avisar depois do fato treina a pessoa a ignorar o aviso.
		const keys = await sql<ExpiringKey[]>`
			select k.id, k.label, k.expires_at, u.email
			from access_control.mcp_api_keys k
			join auth.users u on u.id = k.user_id
			where k.is_active
				and k.expires_at > now()
				and k.expires_at <= now() + make_interval(days => ${withinDays})
			order by k.expires_at
		`

		if (keys.length === 0) {
			process.stdout.write(`Nenhuma chave ativa vence nos próximos ${withinDays} dias.\n`)
			return
		}

		const semEmail = keys.filter((key) => !key.email).length
		process.stdout.write(`${keys.length} chave(s) ativa(s) vencem em até ${withinDays} dias${semEmail > 0 ? ` — ${semEmail} sem endereço no cadastro` : ""}.\n`)
		if (showEmails) {
			for (const key of keys) {
				process.stdout.write(`  ${key.expires_at.toISOString().slice(0, 10)}  ${key.label}  ${key.email ?? "(sem e-mail)"}\n`)
			}
		}

		if (!apply) {
			process.stdout.write("Dry-run: nenhum e-mail enviado. Repita com --apply.\n")
			return
		}

		if (!isSecurityEmailConfigured()) {
			// Falha VISÍVEL, e não envio silencioso que não acontece: quem rodou isto precisa
			// saber que o aviso não saiu, para avisar por outro canal.
			process.stdout.write("SISUB_RESEND_API_KEY ausente: nenhum e-mail pode ser enviado. Avise os donos por outro canal.\n")
			process.exitCode = 1
			return
		}

		let enviados = 0
		for (const key of keys) {
			const ok = await sendSecurityNotice({
				to: key.email,
				kind: "mcp-key-expiring",
				details: { label: key.label, expiresAt: key.expires_at },
			})
			if (ok) enviados++
		}
		process.stdout.write(`${enviados} de ${keys.length} aviso(s) despachado(s).\n`)
		if (enviados < keys.length) process.exitCode = 1
	} finally {
		await sql.end()
	}
}

main().catch((error) => {
	process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
	process.exit(1)
})
