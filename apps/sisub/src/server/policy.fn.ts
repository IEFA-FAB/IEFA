/**
 * @module policy.fn
 * Wrappers finos sobre as operations de `@iefa/sisub-domain` (Drizzle) + geração do prompt
 * de revisão por IA. As regras vivem em `procurement.policy_rule` (soft-delete via
 * `deleted_at`; alvos: "product" | "recipe") e são catálogo da SDAB: leitura `global:1`,
 * escrita `global:2`.
 *
 * O gate de escrita fica DUPLICADO de propósito: `requireAuthWithPermission("global", 2)`
 * aqui e `requirePermission(ctx, "global", 2)` na operation. O contrato de segurança
 * (`security-contracts.test.ts`) inspeciona este arquivo, e a operation precisa se defender
 * sozinha porque o Drizzle conecta pelo role do projeto e bypassa RLS.
 * @domain app
 * @migration done
 */

import {
	CreatePolicyRuleSchema,
	createPolicyRule,
	DeletePolicyRuleSchema,
	deletePolicyRule,
	ListPolicyRulesSchema,
	listPolicyRules,
	UpdatePolicyRuleSchema,
	updatePolicyRule,
} from "@iefa/sisub-domain"
import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { requireAuth, requireAuthWithPermission } from "@/lib/auth.server"
import { getDb } from "@/lib/db.server"
import { handleDomainError } from "@/lib/domain-errors"
import type { PolicyRule, PolicyTarget } from "@/types/domain/policy"

// ============================================================================
// CRUD
// ============================================================================

/** Lista as regras ativas e inativas de um alvo, ordenadas por display_order e depois created_at. */
export const fetchPolicyRulesFn = createServerFn({ method: "GET" })
	.validator(ListPolicyRulesSchema)
	.handler(async ({ data }): Promise<PolicyRule[]> => {
		const ctx = await requireAuth()
		return listPolicyRules(getDb(), ctx, data).catch(handleDomainError)
	})

/** Cria uma regra de política. `display_order` default 0. */
export const createPolicyRuleFn = createServerFn({ method: "POST" })
	.validator(CreatePolicyRuleSchema)
	.handler(async ({ data }): Promise<PolicyRule> => {
		// Regras de política são do catálogo da SDAB — `requireAuth()` sozinho deixava
		// qualquer sessão válida criar, alterar e apagar regra de revisão.
		const ctx = await requireAuthWithPermission("global", 2)
		return createPolicyRule(getDb(), ctx, data).catch(handleDomainError)
	})

/** Patch de título, descrição, ordem ou flag `active` — só os campos enviados mudam. */
export const updatePolicyRuleFn = createServerFn({ method: "POST" })
	.validator(UpdatePolicyRuleSchema)
	.handler(async ({ data }): Promise<PolicyRule> => {
		const ctx = await requireAuthWithPermission("global", 2)
		return updatePolicyRule(getDb(), ctx, data).catch(handleDomainError)
	})

/** Soft-delete: carimba `deleted_at`. Regra já excluída (ou inexistente) falha como não encontrada. */
export const deletePolicyRuleFn = createServerFn({ method: "POST" })
	.validator(DeletePolicyRuleSchema)
	.handler(async ({ data }): Promise<void> => {
		const ctx = await requireAuthWithPermission("global", 2)
		return deletePolicyRule(getDb(), ctx, data).catch(handleDomainError)
	})

// ============================================================================
// Geração de Prompt de Revisão
// ============================================================================

/**
 * Gera um prompt de revisão em markdown com as regras ATIVAS do alvo e as dicas de tabela do MCP.
 *
 * @remarks
 * O prompt instrui o modelo a buscar os itens ativos pelo MCP do Supabase, avaliar cada um contra
 * todas as regras e reportar PASSA/FALHA por regra, com veredito final APROVADO/REPROVADO.
 * As dicas de tabela dependem do alvo: product → sisub.ingredient; recipe → sisub.recipes + joins.
 * Sem regra ativa devolve uma mensagem em texto (não lança). A data de geração vai no rodapé.
 */
export const generateReviewPromptFn = createServerFn({ method: "GET" })
	.validator(z.object({ target: z.enum(["product", "recipe"]) }))
	.handler(async ({ data }): Promise<string> => {
		const ctx = await requireAuth()
		const target: PolicyTarget = data.target

		// Só as regras ativas — os itens serão buscados pelo modelo via MCP.
		const rules = await listPolicyRules(getDb(), ctx, { target, activeOnly: true }).catch(handleDomainError)

		if (rules.length === 0) {
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
