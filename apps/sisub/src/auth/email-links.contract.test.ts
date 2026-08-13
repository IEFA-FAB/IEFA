/**
 * Contrato dos links de e-mail do Supabase.
 *
 * O bug que originou este arquivo: `resetPasswordForEmail` mandava o usuário para
 * `/auth/reset-password`, e essa tela não lia `token_hash` da URL. O template de
 * e-mail do projeto entrega o OTP como `?token_hash=…&type=recovery` — formato que
 * NENHUM client do Supabase consome sozinho (`detectSessionInUrl` só enxerga
 * `?code=` do PKCE e `#access_token=` do implícito). Resultado: a página esperava
 * uma sessão que nunca chegava e anunciava "Link inválido" para um link recém-emitido.
 *
 * Duas invariantes, então, para qualquer destino de link de e-mail:
 *   1. o caminho existe como rota deste app (senão o link dá 404);
 *   2. a rota de destino chama `verifyOtp` (senão o token fica na URL sem uso).
 *
 * Ambas são estáticas de propósito: o modo de falha é silencioso em produção e só
 * aparece na caixa de entrada de quem clicou.
 */

import { existsSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "vitest"

const authDir = dirname(fileURLToPath(import.meta.url))
const srcDir = dirname(authDir)
const routesDir = join(srcDir, "routes")

const serviceSource = readFileSync(join(authDir, "service.ts"), "utf8")

/** Extrai os caminhos de `${window.location.origin}<path>` usados como destino de link. */
function emailLinkPaths(source: string): string[] {
	const paths = new Set<string>()
	for (const match of source.matchAll(/(?:emailRedirectTo|redirectTo)[\s\S]{0,120}?\$\{window\.location\.origin\}([^`]*)`/g)) {
		paths.add(match[1])
	}
	return [...paths]
}

/** Resolve um caminho de rota para o arquivo que o renderiza, no layout file-based. */
function routeFileFor(path: string): string | null {
	const normalized = path.replace(/^\//, "").replace(/\/$/, "")
	const candidates = [join(routesDir, `${normalized}.tsx`), join(routesDir, normalized, "index.tsx")]
	return candidates.find(existsSync) ?? null
}

describe("links de e-mail do Supabase", () => {
	const paths = emailLinkPaths(serviceSource)

	test("o service declara ao menos um destino — se parar de declarar, o resto do arquivo vira vácuo", () => {
		expect(paths.length).toBeGreaterThan(0)
	})

	test.each(paths)("%s existe como rota deste app", (path) => {
		expect(routeFileFor(path), `${path} é destino de link de e-mail mas não resolve para nenhuma rota — o link dá 404`).not.toBeNull()
	})

	test.each(paths)("%s consome o token_hash da URL", (path) => {
		const file = routeFileFor(path)
		if (!file) return // já reportado pelo teste acima
		const source = readFileSync(file, "utf8")
		// A chamada, não a palavra: o arquivo cita `verifyOtp` nos comentários, então
		// `toContain` continuaria verde com o consumo do token removido.
		expect(source, `${path} recebe o link do e-mail mas nunca chama verifyOtp — o token fica na URL sem virar sessão`).toMatch(/auth\.verifyOtp\(/)
	})

	test("a tela de nova senha declara token_hash e type na validateSearch", () => {
		// Sem os parâmetros declarados o componente não tem como lê-los, e a página
		// volta a cair no fallback de sessão — que responde "Link inválido".
		const source = readFileSync(join(routesDir, "auth", "reset-password.tsx"), "utf8")
		expect(source).toMatch(/token_hash:\s*z\.string\(\)\.optional\(\)/)
		expect(source).toMatch(/type:\s*z\.string\(\)\.optional\(\)/)
	})

	test('nenhuma rota de auth fixa o type do OTP como "email"', () => {
		// `resetPasswordForEmail` gera links com type=recovery. Verificar com o tipo
		// errado devolve "Token has expired or is invalid" num link válido.
		for (const file of ["index.tsx", "reset-password.tsx"]) {
			const source = readFileSync(join(routesDir, "auth", file), "utf8")
			expect(source, `${file} fixa type: "email" no verifyOtp — links de recuperação falham`).not.toMatch(/verifyOtp\(\{[^}]*type:\s*"email"/)
		}
	})
})
