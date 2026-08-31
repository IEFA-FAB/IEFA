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

// A fonte do Google não carrega offline; qualquer outro erro é do componente.
const real = problems.filter((p) => !p.includes("ERR_NAME_NOT_RESOLVED"))
process.stdout.write(real.length ? `ERROS:\n${real.join("\n")}\n` : "sem erros de console\n")
await browser.close()
