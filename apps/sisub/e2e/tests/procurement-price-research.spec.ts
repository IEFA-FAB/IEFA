import { expect as baseExpect, test } from "../fixtures/auth"
import { waitForHydration } from "../helpers/fill-react-input"
import { createE2EServiceClient } from "../helpers/service"

/**
 * Pesquisa de preços no anexo quantitativo, pela tela: o preço de cada amostra é convertido para a
 * unidade de compra do item antes da estatística, a média não passa da mediana e o preço só entra
 * no anexo com a memória de cálculo gravada.
 *
 * ESCREVE na OM e na cozinha sentinelas do treino (`E2E_BUDGET_UNIT_ID`, `E2E_KITCHEN_ID`). O
 * cardápio semanal de teste é montado com a chave de serviço e desmontado no fim, junto com o
 * rascunho de anexo que o wizard cria. Consulta a API pública do Compras.gov.br de verdade.
 */
const UNIT_ID = Number(process.env.E2E_BUDGET_UNIT_ID ?? 0)
const KITCHEN_ID = Number(process.env.E2E_KITCHEN_ID ?? process.env.E2E_STORAGE_KITCHEN_ID ?? 0)
const RUN = `E2E ${Date.now().toString(36)}`

let templateId: string | null = null
/** Rascunho que o wizard criou nesta execução (lido da URL): a limpeza apaga só ele. */
let draftId: string | null = null

test.describe.configure({ mode: "serial" })
test.use({ actionTimeout: 30_000 })
// Vite frio + a consulta de todas as páginas do CATMAT na API pública.
test.setTimeout(300_000)
const expect = baseExpect.configure({ timeout: 30_000 })

test.describe("Anexo quantitativo — pesquisa de preços", () => {
	test.skip(!UNIT_ID || !KITCHEN_ID, "E2E_BUDGET_UNIT_ID/E2E_KITCHEN_ID ausentes: esta spec escreve e só roda na sentinela do treino")

	test.beforeAll(async () => {
		const db = createE2EServiceClient()

		const { data: mealTypes, error: mtError } = await db
			.from("meal_type")
			.select("id")
			.is("kitchen_id", null)
			.is("deleted_at", null)
			.is("system_key", null)
			.ilike("name", "almo%")
			.limit(1)
		if (mtError || !mealTypes?.[0]) throw new Error(`tipo de refeição "almoço" global não encontrado: ${mtError?.message}`)

		// Preparação global cujos insumos têm item de compra com CATMAT (o menu "Pesquisar preço" só
		// aparece em item com CATMAT).
		const { data: recipes, error: rError } = await db
			.from("recipes")
			.select("id")
			.is("kitchen_id", null)
			.is("deleted_at", null)
			.ilike("name", "Frango Ensopado com Legumes%")
			.limit(1)
		if (rError || !recipes?.[0]) throw new Error(`preparação de teste não encontrada: ${rError?.message}`)

		const { data: template, error: tError } = await db
			.from("menu_template")
			.insert({ name: `${RUN} Semana`, kitchen_id: KITCHEN_ID, template_type: "weekly" })
			.select("id")
			.single()
		if (tError) throw new Error(tError.message)
		templateId = template.id as string

		const { error: iError } = await db.from("menu_template_items").insert({
			menu_template_id: templateId,
			day_of_week: 1,
			meal_type_id: mealTypes[0].id,
			recipe_id: recipes[0].id,
			headcount_override: 100,
		})
		if (iError) throw new Error(iError.message)
	})

	test.afterAll(async () => {
		const db = createE2EServiceClient()
		// O salvamento do rascunho que a tela disparou pode ainda estar em voo: deadlock aqui é
		// concorrência com ele, não erro da limpeza. Tenta de novo algumas vezes. A pesquisa de preço
		// ligada ao rascunho cai junto (ON DELETE CASCADE).
		if (draftId) {
			let lastError: string | null = null
			for (let attempt = 0; attempt < 5; attempt++) {
				const lists = await db.schema("procurement").from("procurement_list").delete().eq("id", draftId).eq("unit_id", UNIT_ID)
				lastError = lists.error?.message ?? null
				if (!lastError) break
				await new Promise((resolve) => setTimeout(resolve, 2_000))
			}
			if (lastError) throw new Error(`limpeza do anexo: ${lastError}`)
		}
		if (templateId) {
			const items = await db.from("menu_template_items").delete().eq("menu_template_id", templateId)
			if (items.error) throw new Error(`limpeza dos itens do cardápio: ${items.error.message}`)
			const template = await db.from("menu_template").delete().eq("id", templateId)
			if (template.error) throw new Error(`limpeza do cardápio: ${template.error.message}`)
		}
	})

	test("converte as embalagens para a unidade do item e só aplica o preço com memória de cálculo", async ({ authenticatedPage: page }) => {
		await page.goto(`/unit/${UNIT_ID}/procurement/new`)
		await waitForHydration(page, `[id="template-${templateId}"]`)
		// O wizard cria o rascunho ao entrar e grava o id na URL.
		await page.waitForURL(/draft=/)
		draftId = new URL(page.url()).searchParams.get("draft")

		// O aviso de documentos legais é fixo no rodapé e cobre os botões do wizard enquanto pendente.
		const legalNotice = page.getByRole("region", { name: "Aviso sobre documentos legais" })
		if (await legalNotice.isVisible().catch(() => false)) {
			await legalNotice.getByRole("button", { name: "Estou ciente" }).click()
			await expect(legalNotice).toBeHidden()
		}

		// O id do Checkbox do Base UI fica no input escondido; o clique vai pelo rótulo, como o usuário faz.
		await page.locator(`label[for="template-${templateId}"]`).click()
		await expect(page.getByRole("checkbox", { checked: true })).toHaveCount(1)
		await page.getByRole("button", { name: /Próximo: Eventos/ }).click()
		await page.getByRole("button", { name: /Próximo: Apoios/ }).click()
		await page.getByRole("button", { name: /Próximo: Resumo/ }).click()
		await page.getByRole("button", { name: /Calcular Lista/ }).click()

		await expect(page.getByText(/itens vinculados a um item de compra/)).toBeVisible()

		// Item de mercado amplo (peito de frango, comprado a quilo): menu de ações → Pesquisar preço.
		await page
			.getByRole("row", { name: /Filé de Peito de Frango/ })
			.getByRole("button", { name: "Ações" })
			.click()
		await page.getByRole("menuitem", { name: "Pesquisar preço" }).click()

		const dialog = page.getByRole("dialog")
		await expect(dialog.getByText(/Pesquisa de Preço — CATMAT/)).toBeVisible()
		// A coluna convertida existe e a análise declara a unidade em que compara os preços.
		await expect(dialog.getByRole("button", { name: /^Preço \/ KG/ })).toBeVisible({ timeout: 90_000 })
		await expect(dialog.getByText(/preços por/)).toBeVisible()
		// Não existe mais "Usar" por linha: o preço sai sempre da estatística registrada.
		await expect(dialog.getByRole("row").nth(1).getByRole("button", { name: "Usar" })).toHaveCount(0)

		const useMedian = dialog
			.locator("div", { has: page.getByText("Mediana", { exact: true }) })
			.getByRole("button", { name: "Usar" })
			.last()
		await useMedian.click()
		await expect(dialog).toBeHidden()

		// O preço aplicado aparece na linha do item e o rascunho termina de salvar antes da limpeza.
		await expect(
			page
				.getByRole("row", { name: /Filé de Peito de Frango/ })
				.getByRole("cell", { name: /R\$\s?\d/ })
				.first()
		).toBeVisible()
		await page.waitForLoadState("networkidle")
	})
})
