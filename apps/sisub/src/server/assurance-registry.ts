/**
 * @module assurance-registry
 * Fonte ÚNICA da classificação de garantia de identidade das server functions de mutação.
 *
 * Toda `createServerFn({ method: "POST" })` de `src/server/*.fn.ts` tem aqui uma entrada.
 * `assurance-registry.contract.test.ts` varre o diretório e reprova a suíte quando alguma
 * fica de fora — classificação esquecida é operação sensível sem piso, e ela não avisa.
 *
 * ## Os dois graus (design.md D2)
 *
 * | Grau      | Regra                                                | Custo para o usuário            |
 * |-----------|------------------------------------------------------|---------------------------------|
 * | `session` | a sessão precisa estar em AAL2                        | digitou uma vez no login        |
 * | `fresh`   | AAL2 **e** segundo fator verificado há no máximo 15min | um modal de 6 dígitos na ação   |
 *
 * Um grau único ("toda operação sensível pede código fresco") transformaria o operador de
 * liquidação que trabalha 4 horas seguidas em alguém que digita 6 dígitos umas 16 vezes por
 * turno — ele deixaria o aplicativo aberto ao lado do teclado e o controle viraria teatro.
 * Por isso `fresh` só no que é raro e irreversível, e `session` no que é sensível e de volume.
 *
 * ## Este registro é inerte nesta etapa
 *
 * Nada aqui é consultado por nenhum guard ainda (isso é a etapa 4 do plano). O registro entra
 * primeiro, sozinho, porque ele é o que a auditoria de operações sensíveis e o cálculo de conta
 * protegida consomem — e porque rollback de piso é zerar entrada, sem migration e sem deploy.
 *
 * ## Por que `authorization` mora aqui
 *
 * "Quais contas alcançam operação sensível" (design.md D9) é DERIVADO deste registro, não uma
 * segunda lista: duas listas sobre o mesmo assunto se contradizem em silêncio. Cada operação
 * classificada declara o requisito de autorização que a fn aplica HOJE — lido do código dela,
 * não do que seria desejável — e `assuranceReachability()` projeta isso em pares (módulo, nível)
 * que `isProtectedAccount` de `@iefa/pbac` consome.
 *
 * @domain app
 */

import type { AssuranceReachability } from "@iefa/pbac"
import type { AppModule } from "@iefa/sisub-domain/types"

/** Grau de garantia de identidade exigido por uma operação. */
export type AssuranceLevel = "none" | "session" | "fresh"

/**
 * Requisito de autorização que a server function aplica hoje.
 *
 * As três formas existem porque as três estão no código, e achatá-las em "módulo + nível"
 * obrigaria a INVENTAR um gate onde não há — e a derivação de conta protegida passaria a
 * mentir sobre o que o app faz.
 */
export type AssuranceAuthorization =
	/** Exige módulo + nível do PBAC. É o único caso que separa uma conta de outra. */
	| { kind: "permission"; module: AppModule; level: 1 | 2 | 3 }
	/** Age só sobre a conta do próprio chamador — qualquer sessão alcança, nenhuma se distingue. */
	| { kind: "self"; note: string }
	/** Só exige sessão válida. Sempre dívida: está aqui para ficar visível, não para virar padrão. */
	| { kind: "authenticated"; note: string }

/**
 * `reason` é obrigatório quando há exigência porque é o texto que o usuário LÊ no modal de
 * elevação. Sem ele o modal pediria 6 dígitos sem dizer para quê — e é assim que se treina
 * alguém a digitar código sem ler o motivo, que é o contrário do controle.
 */
export type AssuranceEntry =
	| { require: "none" }
	| {
			require: "session" | "fresh"
			/** Frase em português, exibida no modal de elevação. Descreve a OPERAÇÃO, não a regra. */
			reason: string
			/** O que a fn exige hoje para autorizar. Alimenta `assuranceReachability()`. */
			authorization: readonly AssuranceAuthorization[]
	  }

/**
 * `createMcpKeyFn` cria a chave do PRÓPRIO chamador (`ctx.userId`), e a chave herda as
 * permissões do dono sem ampliar nenhuma. Ela é `fresh` porque uma chave é credencial
 * permanente sem senha e sem segundo fator (design.md D11) — mas não distingue contas:
 * contá-la na derivação de conta protegida tornaria os ~800 comensais "contas protegidas"
 * e esvaziaria o critério.
 */
const SELF_SCOPED_NOTE = "Age apenas sobre a conta do próprio chamador (`ctx.userId`); a chave herda as permissões do dono e não amplia nenhuma."

/**
 * As fns de `arp.fn.ts` chamavam só `requireAuth()` até a correção de autorização que este
 * mesmo levantamento provocou: qualquer sessão autenticada registrava empenho em qualquer
 * unidade e anulava qualquer empenho do sistema. Hoje as quatro exigem `unit` nível 2, e nas
 * que recebem apenas um id (`syncArpBalanceFn`, `anularEmpenhoFn`) a unidade sai da LINHA,
 * nunca do input. O registro grava o que o código faz — e agora o código faz isto.
 */
const ARP_UNIT_SCOPE_NOTE = "Escopo de unidade lido da linha quando o payload só traz um id (`arp.fn.ts`)."

/**
 * Classificação por server function. Entrada nova nasce `{ require: "none" }`; subir o grau é
 * decisão de revisão, com o `reason` que o usuário vai ler.
 *
 * ### Operações classificadas que AINDA NÃO EXISTEM como server function
 *
 * O desenho (D2) lista seis operações `fresh`. Quatro já existem e estão abaixo; duas não têm
 * server function hoje e entram junto com o código que as criar:
 *
 * - **Concessão de acesso a parceiro externo (GS1)** — não é fn própria: o acesso do parceiro é
 *   concedido pelo console de permissões, com prazo (`expires_at`), por `createUserPermissionFn`
 *   / `updateUserPermissionFn`, que já estão classificadas como `fresh`. Se um dia virar fluxo
 *   próprio, a fn nova entra aqui, `fresh`.
 * - **Exportação de dado nominal** — não existe server fn de mutação que exporte dado nominal.
 *   `exportCatmatCsvFn` (`stock-reports.fn.ts`) é GET e exporta catálogo de estoque por CATMAT,
 *   sem pessoa nenhuma. Quando a exportação nominal existir, ela entra aqui como `fresh` — e,
 *   por ser uma ação explícita de exportação, é a exceção prevista em D3 a "só POST é gated".
 * - **Remoção de MFA de terceiro** — a fn de reset administrativo nasce na etapa 7 do plano.
 *   Entrada preparada:
 *   ```ts
 *   resetUserMfaFn: {
 *   	require: "fresh",
 *   	reason: "Esta operação remove o segundo fator de outra pessoa e a desconecta de todas as sessões.",
 *   	authorization: [{ kind: "permission", module: "admin", level: 3 }],
 *   },
 *   ```
 */
export const ASSURANCE_REGISTRY = {
	// ── analytics-chat.fn.ts
	createChatSessionFn: { require: "none" },
	renameChatSessionFn: { require: "none" },
	deleteChatSessionFn: { require: "none" },
	saveChatMessageFn: { require: "none" },
	updateMessageChartTypeFn: { require: "none" },

	// ── arp.fn.ts
	importArpItemsFn: { require: "none" },
	syncArpBalanceFn: { require: "none" },
	createEmpenhoFn: {
		require: "session",
		reason: "Esta operação registra um empenho.",
		authorization: [{ kind: "permission", module: "unit", level: 2 }],
	},
	anularEmpenhoFn: {
		require: "session",
		reason: "Esta operação anula um empenho.",
		authorization: [{ kind: "permission", module: "unit", level: 2, note: ARP_UNIT_SCOPE_NOTE }],
	},

	// ── ata.fn.ts
	calculateAtaNeedsFn: { require: "none" },
	createAtaDraftFn: { require: "none" },
	updateAtaDraftFn: { require: "none" },
	saveAtaDraftItemsFn: { require: "none" },
	finalizeAtaDraftFn: { require: "none" },
	createAtaFn: { require: "none" },
	updateAtaStatusFn: { require: "none" },
	updateAtaItemPricesFn: { require: "none" },
	updateAtaItemDescriptionFn: { require: "none" },
	deleteAtaFn: { require: "none" },

	// ── budget.fn.ts
	applyCreditBatchFn: {
		require: "session",
		reason: "Esta operação aplica um lote de crédito orçamentário.",
		authorization: [{ kind: "permission", module: "unit", level: 2 }],
	},

	// ── compras-sync.fn.ts
	triggerSyncFn: { require: "none" },
	stopSyncFn: { require: "none" },

	// ── empenho.fn.ts
	updateEmpenhoClassificationFn: {
		require: "session",
		reason: "Esta operação altera a classificação orçamentária de um empenho.",
		authorization: [{ kind: "permission", module: "unit", level: 2 }],
	},
	registerEmpenhoEventFn: {
		require: "session",
		reason: "Esta operação registra um evento de empenho (reforço, anulação, cancelamento).",
		authorization: [{ kind: "permission", module: "unit", level: 2 }],
	},
	inscribeRestosAPagarFn: {
		require: "session",
		reason: "Esta operação inscreve empenhos em restos a pagar.",
		authorization: [{ kind: "permission", module: "unit", level: 3 }],
	},

	// ── equipment.fn.ts
	createEquipmentRoleFn: { require: "none" },
	updateEquipmentRoleFn: { require: "none" },
	deleteEquipmentRoleFn: { require: "none" },
	createEquipmentModelFn: { require: "none" },
	updateEquipmentModelFn: { require: "none" },
	deleteEquipmentModelFn: { require: "none" },
	createEquipmentUnitFn: { require: "none" },
	updateEquipmentUnitFn: { require: "none" },
	deleteEquipmentUnitFn: { require: "none" },
	saveRecipeEquipmentFn: { require: "none" },
	setUtensilRoleFn: { require: "none" },
	reportEquipmentIssueFn: { require: "none" },
	updateEquipmentIssueFn: { require: "none" },
	createMaintenancePlanFn: { require: "none" },
	updateMaintenancePlanFn: { require: "none" },
	deleteMaintenancePlanFn: { require: "none" },
	logMaintenanceFn: { require: "none" },

	// ── evaluation.fn.ts
	upsertEvalConfigFn: { require: "none" },
	submitEvaluationFn: { require: "none" },

	// ── forecast.fn.ts
	persistDefaultMessHallFn: { require: "none" },
	upsertForecastFn: { require: "none" },
	deleteForecastFn: { require: "none" },

	// ── frozen_preparation.fn.ts
	createFrozenPreparationFn: { require: "none" },
	updateFrozenPreparationFn: { require: "none" },
	deleteFrozenPreparationFn: { require: "none" },

	// ── gtin-specification.fn.ts
	verifyGtinAgainstPurchaseItemFn: { require: "none" },

	// ── gtin.fn.ts
	attachGtinToIngredientItemFn: { require: "none" },

	// ── ingredients.fn.ts
	setIngredientNutrientsFn: { require: "none" },
	setIngredientNutritionReferenceFn: { require: "none" },
	createFolderFn: { require: "none" },
	updateFolderFn: { require: "none" },
	deleteFolderFn: { require: "none" },
	restoreFolderFn: { require: "none" },
	createIngredientFn: { require: "none" },
	updateIngredientFn: { require: "none" },
	deleteIngredientFn: { require: "none" },
	restoreIngredientFn: { require: "none" },
	createIngredientItemFn: { require: "none" },
	updateIngredientItemFn: { require: "none" },
	deleteIngredientItemFn: { require: "none" },
	saveIngredientDetailsFn: { require: "none" },
	recordIngredientVersionFn: { require: "none" },
	restoreIngredientVersionFn: { require: "none" },
	recordIngredientReviewFn: { require: "none" },
	recordFolderReviewFn: { require: "none" },

	// ── kitchen-draft.fn.ts
	createKitchenDraftFn: { require: "none" },
	updateKitchenDraftFn: { require: "none" },
	sendKitchenDraftFn: { require: "none" },
	deleteKitchenDraftFn: { require: "none" },

	// ── kitchen-settings.fn.ts
	updateKitchenSettingsFn: { require: "none" },

	// ── legal.fn.ts
	acknowledgeLegalDocumentsFn: { require: "none" },

	// ── liquidation.fn.ts
	createLiquidacaoFn: {
		require: "session",
		reason: "Esta operação registra uma liquidação.",
		authorization: [{ kind: "permission", module: "unit", level: 2 }],
	},
	createPagamentoFn: { require: "session", reason: "Esta operação registra um pagamento.", authorization: [{ kind: "permission", module: "unit", level: 2 }] },

	// ── mcp-keys.fn.ts
	createMcpKeyFn: {
		require: "fresh",
		reason: "Esta operação cria uma chave de API que age em seu nome, sem senha e sem segundo fator.",
		authorization: [{ kind: "self", note: SELF_SCOPED_NOTE }],
	},
	revokeMcpKeyFn: { require: "none" },
	deleteMcpKeyFn: { require: "none" },

	// ── meal-types.fn.ts
	createMealTypeFn: { require: "none" },
	updateMealTypeFn: { require: "none" },
	deleteMealTypeFn: { require: "none" },
	restoreMealTypeFn: { require: "none" },

	// ── messhall.fn.ts
	addOtherPresenceFn: { require: "none" },

	// ── module-chat.fn.ts
	createModuleChatSessionFn: { require: "none" },
	renameModuleChatSessionFn: { require: "none" },
	deleteModuleChatSessionFn: { require: "none" },
	saveModuleChatMessageFn: { require: "none" },

	// ── nfe.fn.ts
	uploadNfeFn: { require: "none" },
	runNfeMatchingFn: { require: "none" },
	resolveNfeItemFn: { require: "none" },

	// ── nutrition-sync.fn.ts
	triggerNutritionSyncFn: { require: "none" },
	stopNutritionSyncFn: { require: "none" },

	// ── permissions.fn.ts
	createUserPermissionFn: {
		require: "fresh",
		reason: "Esta operação concede permissões de acesso a um usuário.",
		authorization: [{ kind: "permission", module: "admin", level: 2 }],
	},
	updateUserPermissionFn: {
		require: "fresh",
		reason: "Esta operação altera permissões de acesso de um usuário.",
		authorization: [{ kind: "permission", module: "admin", level: 2 }],
	},
	deleteUserPermissionFn: {
		require: "fresh",
		reason: "Esta operação revoga permissões de acesso de um usuário.",
		authorization: [{ kind: "permission", module: "admin", level: 2 }],
	},

	// ── places.fn.ts
	updatePlacesEntityFn: { require: "none" },
	applyPlacesDiffFn: { require: "none" },

	// ── planning.fn.ts
	upsertDailyMenuFn: { require: "none" },
	addMenuItemFn: { require: "none" },
	updateMenuItemFn: { require: "none" },
	removeMenuItemFn: { require: "none" },
	restoreMenuItemFn: { require: "none" },
	updateHeadcountFn: { require: "none" },
	updateSubstitutionsFn: { require: "none" },

	// ── policies.fn.ts
	createPolicyFn: {
		require: "fresh",
		reason: "Esta operação cria uma política de acesso.",
		authorization: [{ kind: "permission", module: "admin", level: 2 }],
	},
	updatePolicyFn: {
		require: "fresh",
		reason: "Esta operação altera uma política de acesso.",
		authorization: [{ kind: "permission", module: "admin", level: 2 }],
	},
	deletePolicyFn: {
		require: "fresh",
		reason: "Esta operação apaga uma política de acesso e revoga o que ela concedia.",
		authorization: [{ kind: "permission", module: "admin", level: 2 }],
	},
	addPolicyStatementFn: {
		require: "fresh",
		reason: "Esta operação amplia o que uma política de acesso concede.",
		authorization: [{ kind: "permission", module: "admin", level: 2 }],
	},
	updatePolicyStatementFn: {
		require: "fresh",
		reason: "Esta operação altera o que uma política de acesso concede.",
		authorization: [{ kind: "permission", module: "admin", level: 2 }],
	},
	removePolicyStatementFn: {
		require: "fresh",
		reason: "Esta operação reduz o que uma política de acesso concede.",
		authorization: [{ kind: "permission", module: "admin", level: 2 }],
	},
	attachPolicyFn: {
		require: "fresh",
		reason: "Esta operação concede a um usuário todas as permissões de uma política.",
		authorization: [{ kind: "permission", module: "admin", level: 2 }],
	},
	detachPolicyFn: {
		require: "fresh",
		reason: "Esta operação revoga de um usuário as permissões de uma política.",
		authorization: [{ kind: "permission", module: "admin", level: 2 }],
	},

	// ── policy.fn.ts
	createPolicyRuleFn: { require: "none" },
	updatePolicyRuleFn: { require: "none" },
	deletePolicyRuleFn: { require: "none" },

	// ── presence.fn.ts
	insertPresenceFn: { require: "none" },
	deletePresenceFn: { require: "none" },

	// ── price-research.fn.ts
	savePrecoAuditFn: { require: "none" },

	// ── production-issue.fn.ts
	confirmIssueFn: { require: "none" },
	registerLeftoverFn: { require: "none" },

	// ── production.fn.ts
	ensureProductionTasksFn: { require: "none" },
	updateProductionTaskStatusFn: { require: "none" },
	updateProductionTaskRecordFn: { require: "none" },
	adjustProductionPortionsFn: { require: "none" },
	recordProductionSubstitutionFn: { require: "none" },

	// ── purchase_item.fn.ts
	createPurchaseItemFn: { require: "none" },
	updatePurchaseItemFn: { require: "none" },
	deletePurchaseItemFn: { require: "none" },
	upsertPurchaseItemIngredientFn: { require: "none" },
	deletePurchaseItemIngredientFn: { require: "none" },
	setDefaultPurchaseItemIngredientFn: { require: "none" },

	// ── receiving.fn.ts
	createReceiptFromNfeFn: { require: "none" },
	updateReceiptItemFn: { require: "none" },
	upsertReceiptLotFn: { require: "none" },
	deleteReceiptLotFn: { require: "none" },
	setReceiptProvisionalFn: { require: "none" },
	finalizeReceiptFn: { require: "none" },

	// ── recipe-flow.fn.ts
	saveRecipeFlowFn: { require: "none" },
	createStepTemplateFn: { require: "none" },
	createUtensilFn: { require: "none" },

	// ── recipes.fn.ts
	createRecipeFn: { require: "none" },
	saveRecipeEditFn: { require: "none" },
	deleteRecipeFn: { require: "none" },
	restoreRecipeFn: { require: "none" },
	renameRecipeFn: { require: "none" },
	createRecipeFolderFn: { require: "none" },
	renameRecipeFolderFn: { require: "none" },
	deleteRecipeFolderFn: { require: "none" },
	setRecipeFolderFn: { require: "none" },
	recordRecipeReviewFn: { require: "none" },

	// ── reconciliation.fn.ts
	applyDocumentBatchFn: {
		require: "session",
		reason: "Esta operação aplica um lote de documentos do SIAFI à conciliação.",
		authorization: [{ kind: "permission", module: "unit", level: 2 }],
	},
	resolveDivergenceFn: {
		require: "session",
		reason: "Esta operação resolve uma divergência de conciliação.",
		authorization: [{ kind: "permission", module: "unit", level: 2 }],
	},

	// ── siafi-import.fn.ts
	uploadSiafiReportFn: { require: "none" },

	// ── stock-reports.fn.ts
	closeMonthFn: { require: "none" },

	// ── stock.fn.ts
	createAdjustmentFn: { require: "none" },
	createTransferFn: { require: "none" },
	createInventoryCountFn: { require: "none" },
	upsertCountItemFn: { require: "none" },
	confirmInventoryCountFn: { require: "none" },

	// ── supply-order.fn.ts
	createSupplyOrderFn: { require: "none" },
	cancelSupplyOrderFn: { require: "none" },

	// ── templates.fn.ts
	createTemplateFn: { require: "none" },
	createBlankTemplateFn: { require: "none" },
	forkTemplateFn: { require: "none" },
	saveTemplateEditFn: { require: "none" },
	deleteTemplateFn: { require: "none" },
	restoreTemplateFn: { require: "none" },
	applyEventTemplateFn: { require: "none" },
	applyTemplateFn: { require: "none" },

	// ── training.fn.ts
	resetTrainingScopeFn: {
		require: "fresh",
		reason: "Esta operação apaga e recria todos os dados do ambiente de treino.",
		authorization: [{ kind: "permission", module: "admin", level: 2 }],
	},

	// ── unit-settings.fn.ts
	updateUnitSettingsFn: { require: "none" },

	// ── user.fn.ts
	syncUserNrOrdemFn: { require: "none" },
	syncUserEmailFn: { require: "none" },

	// ── workforce.fn.ts
	saveWorkforceSubmissionFn: { require: "none" },
	addWorkforceNoteFn: { require: "none" },
	deleteWorkforceNoteFn: { require: "none" },
	createWorkforceSurveyFn: { require: "none" },
	closeWorkforceSurveyFn: { require: "none" },
	createRanchoFn: { require: "none" },
	updateRanchoFn: { require: "none" },
} as const satisfies Record<string, AssuranceEntry>

/** Nome de toda server function de mutação classificada. */
export type AssuranceOperationName = keyof typeof ASSURANCE_REGISTRY

/** Entrada do registro, ou `undefined` se a operação não estiver classificada. */
export function assuranceFor(operation: string): AssuranceEntry | undefined {
	return (ASSURANCE_REGISTRY as Record<string, AssuranceEntry>)[operation]
}

/** Operações com exigência de garantia (`session` ou `fresh`), com o nome de cada uma. */
export function classifiedOperations(): { operation: AssuranceOperationName; entry: Extract<AssuranceEntry, { require: "session" | "fresh" }> }[] {
	return Object.entries(ASSURANCE_REGISTRY)
		.filter(([, entry]) => entry.require !== "none")
		.map(([operation, entry]) => ({
			operation: operation as AssuranceOperationName,
			entry: entry as Extract<AssuranceEntry, { require: "session" | "fresh" }>,
		}))
}

/**
 * Pares (módulo, nível) que alcançam alguma operação classificada — a entrada de
 * `isProtectedAccount` de `@iefa/pbac`.
 *
 * Guarda o MENOR nível por módulo: se `unit` nível 2 já alcança uma liquidação, exigir 3 na
 * derivação deixaria de fora justamente o operador que a mudança existe para proteger.
 *
 * `self` e `authenticated` ficam de fora de propósito — são alcançadas por qualquer sessão e
 * portanto não separam uma conta de outra. Incluí-las marcaria os ~800 comensais como contas
 * protegidas, o que é o mesmo que não ter critério.
 */
export function assuranceReachability(): AssuranceReachability[] {
	const lowestByModule = new Map<AppModule, number>()

	for (const { entry } of classifiedOperations()) {
		for (const requirement of entry.authorization) {
			if (requirement.kind !== "permission") continue
			const current = lowestByModule.get(requirement.module)
			if (current === undefined || requirement.level < current) lowestByModule.set(requirement.module, requirement.level)
		}
	}

	return [...lowestByModule].map(([module, level]) => ({ module, level })).sort((a, b) => a.module.localeCompare(b.module))
}
