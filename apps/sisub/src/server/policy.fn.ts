/**
 * @module policy.fn
 * Policy rule CRUD and AI review prompt generation for product and recipe quality control.
 * CLIENT: getSupabaseServerClient (service role) — all functions.
 * TABLE: policy_rule (soft-delete via deleted_at). Targets: "product" | "recipe".
 */

import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { getSupabaseServerClient } from "@/lib/supabase.server"
import type { PolicyRule, PolicyTarget } from "@/types/domain/policy"

// ============================================================================
// CRUD
// ============================================================================

/**
 * Lists active policy rules for a target type ordered by display_order then created_at.
 *
 * @throws {Error} on Supabase query failure.
 */
export const fetchPolicyRulesFn = createServerFn({ method: "GET" })
	.inputValidator(z.object({ target: z.enum(["product", "recipe"]) }))
	.handler(async ({ data }): Promise<PolicyRule[]> => {
		const { data: result, error } = await getSupabaseServerClient()
			.from("policy_rule")
			.select("*")
			.eq("target", data.target)
			.is("deleted_at", null)
			.order("display_order", { ascending: true })
			.order("created_at", { ascending: true })

		if (error) throw new Error(error.message)
		return (result ?? []) as PolicyRule[]
	})

/**
 * Creates a policy rule for a target type. display_order defaults to 0.
 *
 * @remarks
 * SIDE EFFECTS: inserts into policy_rule.
 *
 * @throws {Error} on Supabase insert failure.
 */
export const createPolicyRuleFn = createServerFn({ method: "POST" })
	.inputValidator(
		z.object({
			target: z.enum(["product", "recipe"]),
			title: z.string().min(3, "Mínimo de 3 caracteres"),
			description: z.string().min(10, "Mínimo de 10 caracteres"),
			display_order: z.number().int().min(0).optional(),
		})
	)
	.handler(async ({ data }): Promise<PolicyRule> => {
		const { data: result, error } = await getSupabaseServerClient()
			.from("policy_rule")
			.insert({
				target: data.target,
				title: data.title,
				description: data.description,
				display_order: data.display_order ?? 0,
			})
			.select("*")
			.single()

		if (error) throw new Error(error.message)
		return result as PolicyRule
	})

/**
 * Patches a policy rule's title, description, display_order or active flag — only provided fields are updated.
 *
 * @remarks
 * SIDE EFFECTS: updates policy_rule + stamps updated_at. Guards against updating soft-deleted rules (IS deleted_at NULL).
 *
 * @throws {Error} on Supabase update failure or not found.
 */
export const updatePolicyRuleFn = createServerFn({ method: "POST" })
	.inputValidator(
		z.object({
			id: z.string().uuid(),
			title: z.string().min(3).optional(),
			description: z.string().min(10).optional(),
			display_order: z.number().int().min(0).optional(),
			active: z.boolean().optional(),
		})
	)
	.handler(async ({ data }): Promise<PolicyRule> => {
		const { id, ...fields } = data

		const payload = {
			updated_at: new Date().toISOString(),
			...(fields.title !== undefined && { title: fields.title }),
			...(fields.description !== undefined && { description: fields.description }),
			...(fields.display_order !== undefined && { display_order: fields.display_order }),
			...(fields.active !== undefined && { active: fields.active }),
		}

		const { data: result, error } = await getSupabaseServerClient().from("policy_rule").update(payload).eq("id", id).is("deleted_at", null).select("*").single()

		if (error) throw new Error(error.message)
		return result as PolicyRule
	})

/**
 * Soft-deletes a policy rule by setting deleted_at. Guards against double-deletion via IS(deleted_at, null).
 *
 * @throws {Error} on Supabase update failure.
 */
export const deletePolicyRuleFn = createServerFn({ method: "POST" })
	.inputValidator(z.object({ id: z.string().uuid() }))
	.handler(async ({ data }): Promise<void> => {
		const { error } = await getSupabaseServerClient()
			.from("policy_rule")
			.update({ deleted_at: new Date().toISOString() })
			.eq("id", data.id)
			.is("deleted_at", null)

		if (error) throw new Error(error.message)
	})

// ============================================================================
// Geração de Prompt de Revisão
// ============================================================================

/**
 * Generates a structured markdown review prompt for Claude containing active policy rules and MCP database hints.
 *
 * @remarks
 * Prompt instructs the LLM to fetch all active items via Supabase MCP, evaluate each against every rule,
 * and report PASSA/FALHA per rule with a final APROVADO/REPROVADO verdict.
 * Table hints are target-specific: product → sisub.ingredient; recipe → sisub.recipes + joins.
 * Returns a plain-language message (not throw) if no active rules exist for the target.
 * Generated date is embedded in the prompt footer.
 *
 * @throws {Error} on Supabase query failure.
 */
export const generateReviewPromptFn = createServerFn({ method: "GET" })
	.inputValidator(z.object({ target: z.enum(["product", "recipe"]) }))
	.handler(async ({ data }): Promise<string> => {
		const supabase = getSupabaseServerClient()
		const target: PolicyTarget = data.target

		// Busca apenas as regras ativas — os itens serão buscados pelo Claude via MCP
		const { data: rules, error: rulesError } = await supabase
			.from("policy_rule")
			.select("title, description")
			.eq("target", target)
			.is("deleted_at", null)
			.eq("active", true)
			.order("display_order", { ascending: true })

		if (rulesError) throw new Error(rulesError.message)

		if (!rules || rules.length === 0) {
			return `Nenhuma regra de política ativa encontrada para ${target === "product" ? "insumos" : "preparações"}.`
		}

		const targetLabel = target === "product" ? "Insumos" : "Preparações"
		const itemLabel = target === "product" ? "insumo" : "preparação"
		const tableHint =
			target === "product"
				? "tabela `sisub.ingredient` (campos relevantes: id, description, measure_unit, correction_factor, catmat_item_descricao) — filtre por `deleted_at IS NULL`"
				: "tabela `sisub.recipes` com join em `sisub.recipe_ingredients` → `sisub.ingredient` (campos: id, name, preparation_method, portion_yield, preparation_time_minutes, ingredientes) — filtre por `deleted_at IS NULL` e `kitchen_id IS NULL` (somente globais)"

		const rulesText = rules.map((r, i) => `${i + 1}. **${r.title}**: ${r.description}`).join("\n")

		return `## Revisão de ${targetLabel} — Sistema sisub / FAB

Você é um revisor de cadastro do sistema de gestão de alimentação (sisub) da Força Aérea Brasileira (FAB).
Você tem acesso ao banco de dados via MCP do Supabase. Use-o para buscar os itens e avaliá-los um a um.

---

### Contexto

Os **${targetLabel.toLowerCase()}** são cadastrados globalmente pela SDAB e devem obedecer às regras de política abaixo.
Sua tarefa é revisar **todos os ${itemLabel.toLowerCase()}s ativos** do banco e identificar quais falham em alguma regra.

**De onde buscar os dados:** ${tableHint}

---

### Regras de Política

${rulesText}

---

### Como avaliar cada item

Para **cada ${itemLabel}** retornado pela query, avalie todas as regras e retorne:

1. Uma linha por regra: \`[nº] PASSA\` ou \`[nº] FALHA — <justificativa em 1 linha>\`
2. Veredito final: **APROVADO** (passou em todas) ou **REPROVADO** (falhou em ao menos uma)
3. Para cada falha, se aplicável, uma sugestão de correção no formato \`[Sugestão: ...]\`

### Restrições obrigatórias

- **Não sugira a exclusão de nenhum item** — apenas identifique falhas. A exclusão é responsabilidade do operador via \`soft_delete\` (campo \`deleted_at\`).
- **Não proponha alterações que descaracterizem completamente o item** — corrigir nome ou descrição é permitido; transformar "arroz branco" em "macarrão ao molho" não é.
- Processe os itens **um a um**, buscando do banco em lotes se necessário para não sobrecarregar o contexto.

---

*Gerado em ${new Date().toLocaleDateString("pt-BR")} — ${rules.length} regras ativas para ${targetLabel.toLowerCase()}*`
	})
