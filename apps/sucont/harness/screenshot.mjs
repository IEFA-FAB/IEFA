/**
 * Captura o harness nos dois temas. Requer o preview servindo em :4180
 * (`bun run harness:serve`).
 *
 * Usa `fullPage` + `clip` em vez de `element.screenshot()`: o Playwright
 * redimensiona o viewport para caber um elemento mais alto que a tela, e como o
 * harness usa `min-h-screen` o layout reflui de verdade — a captura mostrava
 * cards empilhados que na página estão em grade.
 */
import { chromium } from "@playwright/test"

const OUT = process.argv[2] ?? "/tmp"
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })

const problems = []
page.on("console", (m) => m.type() === "error" && problems.push(m.text()))
page.on("pageerror", (e) => problems.push(String(e)))

await page.goto("http://localhost:4180/", { waitUntil: "networkidle" })
await page.waitForTimeout(2500)

const shot = async (locator, path) => {
	const box = await locator.boundingBox()
	if (!box || box.height < 1) return
	await page.screenshot({ path, fullPage: true, clip: box })
}

for (const theme of ["light", "dark"]) {
	const root = page.locator(`[data-theme="${theme}"]`)
	await shot(root, `${OUT}/auditor-${theme}.png`)
	for (const panel of await root.locator("[data-panel]").all()) {
		const name = (await panel.getAttribute("data-panel")).split(" ")[0]
		await shot(panel, `${OUT}/${theme}-${name}.png`)
	}
}

// ── Casca do hub ──────────────────────────────────────────────────────────────
// Página separada (`/hub.html`), e os dois temas por navegação: diferente do
// harness do auditor, que monta as duas árvores lado a lado, a casca é
// `min-h-screen` com barra lateral fixa e não cabe duplicada na mesma página.
// A classe entra DEPOIS do load — aplicá-la antes, por `addInitScript`, não
// sobrevive à navegação.
await page.goto("http://localhost:4180/hub.html", { waitUntil: "networkidle" })
await page.waitForTimeout(1200)
await page.screenshot({ path: `${OUT}/hub-light.png` })
await page.evaluate(() => document.documentElement.classList.add("dark"))
await page.waitForTimeout(600)
await page.screenshot({ path: `${OUT}/hub-dark.png` })

// ── Seletor de módulo e o módulo `admin` ─────────────────────────────────────
// O caminho é percorrido de verdade — abrir o menu e clicar — porque é o que a
// captura precisa provar: que o item existe, que a barra lateral TROCA de
// conteúdo e que a tela do outro módulo usa a mesma casca.
await page.evaluate(() => document.documentElement.classList.remove("dark"))
await page.waitForTimeout(300)
const switcher = () => page.getByRole("button", { name: /Módulo atual/ })
await switcher().click()
await page.waitForTimeout(500)
await page.screenshot({ path: `${OUT}/hub-module-menu.png` })

// Cada divisão tem catálogo e barra lateral próprios: a captura prova que trocar
// de módulo troca as ferramentas, e não só o rótulo do cabeçalho.
for (const [nome, arquivo] of [
	["SUCONT-3", "catalogo-sucont-3"],
	["SUCONT-1", "catalogo-sucont-1"],
]) {
	await page.getByRole("menuitem", { name: new RegExp(`^${nome}`) }).click()
	await page.waitForTimeout(700)
	await page.screenshot({ path: `${OUT}/${arquivo}.png` })
	await switcher().click()
	await page.waitForTimeout(400)
}

await page.getByRole("menuitem", { name: /Administração/ }).click()
await page.waitForTimeout(800)
await page.screenshot({ path: `${OUT}/admin-permissoes-light.png` })
await page.evaluate(() => document.documentElement.classList.add("dark"))
await page.waitForTimeout(600)
await page.screenshot({ path: `${OUT}/admin-permissoes-dark.png` })

// ── Tela inicial de análise ──────────────────────────────────────────────────
// A composição que as sete ferramentas montam: zona de envio, onde extrair o
// relatório, referencial do RAC e cartões de apoio, nessa ordem. É a captura que
// mostra a borda tracejada e as superfícies nos dois temas — nenhum check
// enxerga uma zona de envio que sumiu contra o fundo escuro.
await page.evaluate(() => document.documentElement.classList.remove("dark"))
await page.goto("http://localhost:4180/hub.html", { waitUntil: "networkidle" })
await page.waitForTimeout(1200)
// O módulo padrão do harness é a SUCONT-4; o Monitoramento Patrimonial é a
// ferramenta dela que abre por planilha.
await page.getByRole("link", { name: "Monitoramento Patrimonial" }).first().click()
await page.waitForTimeout(900)
await page.screenshot({ path: `${OUT}/analise-inicio-light.png`, fullPage: true })
await page.evaluate(() => document.documentElement.classList.add("dark"))
await page.waitForTimeout(600)
await page.screenshot({ path: `${OUT}/analise-inicio-dark.png`, fullPage: true })

// A fonte do Google não carrega offline; qualquer outro erro é do componente.
const real = problems.filter((p) => !p.includes("ERR_NAME_NOT_RESOLVED"))
process.stdout.write(real.length ? `ERROS:\n${real.join("\n")}\n` : "sem erros de console\n")
await browser.close()
