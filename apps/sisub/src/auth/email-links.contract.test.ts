/**
 * Contrato dos destinos de link de e-mail do Supabase — em TODOS os apps que
 * dividem o projeto (sisub, portal, forms, rumaer, sucont).
 *
 * O template em uso é `{{ .ConfirmationURL }}`: o link passa por
 * `/auth/v1/verify` no Supabase, que valida o token e redireciona para o
 * `redirectTo` pedido — desde que ele esteja na allow-list de Redirect URLs do
 * projeto. Fora da allow-list, o redirect cai na Site URL e o CAMINHO é
 * descartado. A allow-list é config de dashboard e não dá para testar daqui; o
 * que dá para garantir é o lado do código: o caminho pedido tem que existir no
 * app que o pediu.
 *
 * Foi exatamente isso que faltou — `portal` e `rumaer` pediam
 * `/auth/reset-password` e `/auth/callback`, que não são rotas de nenhum dos
 * dois. Um teste preso ao sisub não teria visto, então este varre os apps.
 *
 * Quem monta a URL absoluta é `createAuthActions` em `@iefa/auth-kit`; cada app
 * declara só o CAMINHO, em `signUpRedirectPath` / `resetPasswordRedirectPath`.
 * O extrator abaixo aceita as duas formas — a antiga, com o template de
 * `window.location.origin` inline no app, e a atual, com o caminho nomeado.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs"
import { dirname, join, parse } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "vitest"

const here = dirname(fileURLToPath(import.meta.url))

/** Raiz do monorepo (diretório que contém o turbo.json), subindo a partir daqui. */
function monorepoRoot(): string {
	let dir = here
	while (!existsSync(join(dir, "turbo.json"))) {
		const parent = dirname(dir)
		if (parent === dir || dir === parse(dir).root) throw new Error(`turbo.json não encontrado subindo de ${here}`)
		dir = parent
	}
	return dir
}

const appsDir = join(monorepoRoot(), "apps")

/** Apps com um service de auth próprio — é lá que moram os destinos de link. */
function appsWithAuthService(): { app: string; serviceFile: string; routesDir: string }[] {
	return readdirSync(appsDir)
		.map((app) => ({ app, serviceFile: join(appsDir, app, "src/auth/service.ts"), routesDir: join(appsDir, app, "src/routes") }))
		.filter((entry) => existsSync(entry.serviceFile) && existsSync(entry.routesDir))
}

/** Extrai os caminhos declarados como destino de link de e-mail pelo app. */
function emailLinkPaths(source: string): string[] {
	const paths = new Set<string>()
	// Forma atual: o app passa o caminho para `createAuthActions`, que o torna absoluto.
	for (const match of source.matchAll(/(?:signUpRedirectPath|resetPasswordRedirectPath):\s*"([^"]+)"/g)) {
		paths.add(match[1])
	}
	// Forma antiga: template de origin montado dentro do próprio app.
	for (const match of source.matchAll(/(?:emailRedirectTo|redirectTo)[\s\S]{0,160}?\$\{window\.location\.origin\}([^`]*)`/g)) {
		paths.add(match[1])
	}
	return [...paths]
}

/** Resolve um caminho de rota para o arquivo que o renderiza, no layout file-based. */
function routeFileFor(routesDir: string, path: string): string | null {
	const normalized = path.replace(/^\//, "").replace(/\/$/, "")
	const candidates = [join(routesDir, `${normalized}.tsx`), join(routesDir, normalized, "index.tsx")]
	return candidates.find(existsSync) ?? null
}

const targets = appsWithAuthService().flatMap(({ app, serviceFile, routesDir }) =>
	emailLinkPaths(readFileSync(serviceFile, "utf8")).map((path) => ({ app, path, routesDir }))
)

describe("destinos de link de e-mail do Supabase", () => {
	test("os services declaram destinos — se pararem de declarar, o resto do arquivo vira vácuo", () => {
		// Números exatos de propósito: um `>=` frouxo deixa a extração perder um
		// caminho (basta um comentário crescer entre `redirectTo` e o template) sem
		// que nada fique vermelho, e aí os casos abaixo testam menos do que parecem.
		expect(new Set(targets.map((t) => t.app))).toEqual(new Set(["sisub", "portal", "rumaer", "forms", "sucont"]))
		expect(targets.map((t) => `${t.app}${t.path}`).sort()).toEqual([
			"forms/auth",
			"portal/auth",
			"rumaer/auth",
			"sisub/auth",
			"sisub/auth/reset-password",
			"sucont/auth",
		])
	})

	test.each(targets)("$app: $path existe como rota do app", ({ path, routesDir }) => {
		expect(routeFileFor(routesDir, path), `${path} é destino de link de e-mail mas não resolve para nenhuma rota — o link dá 404`).not.toBeNull()
	})

	test('nenhuma rota de auth do sisub fixa o type do OTP como "email"', () => {
		// `resetPasswordForEmail` gera links com type=recovery. Verificar com o tipo
		// errado devolve "Token has expired or is invalid" num link válido.
		for (const file of ["index.tsx", "reset-password.tsx"]) {
			const source = readFileSync(join(appsDir, "sisub/src/routes/auth", file), "utf8")
			expect(source, `${file} fixa type: "email" no verifyOtp — links de recuperação falham`).not.toMatch(/verifyOtp\(\{[^}]*type:\s*"email"/)
		}
	})

	// Uma sessão de recuperação autentica o usuário sem que ele tenha terminado o
	// que veio fazer. Todo guard que reage a "está autenticado" precisa saber
	// distinguir os dois casos, senão leva o usuário embora do formulário e a
	// senha antiga continua valendo — falha silenciosa, sem erro em lugar nenhum.
	test.each(["sisub", "portal", "rumaer"])("%s: o guard de /auth isenta a sessão de recuperação", (app) => {
		const source = readFileSync(join(appsDir, app, "src/routes/auth/route.tsx"), "utf8")
		expect(source, `o beforeLoad de /auth do ${app} redireciona quem chegou por link de recuperação`).toMatch(/isPasswordRecovery\(\)/)
		expect(source, `o beforeLoad de /auth do ${app} não cobre o primeiro load, antes de qualquer evento`).toMatch(/urlLooksLikeRecovery\(\)/)
	})

	test("o listener de auth do sisub não manda a sessão de recuperação para /hub", () => {
		const source = readFileSync(join(appsDir, "sisub/src/router.tsx"), "utf8")
		expect(source, "o listener navega para /hub em qualquer rota /auth — inclusive a de nova senha").toMatch(/isPasswordRecovery\(\)/)
	})

	test("a tela de nova senha do sisub lê os parâmetros de erro do link", () => {
		// O Supabase devolve `#error=access_denied&error_code=otp_expired&…` quando o
		// link não vale mais. Sem ler isso a página espera o timeout e mostra um
		// motivo genérico no lugar do que o Supabase informou.
		const source = readFileSync(join(appsDir, "sisub/src/routes/auth/reset-password.tsx"), "utf8")
		expect(source).toMatch(/error_description/)
		expect(source).toMatch(/location\.hash/)
	})
})
