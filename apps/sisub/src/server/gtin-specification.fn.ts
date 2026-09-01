/**
 * @module gtin-specification.fn
 * Conformidade de um GTIN contra a especificação de compra, no vocabulário GPC.
 *
 * A verificação de verdade é da API da GS1 (tratativa em curso). Aqui fica o
 * consumo da PORTA (`@iefa/sisub-domain` operations/gs1-specification): hoje o
 * verificador local compara a declaração já registrada em
 * `gs1_integration.gtin_gpc_attribute`; quando a API entrar, troca-se a
 * implementação sem mexer em quem chama.
 *
 * O veredito é GRAVADO com a impressão digital da exigência vigente. Sem isso,
 * mudar a especificação deixaria vereditos velhos com cara de válidos.
 *
 * ATENÇÃO ao expor isto: valida a DECLARAÇÃO do fornecedor, nunca o produto
 * físico. Quem confirma é a conferência no recebimento.
 *
 * CLIENT: getServerClient (service role, schemas gs1_integration/procurement).
 * AUTH: `global` nível 1 (leitura do catálogo de compras).
 * @domain procurement
 * @migration 20260901120300_gs1_specification_check
 */

import { createLocalVerifier, type GpcRequirement, isVerdictStale, normalizeGtin, specFingerprint } from "@iefa/sisub-domain/operations"
import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { requireAuthWithPermission } from "@/lib/auth.server"
import { getServerClient } from "@/lib/supabase.server"

// biome-ignore lint/suspicious/noExplicitAny: tabelas de gs1_integration fora dos tipos gerados até o regen pós-migration
type LooseClient = { from: (table: string) => any }

const gs1 = () => getServerClient("gs1_integration") as unknown as LooseClient
const procurement = () => getServerClient("procurement") as unknown as LooseClient

/** Exigência da especificação, já no formato do domínio. */
async function loadRequirements(purchaseItemId: string): Promise<GpcRequirement[]> {
	const { data, error } = await procurement()
		.from("purchase_item_gpc_requirement")
		.select("attribute_code, accepted_value_codes")
		.eq("purchase_item_id", purchaseItemId)
	if (error) throw new Error(`Erro ao carregar exigências: ${error.message}`)

	const rows = (data ?? []) as Array<{ attribute_code: string; accepted_value_codes: string[] }>
	if (rows.length === 0) return []

	// Título só para a mensagem — o veredito não depende dele.
	const { data: attributes } = await gs1()
		.from("gpc_attribute")
		.select("attribute_code, attribute_title")
		.in(
			"attribute_code",
			rows.map((row) => row.attribute_code)
		)
	const titleByCode = new Map<string, string>()
	for (const attribute of (attributes ?? []) as Array<{ attribute_code: string; attribute_title: string }>) {
		titleByCode.set(attribute.attribute_code, attribute.attribute_title)
	}

	return rows.map((row) => ({
		attributeCode: row.attribute_code,
		attributeTitle: titleByCode.get(row.attribute_code) ?? null,
		acceptedValueCodes: row.accepted_value_codes ?? [],
	}))
}

/**
 * Verifica um GTIN contra um item de compra.
 *
 * Reaproveita o veredito gravado quando a impressão digital da exigência não
 * mudou. `force` refaz mesmo assim — é o que a tela usa depois de o fornecedor
 * corrigir a declaração.
 */
export const verifyGtinAgainstPurchaseItemFn = createServerFn({ method: "POST" })
	.validator(
		z.object({
			gtin: z.string().min(8).max(14),
			purchaseItemId: z.string().uuid(),
			force: z.boolean().optional(),
		})
	)
	.handler(async ({ data }) => {
		const { userId } = await requireAuthWithPermission("global", 1)

		const gtin = normalizeGtin(data.gtin)
		if (!gtin) throw new Error("GTIN inválido")

		const requirements = await loadRequirements(data.purchaseItemId)
		const fingerprint = specFingerprint(requirements)

		if (!data.force) {
			const { data: cached } = await gs1()
				.from("v_gtin_specification_latest")
				.select("verdict, divergences, source, spec_fingerprint, checked_at")
				.eq("gtin", gtin)
				.eq("purchase_item_id", data.purchaseItemId)
				.maybeSingle()
			if (cached && !isVerdictStale(cached.spec_fingerprint, fingerprint)) {
				return { ...cached, gtin, purchase_item_id: data.purchaseItemId, cached: true }
			}
		}

		const verifier = createLocalVerifier(async (code) => {
			const { data: declared } = await gs1()
				.from("gtin_gpc_attribute")
				.select("attribute_code, value_code, gpc_attribute_value:value_code (value_title)")
				.eq("gtin", code)
			return ((declared ?? []) as Array<{ attribute_code: string; value_code: string; gpc_attribute_value?: { value_title?: string } | null }>).map((row) => ({
				attributeCode: row.attribute_code,
				valueCode: row.value_code,
				valueTitle: row.gpc_attribute_value?.value_title ?? null,
			}))
		})

		const result = await verifier.verify({ gtin, purchaseItemId: data.purchaseItemId, requirements })

		const { error } = await gs1().from("gtin_specification_check").insert({
			gtin,
			purchase_item_id: data.purchaseItemId,
			verdict: result.verdict,
			divergences: result.divergences,
			source: result.source,
			spec_fingerprint: result.specFingerprint,
			checked_by: userId,
		})
		if (error) throw new Error(`Erro ao registrar veredito: ${error.message}`)

		return {
			gtin,
			purchase_item_id: data.purchaseItemId,
			verdict: result.verdict,
			divergences: result.divergences,
			source: result.source,
			spec_fingerprint: result.specFingerprint,
			checked_at: new Date().toISOString(),
			cached: false,
		}
	})

/** Exigências declaradas de um item de compra (tela de especificação). */
export const listPurchaseItemRequirementsFn = createServerFn({ method: "GET" })
	.validator(z.object({ purchaseItemId: z.string().uuid() }))
	.handler(async ({ data }) => {
		await requireAuthWithPermission("global", 1)
		return await loadRequirements(data.purchaseItemId)
	})
