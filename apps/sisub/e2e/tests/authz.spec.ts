import { expect, request, test } from "@playwright/test";

/**
 * Autorização no TRANSPORTE — o teste que os testes unitários não conseguem fazer.
 *
 * O contrato estático (`src/server/server-fn-auth.contract.test.ts`) garante que existe
 * uma chamada de guard no código. Isto aqui garante o efeito: que o endpoint
 * `/_serverFn/<id>` REALMENTE responde 401 sem sessão. É a diferença entre "o guard
 * está escrito" e "o guard funciona" — e é exatamente onde o `beforeLoad` da rota
 * engana: ele protege a navegação, não o endpoint.
 *
 * Estratégia: navegar autenticado, capturar as URLs de server fn que a aplicação de
 * fato chama, e reproduzi-las num contexto SEM cookie. Os ids das server fns são
 * gerados no build — capturá-los em tempo de execução evita uma lista hardcoded que
 * envelhece no primeiro refactor.
 *
 * Só GETs são reproduzidos: repetir um POST executaria uma escrita de verdade.
 */

/** Rotas autenticadas que, juntas, exercitam um bom número de server fns. */
const ROUTES_TO_HARVEST = ["/hub", "/diner/profile", "/diner/forecast"];

/** Endpoints públicos por contrato — ver PUBLIC_SERVER_FNS em server-fn-auth.contract.test.ts. */
const EXPECTED_PUBLIC_RESPONSES = new Set([200, 204]);

type Harvested = { url: string; from: string };

test.describe("Autorização — server functions exigem sessão", () => {
	test("nenhuma server fn GET responde 200 sem sessão", async ({ page, baseURL }) => {
		const harvested: Harvested[] = [];

		page.on("request", (req) => {
			if (req.method() !== "GET") return;
			if (!req.url().includes("/_serverFn/")) return;
			harvested.push({ url: req.url(), from: page.url() });
		});

		for (const route of ROUTES_TO_HARVEST) {
			await page.goto(route);
			// networkidle e não load: as server fns saem depois da hidratação.
			await page.waitForLoadState("networkidle").catch(() => {
				/* rota lenta não invalida o que já foi capturado */
			});
		}

		const unique = [...new Map(harvested.map((h) => [h.url, h])).values()];

		// Sem captura, o teste passaria vazio e daria uma falsa sensação de cobertura.
		expect(unique.length, "nenhuma chamada de server fn capturada — a sessão do storageState expirou?").toBeGreaterThan(0);

		// Contexto novo, sem storageState: nenhum cookie de sessão.
		const anonymous = await request.newContext({ baseURL, storageState: { cookies: [], origins: [] } });

		const leaked: string[] = [];
		try {
			for (const { url } of unique) {
				const response = await anonymous.get(url);
				// 401/403 é o esperado. 404/500 também não vazam dado, mas 200 vaza.
				if (EXPECTED_PUBLIC_RESPONSES.has(response.status())) {
					leaked.push(`${response.status()} ${url}`);
				}
			}
		} finally {
			await anonymous.dispose();
		}

		// Falha listando as URLs — o id da server fn aponta direto para a fn no build.
		expect(leaked, `server fn respondeu com sucesso SEM sessão:\n${leaked.join("\n")}`).toEqual([]);
	});

	test("rota protegida sem sessão redireciona para /auth", async ({ browser }) => {
		const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
		const page = await context.newPage();

		await page.goto("/global/sync-routines");
		await page.waitForURL(/\/auth/, { timeout: 15_000 });

		expect(page.url()).toContain("/auth");
		await context.close();
	});
});
