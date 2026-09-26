import { expect, type Page } from "@playwright/test"
import { createE2EServiceClient } from "./service"

/**
 * Cenário comum das specs de planejamento da contratação, na sentinela do treino: um cardápio
 * semanal de teste com "Frango Ensopado com Legumes" (insumos com item de compra e CATMAT) para
 * 100 comensais na segunda-feira. Montado com a chave de serviço; a AÇÃO testada é sempre pela tela.
 */
export async function seedWeeklyTemplate(kitchenId: number, name: string): Promise<string> {
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
		.insert({ name, kitchen_id: kitchenId, template_type: "weekly" })
		.select("id")
		.single()
	if (tError) throw new Error(tError.message)

	const { error: iError } = await db.from("menu_template_items").insert({
		menu_template_id: template.id,
		day_of_week: 1,
		meal_type_id: mealTypes[0].id,
		recipe_id: recipes[0].id,
		headcount_override: 100,
	})
	if (iError) throw new Error(iError.message)
	return template.id as string
}

export async function deleteTemplate(templateId: string | null): Promise<void> {
	if (!templateId) return
	const db = createE2EServiceClient()
	const items = await db.from("menu_template_items").delete().eq("menu_template_id", templateId)
	if (items.error) throw new Error(`limpeza dos itens do cardápio: ${items.error.message}`)
	const template = await db.from("menu_template").delete().eq("id", templateId)
	if (template.error) throw new Error(`limpeza do cardápio: ${template.error.message}`)
}

/**
 * Apaga linhas de `procurement` da sentinela. O salvamento que a tela disparou pode ainda estar em
 * voo: deadlock aqui é concorrência com ele, não erro da limpeza, então tenta de novo.
 */
export async function deleteProcurementRows(table: "procurement_list" | "procurement_segment", ids: readonly string[]): Promise<void> {
	if (ids.length === 0) return
	const db = createE2EServiceClient()
	let lastError: string | null = null
	for (let attempt = 0; attempt < 5; attempt++) {
		const result = await db.schema("procurement").from(table).delete().in("id", ids)
		lastError = result.error?.message ?? null
		if (!lastError) return
		await new Promise((resolve) => setTimeout(resolve, 2_000))
	}
	throw new Error(`limpeza de ${table}: ${lastError}`)
}

/** O aviso de documentos legais é fixo no rodapé e cobre os botões enquanto pendente. */
export async function dismissLegalNotice(page: Page): Promise<void> {
	const legalNotice = page.getByRole("region", { name: "Aviso sobre documentos legais" })
	if (await legalNotice.isVisible().catch(() => false)) {
		await legalNotice.getByRole("button", { name: "Estou ciente" }).click()
		await expect(legalNotice).toBeHidden()
	}
}
