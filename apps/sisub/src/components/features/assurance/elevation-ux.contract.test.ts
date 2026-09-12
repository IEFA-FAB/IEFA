/**
 * Contrato da CAMADA DE CLIENTE da elevação: o que a torna suportável não pode regredir em
 * silêncio.
 *
 * As três invariantes verificadas aqui não quebram nenhum tipo e não derrubam nenhum teste de
 * lógica — elas quebram a experiência, e só apareceriam quando alguém perdesse um formulário
 * de verdade:
 *
 * 1. O modal precisa estar montado no `__root`. Sem ele, `useAssuranceElevation` lança e toda
 *    mutação protegida morre sem tela de volta.
 * 2. A elevação não navega e não recarrega. Recarga é exatamente a solução que as telas de
 *    `/diner/security` usam (e ali está certa) — copiada para cá, ela apaga o formulário que
 *    este fluxo inteiro existe para preservar. A única recarga tolerada é o botão explícito da
 *    sessão travada, acionado pelo usuário.
 * 3. O motivo da operação aparece no modal. Código pedido sem motivo é o treinamento que
 *    transforma qualquer caixa de 6 dígitos num phishing bem-sucedido.
 *
 * É verificação de código-fonte, como `route-assurance.contract.test.ts` e
 * `server-fn-auth.contract.test.ts`: o app não tem runner de DOM, e estas invariantes são
 * estruturais o bastante para serem lidas do arquivo.
 */

import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "vitest"

const here = dirname(fileURLToPath(import.meta.url))
const srcDir = join(here, "..", "..", "..")

const read = (relativePath: string) => readFileSync(join(srcDir, relativePath), "utf8")

const dialogSource = read("components/features/assurance/AssuranceElevationDialog.tsx")
const providerSource = read("components/features/assurance/AssuranceElevationProvider.tsx")
const hookSource = read("hooks/auth/useAssuredMutation.ts")
const rootSource = read("routes/__root.tsx")

describe("o modal de elevação está no ar", () => {
	test("o `__root` monta o provider em volta do <Outlet />", () => {
		expect(rootSource).toContain("AssuranceElevationProvider")
		// Em volta do Outlet, e não ao lado: o modal abre SOBRE a tela em uso.
		const provider = rootSource.indexOf("<AssuranceElevationProvider>")
		const outlet = rootSource.indexOf("<Outlet />", provider)
		const closing = rootSource.indexOf("</AssuranceElevationProvider>")
		expect(provider).toBeGreaterThan(-1)
		expect(outlet).toBeGreaterThan(provider)
		expect(closing).toBeGreaterThan(outlet)
	})

	test("o provider só monta o modal quando há pedido em aberto", () => {
		// Montá-lo sempre faria a consulta de MFA rodar em toda tela do sistema.
		expect(providerSource).toContain("{prompt && <AssuranceElevationDialog")
	})
})

describe("a elevação não tira ninguém da tela", () => {
	const NAVIGATION_SYMBOLS = ["window.location.assign", "window.location.replace", "useNavigate", "router.navigate", "redirect(", "<Link", 'to="/auth']

	test("o modal não navega para lugar nenhum", () => {
		const offenders = NAVIGATION_SYMBOLS.filter((symbol) => dialogSource.includes(symbol))
		expect(offenders, "redirecionar descarta o formulário — é o que o requisito proíbe").toEqual([])
	})

	test("o wrapper de mutação também não navega", () => {
		const offenders = NAVIGATION_SYMBOLS.filter((symbol) => hookSource.includes(symbol) || providerSource.includes(symbol))
		expect(offenders).toEqual([])
	})

	test("toda recarga do modal é um botão explícito da sessão travada", () => {
		const reloads = dialogSource
			.split("\n")
			// Comentário citando a recarga das telas de cadastro não conta — é justamente onde se
			// explica por que ela não serve aqui.
			.filter((line) => !/^\s*(\*|\/\/)/.test(line))
			.filter((line) => line.includes("window.location.reload"))
		expect(reloads.length).toBeGreaterThan(0)
		// Sempre numa linha de `onClick`: é o usuário quem decide perder o que está na tela.
		expect(
			reloads.filter((line) => !line.includes("onClick")),
			"recarga automática apaga o formulário que este fluxo existe para preservar"
		).toEqual([])
	})

	test("a sessão nova é adotada em memória, não por recarga", () => {
		expect(dialogSource).toContain("syncElevatedSession(supabase.auth)")
	})
})

describe("o motivo da operação é visível", () => {
	test("o modal renderiza o `reason` que veio do servidor", () => {
		expect(dialogSource).toContain("{prompt.reason}")
	})

	test("o reenvio usa o payload original, pelo núcleo testado", () => {
		expect(hookSource).toContain("runWithElevation")
	})
})
