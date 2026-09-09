/**
 * Contrato EXAUSTIVO de autenticação das server functions.
 *
 * O `security-contracts.test.ts` vizinho verifica invariantes de arquivos específicos
 * (permissions, places, settings). Este aqui faz o inverso: varre TODOS os `*.fn.ts`,
 * exige um guard em cada server function exportada e falha em qualquer endpoint novo
 * que nasça sem guard. Nada de allowlist implícita — o que é público está listado
 * abaixo, com justificativa, e o teste também falha se a lista ficar obsoleta.
 *
 * Por que isso importa mais no sisub do que num app Supabase típico: o servidor usa a
 * service key (`SISUB_SUPABASE_SECRET_KEY`), então RLS NÃO se aplica no caminho
 * servidor. O guard da server fn é a única barreira de autorização que existe. E o
 * `beforeLoad` da rota não é uma barreira: `/_serverFn/<id>` é chamável direto por HTTP.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs"
import { dirname, join, parse } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "vitest"

const serverDir = dirname(fileURLToPath(import.meta.url))

/** Raiz do monorepo (diretório que contém o turbo.json), subindo a partir daqui. */
function monorepoRoot(): string {
	let dir = serverDir
	while (!existsSync(join(dir, "turbo.json"))) {
		const parent = dirname(dir)
		if (parent === dir || dir === parse(dir).root) throw new Error(`turbo.json não encontrado subindo de ${serverDir}`)
		dir = parent
	}
	return dir
}

/**
 * Endpoints deliberadamente anônimos. Cada entrada precisa de um motivo — se você
 * está adicionando um, pergunte primeiro se o dado realmente pode vazar para a
 * internet aberta, porque é exatamente isso que a entrada significa.
 */
const PUBLIC_SERVER_FNS: Record<string, string> = {
	getServerSessionFn: "auth.fn — valida o JWT do request; sem sessão devolve { user: null }, que é o contrato",
	checkDatabaseStatusFn: "database-status.fn — health check booleano, renderizado pelo banner no __root (inclui a tela de login)",
	fetchChangelogPageFn: "changelog.fn — conteúdo da rota _public/changelog",
	fetchLegalDocumentFn: "legal.fn — termos de uso / política de privacidade / política de cookies, rotas _public; precisam ser legíveis sem sessão",
}

/** Chamadas que contam como guard de autenticação (prefixo `require` + maiúscula). */
const GUARD_CALL = /\brequire[A-Z]\w*\(/

type ServerFn = { file: string; name: string; body: string }

function listServerFnFiles(): string[] {
	return readdirSync(serverDir)
		.filter((f) => f.endsWith(".fn.ts"))
		.sort()
}

/**
 * Fatia o arquivo em blocos `export const X = ...` até o próximo `export`. Um parser
 * de AST seria mais preciso, mas amarraria o contrato ao TS compiler API; o corte por
 * `export const` cobre 100% do estilo em uso e falha de forma visível se ele mudar.
 */
function extractServerFns(file: string): ServerFn[] {
	const source = readFileSync(join(serverDir, file), "utf8")
	const out: ServerFn[] = []
	const exportRe = /export const (\w+) = /g

	let match = exportRe.exec(source)
	while (match !== null) {
		const start = match.index
		const next = exportRe.exec(source)
		const body = source.slice(start, next ? next.index : undefined)
		if (body.includes("createServerFn(")) {
			out.push({ file, name: match[1], body })
		}
		match = next
	}
	return out
}

const allServerFns = listServerFnFiles().flatMap(extractServerFns)

describe("server function auth contract", () => {
	test("o scanner encontra as server functions (proteção contra um teste que passa vazio)", () => {
		expect(allServerFns.length).toBeGreaterThan(40)
	})

	test("toda server function tem guard de autenticação ou está declarada como pública", () => {
		const unguarded = allServerFns
			.filter((fn) => !GUARD_CALL.test(fn.body))
			.filter((fn) => !(fn.name in PUBLIC_SERVER_FNS))
			.map((fn) => `${fn.file}:${fn.name}`)

		expect(
			unguarded,
			`Server fn sem guard. Chame requireAuth()/requireUserId()/requireAuthWithPermission() no handler, ou declare em PUBLIC_SERVER_FNS com justificativa.`
		).toEqual([])
	})

	test("a allowlist de endpoints públicos não tem entradas obsoletas", () => {
		const names = new Set(allServerFns.map((fn) => fn.name))
		const stale = Object.keys(PUBLIC_SERVER_FNS).filter((name) => !names.has(name))

		expect(stale, "entradas de PUBLIC_SERVER_FNS que não correspondem mais a nenhuma server fn — remova-as").toEqual([])
	})

	test("endpoints públicos declarados de fato não têm guard (senão a entrada é ruído)", () => {
		const guardedButListed = allServerFns.filter((fn) => fn.name in PUBLIC_SERVER_FNS && GUARD_CALL.test(fn.body)).map((fn) => `${fn.file}:${fn.name}`)

		expect(guardedButListed, "estas fns ganharam guard — remova-as de PUBLIC_SERVER_FNS").toEqual([])
	})

	test("o guard vem ANTES de qualquer acesso ao banco", () => {
		const dbAccess = /\b(getDb|getSupabaseServerClient|getProcurementClient|getCoreClient|getAccessControlClient)\(/
		const late: string[] = []

		for (const fn of allServerFns) {
			if (fn.name in PUBLIC_SERVER_FNS) continue
			const guardIdx = fn.body.search(GUARD_CALL)
			const dbIdx = fn.body.search(dbAccess)
			if (guardIdx === -1 || dbIdx === -1) continue
			if (guardIdx > dbIdx) late.push(`${fn.file}:${fn.name}`)
		}

		expect(late, "o client de DB é obtido antes do guard — inverta a ordem").toEqual([])
	})

	test("os proxies de sync exigem admin nível 2 (carregam o ADMIN_SECRET do servidor)", () => {
		const syncFns = allServerFns.filter((fn) => fn.file === "compras-sync.fn.ts" || fn.file === "nutrition-sync.fn.ts")

		expect(syncFns.length).toBeGreaterThan(0)
		for (const fn of syncFns) {
			expect(fn.body, `${fn.file}:${fn.name} precisa do guard de admin`).toMatch(/requireSyncAdmin\(\)/)
		}
		for (const file of ["compras-sync.fn.ts", "nutrition-sync.fn.ts"]) {
			const source = readFileSync(join(serverDir, file), "utf8")
			expect(source).toContain('requireAuthWithPermission("admin", 2)')
		}
	})

	/**
	 * O gate do Opengrep cobre o monorepo inteiro, e as exceções vivem no código como
	 * `// nosemgrep: <regra>`. Uma exceção sem justificativa ao lado é como a exceção
	 * envelhece até virar buraco: alguém copia a linha para calar o scanner e ninguém
	 * revisa depois. Este teste exige que toda supressão tenha um comentário explicando,
	 * e que a regra suprimida exista de fato.
	 */
	test("toda supressão nosemgrep do monorepo tem motivo escrito e cita uma regra existente", () => {
		const root = monorepoRoot()
		const rulesFile = readFileSync(join(root, ".opengrep/rules/server-fn-authz.yaml"), "utf8")
		const knownRules = new Set([...rulesFile.matchAll(/^ {2}- id: ([\w-]+)$/gm)].map((m) => m[1]))
		expect(knownRules.size).toBeGreaterThan(0)

		const appsDir = join(root, "apps")
		const problems: string[] = []

		for (const app of readdirSync(appsDir)) {
			const dir = join(appsDir, app, "src", "server")
			if (!existsSync(dir)) continue

			for (const file of readdirSync(dir).filter((f) => f.endsWith(".fn.ts"))) {
				const lines = readFileSync(join(dir, file), "utf8").split("\n")
				lines.forEach((line, index) => {
					const match = line.match(/nosemgrep:\s*([\w-]+)/)
					if (!match) return
					const where = `${app}/${file}:${index + 1}`

					if (!knownRules.has(match[1])) problems.push(`${where} suprime regra inexistente "${match[1]}"`)

					// Sobe pelo bloco de comentário contíguo (linha `//`, corpo `*` ou o
					// fechamento `*/` de um JSDoc) procurando prosa de verdade. Aceita tanto
					// `// motivo` + `// nosemgrep` quanto o JSDoc acima da supressão.
					let cursor = index - 1
					let hasReason = false
					while (cursor >= 0) {
						const previous = (lines[cursor] ?? "").trim()
						const isComment = previous.startsWith("//") || previous.startsWith("*") || previous.startsWith("/*")
						if (!isComment) break
						if (!previous.includes("nosemgrep") && previous.replace(/^[/*\s]+/, "").length > 8) {
							hasReason = true
							break
						}
						cursor--
					}
					if (!hasReason) problems.push(`${where} não explica o motivo no comentário acima`)
				})
			}
		}

		expect(problems, "supressões nosemgrep sem justificativa ou apontando para regra inexistente").toEqual([])
	})

	// ─────────────────────────────────────────────────────────────────────────────
	// Quem é o DONO do dado
	//
	// Ter guard responde "há sessão?", não "essa sessão pode agir sobre ESSE usuário?".
	// Os testes abaixo respondem a segunda pergunta para toda fn cujo payload nomeia um
	// usuário. A versão anterior deste bloco varria uma lista de arquivos digitada à mão —
	// com `user.fn.ts` dentro, e só ele. `forecast.fn.ts` ficou de fora, e a garantia
	// self-only das suas 5 fns vivia num comentário: trocar `requireUserId()` por
	// `data.userId` passava verde. A lista de arquivos era o bug, então aqui não há lista de
	// arquivos: a detecção vem do SCHEMA de cada fn, e uma fn nova entra sozinha.
	// ─────────────────────────────────────────────────────────────────────────────

	/**
	 * Campos de payload que nomeiam um usuário. `email` está aqui porque
	 * `core.user_data.email` é UNIQUE e é a chave da busca do console de permissões — um
	 * email escolhido pelo cliente reivindica a identidade de outra conta. `adminId` está
	 * aqui porque nomeia AUTORIA: é quem lançou o registro, e deixá-lo vir do cliente
	 * permite atribuir a ação a outra pessoa mesmo com a permissão correta.
	 */
	const IDENTITY_FIELD = /\b(userId|user_id|userIds|user_ids|adminId|admin_id|email|nrOrdem|nr_ordem)\b/g

	/**
	 * Fns em que um usuário age legitimamente sobre OUTRO. Cada entrada precisa do motivo, e
	 * cada uma é verificada: tem que haver guard de autorização (não só de autenticação) —
	 * no corpo da fn (`requireAuthWithPermission`) ou na operation de domínio que ela chama.
	 * Estar nesta lista não dispensa o guard; declara que o guard não é o `userId` da sessão.
	 */
	const CROSS_USER_SERVER_FNS: Record<string, string> = {
		fetchUserMealForecastFn: "messhall.fn — o fiscal lê a previsão do comensal que apresentou o QR; o self check-in manda o próprio id",
		resolveDisplayNameFn: "messhall.fn — o fiscal converte o UUID do QR em nome para conferir a pessoa na fila; exige messhall:1 no rancho informado",
		insertPresenceFn: "presence.fn — o fiscal registra a presença de terceiro; `insertPresence` exige messhall:2 quando o alvo não é o chamador",
		fetchForecastsFn: "presence.fn — mapa de previsão dos comensais já presentes no refeitório, tela do fiscal",
		searchUsersByEmailFn: "permissions.fn — o administrador procura a quem conceder permissão; a operation exige admin:2",
		fetchUserPermissionsAdminFn: "permissions.fn — console de permissões: administrador lê as permissões de terceiro",
		createUserPermissionFn: "permissions.fn — console de permissões: administrador concede permissão a terceiro",
		fetchUserPoliciesFn: "policies.fn — console de políticas: administrador lê as políticas anexadas a terceiro",
		fetchEffectivePermissionsFn: "policies.fn — console de políticas: permissões efetivas de terceiro, com origem",
		attachPolicyFn: "policies.fn — administrador anexa uma política a terceiro",
		detachPolicyFn: "policies.fn — administrador desanexa uma política de terceiro",
	}

	/**
	 * Campo de identidade que é input LEGÍTIMO do próprio usuário — ele se descreve, não
	 * escolhe um alvo. Entrada aqui precisa dizer por que o valor não decide de quem é a
	 * linha lida ou escrita.
	 */
	const OWN_INPUT_FIELDS: Record<string, Record<string, string>> = {
		syncUserNrOrdemFn: {
			nrOrdem: "vem do formulário de perfil e é gravado NA LINHA DA SESSÃO (`user.id`) — não seleciona a linha a escrever",
		},
	}

	/** Chamadas que contam como guard de AUTORIZAÇÃO (permissão), não só de autenticação. */
	const AUTHZ_CALL =
		/\b(requireAuthWithPermission|requirePermission|requireAnyPermission|requireMessHall|requireKitchen|requireUnit\w*|requireStorage\w*|requireSyncAdmin)\(/

	/**
	 * Fatia a expressão que começa em `pos` equilibrando `()`, `{}` e `[]`, e para quando a
	 * profundidade volta a zero. É como o `.validator(...)` é recortado sem arrastar o
	 * `.handler(...)` de baixo — arrastar o handler faria um `const { userId } = await
	 * requireStorageForKitchen(...)` contar como campo de payload, e 20 fns de estoque
	 * apareceriam como falso positivo.
	 */
	function balancedSlice(source: string, pos: number): string {
		let depth = 0
		let opened = false
		for (let i = pos; i < source.length; i++) {
			const char = source[i]
			if (char === "(" || char === "{" || char === "[") {
				depth++
				opened = true
			} else if (char === ")" || char === "}" || char === "]") {
				depth--
				if (opened && depth <= 0) return source.slice(pos, i + 1)
			} else if (!opened && char === "\n") return source.slice(pos, i)
		}
		return source.slice(pos)
	}

	/** `nome do schema` → texto da sua definição, do domínio e dos arquivos do app. */
	function collectSchemaDefs(): Map<string, string> {
		const defs = new Map<string, string>()
		const walk = (dir: string) => {
			for (const entry of readdirSync(dir, { withFileTypes: true })) {
				const full = join(dir, entry.name)
				if (entry.isDirectory()) {
					walk(full)
					continue
				}
				if (!entry.name.endsWith(".ts")) continue
				const source = readFileSync(full, "utf8")
				const re = /(?:export )?const (\w+Schema)\s*=\s*/g
				let match = re.exec(source)
				while (match !== null) {
					defs.set(match[1], balancedSlice(source, match.index + match[0].length))
					match = re.exec(source)
				}
			}
		}
		const root = monorepoRoot()
		walk(join(root, "packages/sisub-domain/src/schemas"))
		walk(serverDir)
		walk(join(serverDir, "..", "lib"))
		return defs
	}

	const schemaDefs = collectSchemaDefs()

	/** Cola nas definições referenciadas (`.extend`, schema aninhado) para ver os campos herdados. */
	function expandSchema(text: string, seen: Set<string>, depth = 0): string {
		if (depth > 4) return text
		let out = text
		for (const ref of new Set([...text.matchAll(/\b(\w+Schema)\b/g)].map((m) => m[1]))) {
			if (seen.has(ref)) continue
			const def = schemaDefs.get(ref)
			if (!def) continue
			seen.add(ref)
			out += `\n${expandSchema(def, seen, depth + 1)}`
		}
		return out
	}

	/** Campos de identidade que o payload validado de `fn` declara. */
	function identityFieldsOf(fn: ServerFn): string[] {
		const at = fn.body.indexOf(".validator(")
		if (at === -1) return []
		const raw = balancedSlice(fn.body, at + ".validator".length)
			.slice(1, -1)
			.trim()
		const named = /^\w+$/.test(raw)
		const text = expandSchema(named ? (schemaDefs.get(raw) ?? raw) : raw, new Set(named ? [raw] : []))
		return [...new Set([...text.matchAll(IDENTITY_FIELD)].map((m) => m[1]))]
	}

	/** `nome da operation` → tem guard de autorização no corpo. */
	function collectDomainOps(): Map<string, boolean> {
		const ops = new Map<string, boolean>()
		const dir = join(monorepoRoot(), "packages/sisub-domain/src/operations")
		for (const file of readdirSync(dir).filter((f) => f.endsWith(".ts") && !f.includes(".test."))) {
			const source = readFileSync(join(dir, file), "utf8")
			const re = /export (?:async )?function (\w+)\s*\(/g
			let match = re.exec(source)
			while (match !== null) {
				const start = match.index
				const nextExport = source.indexOf("\nexport ", start + 1)
				const body = source.slice(start, nextExport === -1 ? undefined : nextExport)
				ops.set(match[1], AUTHZ_CALL.test(body))
				match = re.exec(source)
			}
		}
		return ops
	}

	const domainOps = collectDomainOps()

	/** Corpo do handler sem comentários — comentário não é garantia, é a lição deste arquivo. */
	function handlerOf(fn: ServerFn): string {
		const at = fn.body.indexOf(".handler")
		return (at === -1 ? fn.body : fn.body.slice(at)).replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "")
	}

	const fnsWithIdentityPayload = allServerFns.map((fn) => ({ fn, fields: identityFieldsOf(fn) })).filter((entry) => entry.fields.length > 0)

	test("o scanner enxerga os campos de identidade dos schemas (proteção contra um teste que passa vazio)", () => {
		// Se a resolução de schema quebrar (import novo, schema movido de pacote), a lista
		// esvazia e TODOS os testes de dono passariam sem verificar nada.
		expect(fnsWithIdentityPayload.length).toBeGreaterThanOrEqual(16)
		expect(domainOps.size).toBeGreaterThan(100)
		// Âncoras: as fns que motivaram o contrato precisam estar no conjunto detectado.
		const detected = new Set(fnsWithIdentityPayload.map((e) => e.fn.name))
		for (const anchor of ["fetchMealForecastsFn", "fetchUserDefaultMessHallFn", "persistDefaultMessHallFn", "fetchUserDataFn", "insertPresenceFn"]) {
			expect(detected, `${anchor} deveria ser detectado como fn com identidade no payload`).toContain(anchor)
		}
	})

	test("fn self-only não deixa o cliente escolher o dono: identidade da sessão ou withSessionIdentity", () => {
		const problems: string[] = []

		for (const { fn, fields } of fnsWithIdentityPayload) {
			if (fn.name in CROSS_USER_SERVER_FNS) continue
			const handler = handlerOf(fn)
			// Passar o payload inteiro adiante entrega o campo de identidade junto.
			const forwardsWholePayload = /\{\s*\.\.\.data\b/.test(handler) || /[(,]\s*data\s*[,)]/.test(handler)
			// `const { userId } = data` lê o identificador sem escrever `data.userId`: sem isto
			// a garantia valeria só para os estilos de escrita que já estão na árvore.
			const destructured = new Set(
				[...handler.matchAll(/(?:const|let)\s*\{([^}]*)\}\s*=\s*data\b/g)].flatMap((m) => [...m[1].matchAll(/\b(\w+)\b/g)].map((f) => f[1]))
			)
			const overridden = new Set(
				[...handler.matchAll(/withSessionIdentity\(\s*data\s*,[^[]*\[([^\]]*)\]/g)].flatMap((m) => [...m[1].matchAll(/"(\w+)"/g)].map((f) => f[1]))
			)
			const ownInput = OWN_INPUT_FIELDS[fn.name] ?? {}

			for (const field of fields) {
				if (overridden.has(field) || field in ownInput) continue
				const where = `${fn.file}:${fn.name} (${field})`
				if (new RegExp(`\\bdata(?:\\.|\\?\\.)${field}\\b`).test(handler)) {
					problems.push(`${where} lê o identificador do payload`)
				} else if (destructured.has(field)) {
					problems.push(`${where} desestrutura o identificador do payload`)
				} else if (forwardsWholePayload) {
					problems.push(`${where} repassa o payload inteiro sem sobrescrever o campo`)
				}
			}
		}

		expect(
			problems,
			"o dono do dado tem que vir da sessão. Envolva o payload em withSessionIdentity(data, session, [...]), ou declare a fn em CROSS_USER_SERVER_FNS com o motivo e um guard de permissão."
		).toEqual([])
	})

	test("toda fn cross-user tem guard de AUTORIZAÇÃO (na fn ou na operation que ela chama)", () => {
		const ungated: string[] = []

		for (const { fn } of fnsWithIdentityPayload) {
			if (!(fn.name in CROSS_USER_SERVER_FNS)) continue
			const handler = handlerOf(fn)
			if (AUTHZ_CALL.test(handler)) continue
			// Sem guard na fn, alguma operation chamada precisa ter o dela.
			const called = [...handler.matchAll(/\b([a-z]\w+)\(/g)].map((m) => m[1])
			if (called.some((name) => domainOps.get(name) === true)) continue
			ungated.push(`${fn.file}:${fn.name}`)
		}

		expect(ungated, "fn declarada cross-user sem guard de permissão — sessão só prova quem chama, não que pode agir sobre outro").toEqual([])
	})

	test("a lista cross-user não tem entradas obsoletas nem entradas sem identidade no payload", () => {
		const withIdentity = new Set(fnsWithIdentityPayload.map((e) => e.fn.name))
		const stale = Object.keys(CROSS_USER_SERVER_FNS).filter((name) => !withIdentity.has(name))

		expect(stale, "entradas de CROSS_USER_SERVER_FNS que não correspondem a nenhuma fn com identidade no payload — remova-as").toEqual([])
	})

	test("a lista de campo-como-input-próprio não tem entradas obsoletas", () => {
		const byName = new Map(fnsWithIdentityPayload.map((e) => [e.fn.name, e.fields]))
		const stale: string[] = []

		for (const [name, fields] of Object.entries(OWN_INPUT_FIELDS)) {
			const detected = byName.get(name)
			if (!detected) {
				stale.push(`${name} não é mais uma fn com identidade no payload`)
				continue
			}
			for (const field of Object.keys(fields)) {
				if (!detected.includes(field)) stale.push(`${name}.${field} não é mais declarado pelo validator`)
			}
		}

		expect(stale, "entradas obsoletas de OWN_INPUT_FIELDS — remova-as").toEqual([])
	})

	test("as fns de perfil seguem self-only e sem userId do payload", () => {
		const profileFns = allServerFns.filter((fn) => fn.file === "user.fn.ts")

		expect(profileFns.length).toBeGreaterThan(0)
		for (const fn of profileFns) {
			expect(fn.name in CROSS_USER_SERVER_FNS, `${fn.file}:${fn.name} não pode ser cross-user`).toBe(false)
			expect(fn.body, `${fn.file}:${fn.name} deve derivar a identidade da sessão`).toMatch(/require(UserId|User)\(\)/)
			// `data.userId` no corpo significaria que o cliente ainda escolhe o alvo.
			expect(fn.body.replace(/\/\/.*$/gm, "")).not.toMatch(/\bdata\.userId\b/)
		}
	})
})
