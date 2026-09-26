import { relations } from "drizzle-orm/relations";
import { usersInAuth, profilesAdminInAccessControl, comprasServicoDivisaoInComprasGovIntegration, comprasServicoGrupoInComprasGovIntegration, comprasServicoClasseInComprasGovIntegration, comprasMaterialClasseInComprasGovIntegration, comprasMaterialPdmInComprasGovIntegration, comprasServicoSecaoInComprasGovIntegration, integrationSyncLogInComprasGovIntegration, integrationSyncStepInComprasGovIntegration, nfeDocumentInInventory, kitchenInKitchen, unitsInCore, measureUnitInCore, gtinInGs1Integration, ingredientItemInKitchen, supplierProductMapInGs1Integration, purchaseItemInProcurement, sourceInNutritionReference, sourceReleaseInNutritionReference, foodItemRevisionInNutritionReference, foodItemInNutritionReference, procurementArpInProcurement, procurementArpItemInProcurement, procurementListItemInProcurement, messHallsInKitchen, userDataInCore, nutrientComponentInNutritionReference, nutrientComponentMappingInNutritionReference, nutrientInKitchen, foodNutrientValueInNutritionReference, supplyOrderInProcurement, empenhoInFinance, supplyOrderItemInProcurement, procurementListInProcurement, procurementPesquisaPrecoInProcurement, procurementListSnapshotSelectionInProcurement, procurementListSnapshotComponentInProcurement, procurementPesquisaPrecoItemInProcurement, ingredientInKitchen, nfeItemInInventory, comprasAmostraInProcurement, procurementPesquisaPrecoAmostraInProcurement, kitchenAtaDraftInProcurement, kitchenAtaDraftSelectionInProcurement, menuTemplateInKitchen, mcpApiKeysInAccessControl, mealTypeInKitchen, menuTemplateEventMealInKitchen, personInCore, recipeFolderInKitchen, recipesInKitchen, recipeReviewInKitchen, goodsReceiptInInventory, contractDesignationInProcurement, liquidacaoInFinance, itemInCore, purchaseItemIngredientInProcurement, receiptScanEventInInventory, goodsReceiptItemInInventory, procurementListKitchenInProcurement, procurementListSelectionInProcurement, preparationGroupInKitchen, ceafaInKitchen, folderInKitchen, comprasMaterialItemInComprasGovIntegration, equipmentModelInKitchen, equipmentModelRoleInKitchen, equipmentRoleInKitchen, equipmentUnitRoleInKitchen, equipmentUnitInKitchen, gtinAliasInGs1Integration, recipeEquipmentRequirementInKitchen, recipeStepInKitchen, analyticsChatSessionInKitchen, analyticsChatMessageInKitchen, productionTaskInKitchen, menuItemsInKitchen, ranchoInKitchen, workforceSurveyInKitchen, workforceSubmissionInKitchen, stockIssueRequestInInventory, stockIssueRequestItemInInventory, workforceCategoryInKitchen, workforceHeadcountInKitchen, mealPresencesInKitchen, workforceNoteInKitchen, ingredientNutritionReferenceInKitchen, menuTemplateMealInKitchen, otherPresencesInKitchen, stepTemplateInKitchen, stepTemplateUtensilInKitchen, utensilInKitchen, frozenPreparationInKitchen, recipeIngredientAlternativesInKitchen, recipeIngredientsInKitchen, ingredientNutrientInKitchen, ingredientVersionInKitchen, moduleChatSessionInKitchen, moduleChatMessageInKitchen, mealForecastsInKitchen, dailyMenuInKitchen, inventoryCountInInventory, inventoryCountItemInInventory, stockLotInInventory, menuGroupSetInKitchen, stockCostInInventory, sensitiveOperationLogInAccessControl, recipeStepOutputInKitchen, ingredientSubstitutionInKitchen, recipeStepInputInKitchen, recipeStepUtensilInKitchen, mfaRecoveryCodeInAccessControl, opinionsInKitchen, mfaResetLogInAccessControl, menuTemplateItemsInKitchen, ingredientReviewInKitchen, snackRequestInKitchen, snackRequestLineInKitchen, snackRequestEventInKitchen, monthlyClosingInInventory, snackRequestMaterialInKitchen, stockPolicyInInventory, expiryAlertPolicyInInventory, stockAdjustmentInInventory, gpcAttributeInGs1Integration, gpcAttributeValueInGs1Integration, gtinSpecificationCheckInGs1Integration, purchaseItemGpcRequirementInProcurement, equipmentMaintenancePlanInKitchen, equipmentIssueInKitchen, equipmentMaintenanceLogInKitchen, policyStatementInAccessControl, policyInAccessControl, userPolicyAttachmentInAccessControl, importBatchInSiafiIntegration, importRowInSiafiIntegration, budgetCreditInFinance, empenhoEventInFinance, pagamentoInFinance, folderReviewInKitchen, reconciliationDecisionInFinance, userPermissionsInAccessControl, openingBalanceInInventory, openingBalanceItemInInventory, stockMovementInInventory, comprasMaterialGrupoInComprasGovIntegration, kitchenStockSettingsInInventory, menuGroupInKitchen, countScopeItemInInventory, goodsReceiptItemLotInInventory, inventoryCountEntryInInventory, stockAdjustmentItemInInventory, stockAdjustmentAttachmentInInventory, gpcBrickAttributeInGs1Integration, gtinGpcAttributeInGs1Integration, scannerProfileInInventory } from "./schema";

export const profilesAdminInAccessControlRelations = relations(profilesAdminInAccessControl, ({one}) => ({
	usersInAuth: one(usersInAuth, {
		fields: [profilesAdminInAccessControl.id],
		references: [usersInAuth.id]
	}),
}));

export const usersInAuthRelations = relations(usersInAuth, ({many}) => ({
	profilesAdminInAccessControls: many(profilesAdminInAccessControl),
	nfeDocumentInInventories_createdBy: many(nfeDocumentInInventory, {
		relationName: "nfeDocumentInInventory_createdBy_usersInAuth_id"
	}),
	nfeDocumentInInventories_situationCheckedBy: many(nfeDocumentInInventory, {
		relationName: "nfeDocumentInInventory_situationCheckedBy_usersInAuth_id"
	}),
	userDataInCores: many(userDataInCore),
	supplyOrderInProcurements_createdBy: many(supplyOrderInProcurement, {
		relationName: "supplyOrderInProcurement_createdBy_usersInAuth_id"
	}),
	supplyOrderInProcurements_sicafAckBy: many(supplyOrderInProcurement, {
		relationName: "supplyOrderInProcurement_sicafAckBy_usersInAuth_id"
	}),
	mcpApiKeysInAccessControls: many(mcpApiKeysInAccessControl),
	personInCores: many(personInCore),
	goodsReceiptInInventories_createdBy: many(goodsReceiptInInventory, {
		relationName: "goodsReceiptInInventory_createdBy_usersInAuth_id"
	}),
	goodsReceiptInInventories_definitiveBy: many(goodsReceiptInInventory, {
		relationName: "goodsReceiptInInventory_definitiveBy_usersInAuth_id"
	}),
	goodsReceiptInInventories_fiscalResolvedBy: many(goodsReceiptInInventory, {
		relationName: "goodsReceiptInInventory_fiscalResolvedBy_usersInAuth_id"
	}),
	goodsReceiptInInventories_provisionalBy: many(goodsReceiptInInventory, {
		relationName: "goodsReceiptInInventory_provisionalBy_usersInAuth_id"
	}),
	contractDesignationInProcurements_createdBy: many(contractDesignationInProcurement, {
		relationName: "contractDesignationInProcurement_createdBy_usersInAuth_id"
	}),
	contractDesignationInProcurements_personId: many(contractDesignationInProcurement, {
		relationName: "contractDesignationInProcurement_personId_usersInAuth_id"
	}),
	receiptScanEventInInventories: many(receiptScanEventInInventory),
	gtinAliasInGs1Integrations_createdBy: many(gtinAliasInGs1Integration, {
		relationName: "gtinAliasInGs1Integration_createdBy_usersInAuth_id"
	}),
	gtinAliasInGs1Integrations_reviewedBy: many(gtinAliasInGs1Integration, {
		relationName: "gtinAliasInGs1Integration_reviewedBy_usersInAuth_id"
	}),
	analyticsChatSessionInKitchens: many(analyticsChatSessionInKitchen),
	workforceSurveyInKitchens: many(workforceSurveyInKitchen),
	workforceSubmissionInKitchens: many(workforceSubmissionInKitchen),
	stockIssueRequestInInventories_closedBy: many(stockIssueRequestInInventory, {
		relationName: "stockIssueRequestInInventory_closedBy_usersInAuth_id"
	}),
	stockIssueRequestInInventories_createdBy: many(stockIssueRequestInInventory, {
		relationName: "stockIssueRequestInInventory_createdBy_usersInAuth_id"
	}),
	mealPresencesInKitchens: many(mealPresencesInKitchen),
	otherPresencesInKitchens: many(otherPresencesInKitchen),
	moduleChatSessionInKitchens: many(moduleChatSessionInKitchen),
	mealForecastsInKitchens: many(mealForecastsInKitchen),
	sensitiveOperationLogInAccessControls: many(sensitiveOperationLogInAccessControl),
	mfaRecoveryCodeInAccessControls: many(mfaRecoveryCodeInAccessControl),
	opinionsInKitchens: many(opinionsInKitchen),
	mfaResetLogInAccessControls_performedBy: many(mfaResetLogInAccessControl, {
		relationName: "mfaResetLogInAccessControl_performedBy_usersInAuth_id"
	}),
	mfaResetLogInAccessControls_targetUserId: many(mfaResetLogInAccessControl, {
		relationName: "mfaResetLogInAccessControl_targetUserId_usersInAuth_id"
	}),
	snackRequestInKitchens_cancelledBy: many(snackRequestInKitchen, {
		relationName: "snackRequestInKitchen_cancelledBy_usersInAuth_id"
	}),
	snackRequestInKitchens_decidedBy: many(snackRequestInKitchen, {
		relationName: "snackRequestInKitchen_decidedBy_usersInAuth_id"
	}),
	snackRequestInKitchens_deliveredBy: many(snackRequestInKitchen, {
		relationName: "snackRequestInKitchen_deliveredBy_usersInAuth_id"
	}),
	snackRequestInKitchens_requestedBy: many(snackRequestInKitchen, {
		relationName: "snackRequestInKitchen_requestedBy_usersInAuth_id"
	}),
	snackRequestInKitchens_sampleCollectedBy: many(snackRequestInKitchen, {
		relationName: "snackRequestInKitchen_sampleCollectedBy_usersInAuth_id"
	}),
	snackRequestEventInKitchens: many(snackRequestEventInKitchen),
	monthlyClosingInInventories: many(monthlyClosingInInventory),
	expiryAlertPolicyInInventories: many(expiryAlertPolicyInInventory),
	inventoryCountInInventories_approvedBy: many(inventoryCountInInventory, {
		relationName: "inventoryCountInInventory_approvedBy_usersInAuth_id"
	}),
	inventoryCountInInventories_confirmedBy: many(inventoryCountInInventory, {
		relationName: "inventoryCountInInventory_confirmedBy_usersInAuth_id"
	}),
	inventoryCountInInventories_createdBy: many(inventoryCountInInventory, {
		relationName: "inventoryCountInInventory_createdBy_usersInAuth_id"
	}),
	gtinSpecificationCheckInGs1Integrations: many(gtinSpecificationCheckInGs1Integration),
	equipmentMaintenanceLogInKitchens: many(equipmentMaintenanceLogInKitchen),
	equipmentIssueInKitchens_reportedBy: many(equipmentIssueInKitchen, {
		relationName: "equipmentIssueInKitchen_reportedBy_usersInAuth_id"
	}),
	equipmentIssueInKitchens_resolvedBy: many(equipmentIssueInKitchen, {
		relationName: "equipmentIssueInKitchen_resolvedBy_usersInAuth_id"
	}),
	importBatchInSiafiIntegrations: many(importBatchInSiafiIntegration),
	empenhoInFinances: many(empenhoInFinance),
	empenhoEventInFinances: many(empenhoEventInFinance),
	liquidacaoInFinances: many(liquidacaoInFinance),
	pagamentoInFinances: many(pagamentoInFinance),
	reconciliationDecisionInFinances: many(reconciliationDecisionInFinance),
	userPermissionsInAccessControls: many(userPermissionsInAccessControl),
	openingBalanceInInventories_cancelledBy: many(openingBalanceInInventory, {
		relationName: "openingBalanceInInventory_cancelledBy_usersInAuth_id"
	}),
	openingBalanceInInventories_createdBy: many(openingBalanceInInventory, {
		relationName: "openingBalanceInInventory_createdBy_usersInAuth_id"
	}),
	openingBalanceInInventories_postedBy: many(openingBalanceInInventory, {
		relationName: "openingBalanceInInventory_postedBy_usersInAuth_id"
	}),
	kitchenStockSettingsInInventories: many(kitchenStockSettingsInInventory),
	stockMovementInInventories: many(stockMovementInInventory),
	stockLotInInventories: many(stockLotInInventory),
	inventoryCountEntryInInventories: many(inventoryCountEntryInInventory),
	stockAdjustmentInInventories_createdBy: many(stockAdjustmentInInventory, {
		relationName: "stockAdjustmentInInventory_createdBy_usersInAuth_id"
	}),
	stockAdjustmentInInventories_decidedBy: many(stockAdjustmentInInventory, {
		relationName: "stockAdjustmentInInventory_decidedBy_usersInAuth_id"
	}),
	stockAdjustmentAttachmentInInventories: many(stockAdjustmentAttachmentInInventory),
	goodsReceiptItemLotInInventories: many(goodsReceiptItemLotInInventory),
	gtinGpcAttributeInGs1Integrations: many(gtinGpcAttributeInGs1Integration),
	scannerProfileInInventories: many(scannerProfileInInventory),
}));

export const comprasServicoGrupoInComprasGovIntegrationRelations = relations(comprasServicoGrupoInComprasGovIntegration, ({one, many}) => ({
	comprasServicoDivisaoInComprasGovIntegration: one(comprasServicoDivisaoInComprasGovIntegration, {
		fields: [comprasServicoGrupoInComprasGovIntegration.codigoDivisao],
		references: [comprasServicoDivisaoInComprasGovIntegration.codigoDivisao]
	}),
	comprasServicoClasseInComprasGovIntegrations: many(comprasServicoClasseInComprasGovIntegration),
}));

export const comprasServicoDivisaoInComprasGovIntegrationRelations = relations(comprasServicoDivisaoInComprasGovIntegration, ({one, many}) => ({
	comprasServicoGrupoInComprasGovIntegrations: many(comprasServicoGrupoInComprasGovIntegration),
	comprasServicoSecaoInComprasGovIntegration: one(comprasServicoSecaoInComprasGovIntegration, {
		fields: [comprasServicoDivisaoInComprasGovIntegration.codigoSecao],
		references: [comprasServicoSecaoInComprasGovIntegration.codigoSecao]
	}),
}));

export const comprasServicoClasseInComprasGovIntegrationRelations = relations(comprasServicoClasseInComprasGovIntegration, ({one}) => ({
	comprasServicoGrupoInComprasGovIntegration: one(comprasServicoGrupoInComprasGovIntegration, {
		fields: [comprasServicoClasseInComprasGovIntegration.codigoGrupo],
		references: [comprasServicoGrupoInComprasGovIntegration.codigoGrupo]
	}),
}));

export const comprasMaterialPdmInComprasGovIntegrationRelations = relations(comprasMaterialPdmInComprasGovIntegration, ({one}) => ({
	comprasMaterialClasseInComprasGovIntegration: one(comprasMaterialClasseInComprasGovIntegration, {
		fields: [comprasMaterialPdmInComprasGovIntegration.codigoClasse],
		references: [comprasMaterialClasseInComprasGovIntegration.codigoClasse]
	}),
}));

export const comprasMaterialClasseInComprasGovIntegrationRelations = relations(comprasMaterialClasseInComprasGovIntegration, ({one, many}) => ({
	comprasMaterialPdmInComprasGovIntegrations: many(comprasMaterialPdmInComprasGovIntegration),
	comprasMaterialGrupoInComprasGovIntegration: one(comprasMaterialGrupoInComprasGovIntegration, {
		fields: [comprasMaterialClasseInComprasGovIntegration.codigoGrupo],
		references: [comprasMaterialGrupoInComprasGovIntegration.codigoGrupo]
	}),
}));

export const comprasServicoSecaoInComprasGovIntegrationRelations = relations(comprasServicoSecaoInComprasGovIntegration, ({many}) => ({
	comprasServicoDivisaoInComprasGovIntegrations: many(comprasServicoDivisaoInComprasGovIntegration),
}));

export const integrationSyncStepInComprasGovIntegrationRelations = relations(integrationSyncStepInComprasGovIntegration, ({one}) => ({
	integrationSyncLogInComprasGovIntegration: one(integrationSyncLogInComprasGovIntegration, {
		fields: [integrationSyncStepInComprasGovIntegration.syncId],
		references: [integrationSyncLogInComprasGovIntegration.id]
	}),
}));

export const integrationSyncLogInComprasGovIntegrationRelations = relations(integrationSyncLogInComprasGovIntegration, ({many}) => ({
	integrationSyncStepInComprasGovIntegrations: many(integrationSyncStepInComprasGovIntegration),
}));

export const nfeDocumentInInventoryRelations = relations(nfeDocumentInInventory, ({one, many}) => ({
	usersInAuth_createdBy: one(usersInAuth, {
		fields: [nfeDocumentInInventory.createdBy],
		references: [usersInAuth.id],
		relationName: "nfeDocumentInInventory_createdBy_usersInAuth_id"
	}),
	kitchenInKitchen: one(kitchenInKitchen, {
		fields: [nfeDocumentInInventory.kitchenId],
		references: [kitchenInKitchen.id]
	}),
	usersInAuth_situationCheckedBy: one(usersInAuth, {
		fields: [nfeDocumentInInventory.situationCheckedBy],
		references: [usersInAuth.id],
		relationName: "nfeDocumentInInventory_situationCheckedBy_usersInAuth_id"
	}),
	unitsInCore: one(unitsInCore, {
		fields: [nfeDocumentInInventory.unitId],
		references: [unitsInCore.id]
	}),
	nfeItemInInventories: many(nfeItemInInventory),
	goodsReceiptInInventories: many(goodsReceiptInInventory),
	liquidacaoInFinances: many(liquidacaoInFinance),
}));

export const kitchenInKitchenRelations = relations(kitchenInKitchen, ({one, many}) => ({
	nfeDocumentInInventories: many(nfeDocumentInInventory),
	supplyOrderInProcurements: many(supplyOrderInProcurement),
	kitchenAtaDraftInProcurements: many(kitchenAtaDraftInProcurement),
	kitchenInKitchen: one(kitchenInKitchen, {
		fields: [kitchenInKitchen.kitchenId],
		references: [kitchenInKitchen.id],
		relationName: "kitchenInKitchen_kitchenId_kitchenInKitchen_id"
	}),
	kitchenInKitchens: many(kitchenInKitchen, {
		relationName: "kitchenInKitchen_kitchenId_kitchenInKitchen_id"
	}),
	unitsInCore_purchaseUnitId: one(unitsInCore, {
		fields: [kitchenInKitchen.purchaseUnitId],
		references: [unitsInCore.id],
		relationName: "kitchenInKitchen_purchaseUnitId_unitsInCore_id"
	}),
	unitsInCore_unitId: one(unitsInCore, {
		fields: [kitchenInKitchen.unitId],
		references: [unitsInCore.id],
		relationName: "kitchenInKitchen_unitId_unitsInCore_id"
	}),
	recipesInKitchens: many(recipesInKitchen),
	goodsReceiptInInventories: many(goodsReceiptInInventory),
	procurementListKitchenInProcurements: many(procurementListKitchenInProcurement),
	gtinAliasInGs1Integrations: many(gtinAliasInGs1Integration),
	productionTaskInKitchens: many(productionTaskInKitchen),
	ranchoInKitchens: many(ranchoInKitchen),
	stockIssueRequestInInventories: many(stockIssueRequestInInventory),
	utensilInKitchens: many(utensilInKitchen),
	messHallsInKitchens: many(messHallsInKitchen),
	dailyMenuInKitchens: many(dailyMenuInKitchen),
	mealTypeInKitchens: many(mealTypeInKitchen),
	menuTemplateInKitchens: many(menuTemplateInKitchen),
	stockCostInInventories: many(stockCostInInventory),
	stepTemplateInKitchens: many(stepTemplateInKitchen),
	snackRequestInKitchens: many(snackRequestInKitchen),
	monthlyClosingInInventories: many(monthlyClosingInInventory),
	stockPolicyInInventories: many(stockPolicyInInventory),
	equipmentModelInKitchens: many(equipmentModelInKitchen),
	equipmentUnitInKitchens: many(equipmentUnitInKitchen),
	expiryAlertPolicyInInventories: many(expiryAlertPolicyInInventory),
	inventoryCountInInventories: many(inventoryCountInInventory),
	equipmentMaintenancePlanInKitchens: many(equipmentMaintenancePlanInKitchen),
	policyStatementInAccessControls: many(policyStatementInAccessControl),
	userPermissionsInAccessControls: many(userPermissionsInAccessControl),
	openingBalanceInInventories: many(openingBalanceInInventory),
	kitchenStockSettingsInInventories: many(kitchenStockSettingsInInventory),
	menuGroupSetInKitchens: many(menuGroupSetInKitchen),
	stockMovementInInventories: many(stockMovementInInventory),
	countScopeItemInInventories: many(countScopeItemInInventory),
	stockLotInInventories: many(stockLotInInventory),
	stockAdjustmentInInventories: many(stockAdjustmentInInventory),
	scannerProfileInInventories: many(scannerProfileInInventory),
}));

export const unitsInCoreRelations = relations(unitsInCore, ({one, many}) => ({
	nfeDocumentInInventories: many(nfeDocumentInInventory),
	kitchenInKitchens_purchaseUnitId: many(kitchenInKitchen, {
		relationName: "kitchenInKitchen_purchaseUnitId_unitsInCore_id"
	}),
	kitchenInKitchens_unitId: many(kitchenInKitchen, {
		relationName: "kitchenInKitchen_unitId_unitsInCore_id"
	}),
	contractDesignationInProcurements: many(contractDesignationInProcurement),
	unitsInCore_parentUnitId: one(unitsInCore, {
		fields: [unitsInCore.parentUnitId],
		references: [unitsInCore.id],
		relationName: "unitsInCore_parentUnitId_unitsInCore_id"
	}),
	unitsInCores_parentUnitId: many(unitsInCore, {
		relationName: "unitsInCore_parentUnitId_unitsInCore_id"
	}),
	unitsInCore_supportingUnitId: one(unitsInCore, {
		fields: [unitsInCore.supportingUnitId],
		references: [unitsInCore.id],
		relationName: "unitsInCore_supportingUnitId_unitsInCore_id"
	}),
	unitsInCores_supportingUnitId: many(unitsInCore, {
		relationName: "unitsInCore_supportingUnitId_unitsInCore_id"
	}),
	procurementListInProcurements: many(procurementListInProcurement),
	procurementArpInProcurements: many(procurementArpInProcurement),
	ranchoInKitchens: many(ranchoInKitchen),
	messHallsInKitchens_unitId: many(messHallsInKitchen, {
		relationName: "messHallsInKitchen_unitId_unitsInCore_id"
	}),
	policyStatementInAccessControls: many(policyStatementInAccessControl),
	importBatchInSiafiIntegrations: many(importBatchInSiafiIntegration),
	budgetCreditInFinances: many(budgetCreditInFinance),
	empenhoInFinances: many(empenhoInFinance),
	liquidacaoInFinances: many(liquidacaoInFinance),
	pagamentoInFinances: many(pagamentoInFinance),
	reconciliationDecisionInFinances: many(reconciliationDecisionInFinance),
	userPermissionsInAccessControls: many(userPermissionsInAccessControl),
}));

export const gtinInGs1IntegrationRelations = relations(gtinInGs1Integration, ({one, many}) => ({
	measureUnitInCore: one(measureUnitInCore, {
		fields: [gtinInGs1Integration.netContentUnit],
		references: [measureUnitInCore.code]
	}),
	gtinInGs1Integration: one(gtinInGs1Integration, {
		fields: [gtinInGs1Integration.parentGtin],
		references: [gtinInGs1Integration.gtin],
		relationName: "gtinInGs1Integration_parentGtin_gtinInGs1Integration_gtin"
	}),
	gtinInGs1Integrations: many(gtinInGs1Integration, {
		relationName: "gtinInGs1Integration_parentGtin_gtinInGs1Integration_gtin"
	}),
	ingredientItemInKitchens: many(ingredientItemInKitchen),
	gtinGpcAttributeInGs1Integrations: many(gtinGpcAttributeInGs1Integration),
}));

export const measureUnitInCoreRelations = relations(measureUnitInCore, ({many}) => ({
	gtinInGs1Integrations: many(gtinInGs1Integration),
	purchaseItemInProcurements: many(purchaseItemInProcurement),
	itemInCores: many(itemInCore),
}));

export const supplierProductMapInGs1IntegrationRelations = relations(supplierProductMapInGs1Integration, ({one}) => ({
	ingredientItemInKitchen: one(ingredientItemInKitchen, {
		fields: [supplierProductMapInGs1Integration.ingredientItemId],
		references: [ingredientItemInKitchen.id]
	}),
	purchaseItemInProcurement: one(purchaseItemInProcurement, {
		fields: [supplierProductMapInGs1Integration.purchaseItemId],
		references: [purchaseItemInProcurement.id]
	}),
}));

export const ingredientItemInKitchenRelations = relations(ingredientItemInKitchen, ({one, many}) => ({
	supplierProductMapInGs1Integrations: many(supplierProductMapInGs1Integration),
	nfeItemInInventories: many(nfeItemInInventory),
	gtinAliasInGs1Integrations: many(gtinAliasInGs1Integration),
	gtinInGs1Integration: one(gtinInGs1Integration, {
		fields: [ingredientItemInKitchen.gtin],
		references: [gtinInGs1Integration.gtin]
	}),
	purchaseItemInProcurement: one(purchaseItemInProcurement, {
		fields: [ingredientItemInKitchen.purchaseItemId],
		references: [purchaseItemInProcurement.id]
	}),
	ingredientInKitchen: one(ingredientInKitchen, {
		fields: [ingredientItemInKitchen.ingredientId],
		references: [ingredientInKitchen.id]
	}),
	goodsReceiptItemInInventories: many(goodsReceiptItemInInventory),
}));

export const purchaseItemInProcurementRelations = relations(purchaseItemInProcurement, ({one, many}) => ({
	supplierProductMapInGs1Integrations: many(supplierProductMapInGs1Integration),
	supplyOrderItemInProcurements: many(supplyOrderItemInProcurement),
	nfeItemInInventories: many(nfeItemInInventory),
	purchaseItemIngredientInProcurements: many(purchaseItemIngredientInProcurement),
	comprasMaterialItemInComprasGovIntegration: one(comprasMaterialItemInComprasGovIntegration, {
		fields: [purchaseItemInProcurement.catmatItemCodigo],
		references: [comprasMaterialItemInComprasGovIntegration.codigoItem]
	}),
	measureUnitInCore: one(measureUnitInCore, {
		fields: [purchaseItemInProcurement.packageNetContentUnit],
		references: [measureUnitInCore.code]
	}),
	ingredientItemInKitchens: many(ingredientItemInKitchen),
	gtinSpecificationCheckInGs1Integrations: many(gtinSpecificationCheckInGs1Integration),
	purchaseItemGpcRequirementInProcurements: many(purchaseItemGpcRequirementInProcurement),
	procurementListItemInProcurements: many(procurementListItemInProcurement),
	goodsReceiptItemInInventories: many(goodsReceiptItemInInventory),
}));

export const sourceReleaseInNutritionReferenceRelations = relations(sourceReleaseInNutritionReference, ({one, many}) => ({
	sourceInNutritionReference: one(sourceInNutritionReference, {
		fields: [sourceReleaseInNutritionReference.sourceId],
		references: [sourceInNutritionReference.id]
	}),
	foodItemRevisionInNutritionReferences: many(foodItemRevisionInNutritionReference),
}));

export const sourceInNutritionReferenceRelations = relations(sourceInNutritionReference, ({many}) => ({
	sourceReleaseInNutritionReferences: many(sourceReleaseInNutritionReference),
	foodItemInNutritionReferences: many(foodItemInNutritionReference),
	nutrientComponentInNutritionReferences: many(nutrientComponentInNutritionReference),
}));

export const foodItemInNutritionReferenceRelations = relations(foodItemInNutritionReference, ({one, many}) => ({
	foodItemRevisionInNutritionReference: one(foodItemRevisionInNutritionReference, {
		fields: [foodItemInNutritionReference.currentRevisionId],
		references: [foodItemRevisionInNutritionReference.id],
		relationName: "foodItemInNutritionReference_currentRevisionId_foodItemRevisionInNutritionReference_id"
	}),
	sourceInNutritionReference: one(sourceInNutritionReference, {
		fields: [foodItemInNutritionReference.sourceId],
		references: [sourceInNutritionReference.id]
	}),
	foodItemRevisionInNutritionReferences: many(foodItemRevisionInNutritionReference, {
		relationName: "foodItemRevisionInNutritionReference_foodItemId_foodItemInNutritionReference_id"
	}),
}));

export const foodItemRevisionInNutritionReferenceRelations = relations(foodItemRevisionInNutritionReference, ({one, many}) => ({
	foodItemInNutritionReferences: many(foodItemInNutritionReference, {
		relationName: "foodItemInNutritionReference_currentRevisionId_foodItemRevisionInNutritionReference_id"
	}),
	foodItemInNutritionReference: one(foodItemInNutritionReference, {
		fields: [foodItemRevisionInNutritionReference.foodItemId],
		references: [foodItemInNutritionReference.id],
		relationName: "foodItemRevisionInNutritionReference_foodItemId_foodItemInNutritionReference_id"
	}),
	sourceReleaseInNutritionReference: one(sourceReleaseInNutritionReference, {
		fields: [foodItemRevisionInNutritionReference.sourceReleaseId],
		references: [sourceReleaseInNutritionReference.id]
	}),
	foodNutrientValueInNutritionReferences: many(foodNutrientValueInNutritionReference),
	ingredientNutritionReferenceInKitchens: many(ingredientNutritionReferenceInKitchen),
}));

export const procurementArpItemInProcurementRelations = relations(procurementArpItemInProcurement, ({one, many}) => ({
	procurementArpInProcurement: one(procurementArpInProcurement, {
		fields: [procurementArpItemInProcurement.arpId],
		references: [procurementArpInProcurement.id]
	}),
	procurementListItemInProcurement: one(procurementListItemInProcurement, {
		fields: [procurementArpItemInProcurement.ataItemId],
		references: [procurementListItemInProcurement.id]
	}),
	supplyOrderItemInProcurements: many(supplyOrderItemInProcurement),
	empenhoInFinances: many(empenhoInFinance),
}));

export const procurementArpInProcurementRelations = relations(procurementArpInProcurement, ({one, many}) => ({
	procurementArpItemInProcurements: many(procurementArpItemInProcurement),
	contractDesignationInProcurements: many(contractDesignationInProcurement),
	procurementListInProcurement: one(procurementListInProcurement, {
		fields: [procurementArpInProcurement.ataId],
		references: [procurementListInProcurement.id]
	}),
	unitsInCore: one(unitsInCore, {
		fields: [procurementArpInProcurement.unitId],
		references: [unitsInCore.id]
	}),
}));

export const procurementListItemInProcurementRelations = relations(procurementListItemInProcurement, ({one, many}) => ({
	procurementArpItemInProcurements: many(procurementArpItemInProcurement),
	procurementPesquisaPrecoItemInProcurements: many(procurementPesquisaPrecoItemInProcurement),
	procurementListInProcurement: one(procurementListInProcurement, {
		fields: [procurementListItemInProcurement.listId],
		references: [procurementListInProcurement.id]
	}),
	ingredientInKitchen: one(ingredientInKitchen, {
		fields: [procurementListItemInProcurement.ingredientId],
		references: [ingredientInKitchen.id]
	}),
	purchaseItemInProcurement: one(purchaseItemInProcurement, {
		fields: [procurementListItemInProcurement.purchaseItemId],
		references: [purchaseItemInProcurement.id]
	}),
}));

export const userDataInCoreRelations = relations(userDataInCore, ({one}) => ({
	messHallsInKitchen: one(messHallsInKitchen, {
		fields: [userDataInCore.defaultMessHallId],
		references: [messHallsInKitchen.id]
	}),
	usersInAuth: one(usersInAuth, {
		fields: [userDataInCore.id],
		references: [usersInAuth.id]
	}),
}));

export const messHallsInKitchenRelations = relations(messHallsInKitchen, ({one, many}) => ({
	userDataInCores: many(userDataInCore),
	ranchoInKitchens: many(ranchoInKitchen),
	mealPresencesInKitchens: many(mealPresencesInKitchen),
	otherPresencesInKitchens: many(otherPresencesInKitchen),
	mealForecastsInKitchens: many(mealForecastsInKitchen),
	kitchenInKitchen: one(kitchenInKitchen, {
		fields: [messHallsInKitchen.kitchenId],
		references: [kitchenInKitchen.id]
	}),
	unitsInCore_unitId: one(unitsInCore, {
		fields: [messHallsInKitchen.unitId],
		references: [unitsInCore.id],
		relationName: "messHallsInKitchen_unitId_unitsInCore_id"
	}),
	policyStatementInAccessControls: many(policyStatementInAccessControl),
	userPermissionsInAccessControls: many(userPermissionsInAccessControl),
}));

export const nutrientComponentInNutritionReferenceRelations = relations(nutrientComponentInNutritionReference, ({one, many}) => ({
	sourceInNutritionReference: one(sourceInNutritionReference, {
		fields: [nutrientComponentInNutritionReference.sourceId],
		references: [sourceInNutritionReference.id]
	}),
	nutrientComponentMappingInNutritionReferences: many(nutrientComponentMappingInNutritionReference),
	foodNutrientValueInNutritionReferences: many(foodNutrientValueInNutritionReference),
}));

export const nutrientComponentMappingInNutritionReferenceRelations = relations(nutrientComponentMappingInNutritionReference, ({one}) => ({
	nutrientComponentInNutritionReference: one(nutrientComponentInNutritionReference, {
		fields: [nutrientComponentMappingInNutritionReference.componentId],
		references: [nutrientComponentInNutritionReference.id]
	}),
	nutrientInKitchen: one(nutrientInKitchen, {
		fields: [nutrientComponentMappingInNutritionReference.nutrientId],
		references: [nutrientInKitchen.id]
	}),
}));

export const nutrientInKitchenRelations = relations(nutrientInKitchen, ({many}) => ({
	nutrientComponentMappingInNutritionReferences: many(nutrientComponentMappingInNutritionReference),
	ingredientNutrientInKitchens: many(ingredientNutrientInKitchen),
}));

export const foodNutrientValueInNutritionReferenceRelations = relations(foodNutrientValueInNutritionReference, ({one}) => ({
	nutrientComponentInNutritionReference: one(nutrientComponentInNutritionReference, {
		fields: [foodNutrientValueInNutritionReference.componentId],
		references: [nutrientComponentInNutritionReference.id]
	}),
	foodItemRevisionInNutritionReference: one(foodItemRevisionInNutritionReference, {
		fields: [foodNutrientValueInNutritionReference.foodRevisionId],
		references: [foodItemRevisionInNutritionReference.id]
	}),
}));

export const supplyOrderInProcurementRelations = relations(supplyOrderInProcurement, ({one, many}) => ({
	usersInAuth_createdBy: one(usersInAuth, {
		fields: [supplyOrderInProcurement.createdBy],
		references: [usersInAuth.id],
		relationName: "supplyOrderInProcurement_createdBy_usersInAuth_id"
	}),
	empenhoInFinance: one(empenhoInFinance, {
		fields: [supplyOrderInProcurement.empenhoId],
		references: [empenhoInFinance.id]
	}),
	kitchenInKitchen: one(kitchenInKitchen, {
		fields: [supplyOrderInProcurement.kitchenId],
		references: [kitchenInKitchen.id]
	}),
	usersInAuth_sicafAckBy: one(usersInAuth, {
		fields: [supplyOrderInProcurement.sicafAckBy],
		references: [usersInAuth.id],
		relationName: "supplyOrderInProcurement_sicafAckBy_usersInAuth_id"
	}),
	supplyOrderItemInProcurements: many(supplyOrderItemInProcurement),
	goodsReceiptInInventories: many(goodsReceiptInInventory),
}));

export const empenhoInFinanceRelations = relations(empenhoInFinance, ({one, many}) => ({
	supplyOrderInProcurements: many(supplyOrderInProcurement),
	goodsReceiptInInventories: many(goodsReceiptInInventory),
	contractDesignationInProcurements: many(contractDesignationInProcurement),
	procurementArpItemInProcurement: one(procurementArpItemInProcurement, {
		fields: [empenhoInFinance.arpItemId],
		references: [procurementArpItemInProcurement.id]
	}),
	usersInAuth: one(usersInAuth, {
		fields: [empenhoInFinance.createdBy],
		references: [usersInAuth.id]
	}),
	importBatchInSiafiIntegration: one(importBatchInSiafiIntegration, {
		fields: [empenhoInFinance.importBatchId],
		references: [importBatchInSiafiIntegration.id]
	}),
	unitsInCore: one(unitsInCore, {
		fields: [empenhoInFinance.unitId],
		references: [unitsInCore.id]
	}),
	empenhoEventInFinances: many(empenhoEventInFinance),
	liquidacaoInFinances: many(liquidacaoInFinance),
}));

export const supplyOrderItemInProcurementRelations = relations(supplyOrderItemInProcurement, ({one}) => ({
	procurementArpItemInProcurement: one(procurementArpItemInProcurement, {
		fields: [supplyOrderItemInProcurement.arpItemId],
		references: [procurementArpItemInProcurement.id]
	}),
	purchaseItemInProcurement: one(purchaseItemInProcurement, {
		fields: [supplyOrderItemInProcurement.purchaseItemId],
		references: [purchaseItemInProcurement.id]
	}),
	supplyOrderInProcurement: one(supplyOrderInProcurement, {
		fields: [supplyOrderItemInProcurement.supplyOrderId],
		references: [supplyOrderInProcurement.id]
	}),
}));

export const procurementPesquisaPrecoInProcurementRelations = relations(procurementPesquisaPrecoInProcurement, ({one, many}) => ({
	procurementListInProcurement: one(procurementListInProcurement, {
		fields: [procurementPesquisaPrecoInProcurement.ataId],
		references: [procurementListInProcurement.id]
	}),
	procurementPesquisaPrecoItemInProcurements: many(procurementPesquisaPrecoItemInProcurement),
}));

export const procurementListInProcurementRelations = relations(procurementListInProcurement, ({one, many}) => ({
	procurementPesquisaPrecoInProcurements: many(procurementPesquisaPrecoInProcurement),
	procurementListSnapshotSelectionInProcurements: many(procurementListSnapshotSelectionInProcurement),
	procurementListSnapshotComponentInProcurements: many(procurementListSnapshotComponentInProcurement),
	procurementListKitchenInProcurements: many(procurementListKitchenInProcurement),
	unitsInCore: one(unitsInCore, {
		fields: [procurementListInProcurement.unitId],
		references: [unitsInCore.id]
	}),
	procurementArpInProcurements: many(procurementArpInProcurement),
	procurementListItemInProcurements: many(procurementListItemInProcurement),
}));

export const procurementListSnapshotSelectionInProcurementRelations = relations(procurementListSnapshotSelectionInProcurement, ({one}) => ({
	procurementListInProcurement: one(procurementListInProcurement, {
		fields: [procurementListSnapshotSelectionInProcurement.listId],
		references: [procurementListInProcurement.id]
	}),
}));

export const procurementListSnapshotComponentInProcurementRelations = relations(procurementListSnapshotComponentInProcurement, ({one}) => ({
	procurementListInProcurement: one(procurementListInProcurement, {
		fields: [procurementListSnapshotComponentInProcurement.listId],
		references: [procurementListInProcurement.id]
	}),
}));

export const procurementPesquisaPrecoItemInProcurementRelations = relations(procurementPesquisaPrecoItemInProcurement, ({one, many}) => ({
	procurementListItemInProcurement: one(procurementListItemInProcurement, {
		fields: [procurementPesquisaPrecoItemInProcurement.ataItemId],
		references: [procurementListItemInProcurement.id]
	}),
	procurementPesquisaPrecoInProcurement: one(procurementPesquisaPrecoInProcurement, {
		fields: [procurementPesquisaPrecoItemInProcurement.researchId],
		references: [procurementPesquisaPrecoInProcurement.id]
	}),
	procurementPesquisaPrecoAmostraInProcurements: many(procurementPesquisaPrecoAmostraInProcurement),
}));

export const nfeItemInInventoryRelations = relations(nfeItemInInventory, ({one, many}) => ({
	ingredientInKitchen: one(ingredientInKitchen, {
		fields: [nfeItemInInventory.ingredientId],
		references: [ingredientInKitchen.id]
	}),
	ingredientItemInKitchen: one(ingredientItemInKitchen, {
		fields: [nfeItemInInventory.ingredientItemId],
		references: [ingredientItemInKitchen.id]
	}),
	nfeDocumentInInventory: one(nfeDocumentInInventory, {
		fields: [nfeItemInInventory.nfeDocumentId],
		references: [nfeDocumentInInventory.id]
	}),
	purchaseItemInProcurement: one(purchaseItemInProcurement, {
		fields: [nfeItemInInventory.purchaseItemId],
		references: [purchaseItemInProcurement.id]
	}),
	goodsReceiptItemInInventories: many(goodsReceiptItemInInventory),
}));

export const ingredientInKitchenRelations = relations(ingredientInKitchen, ({one, many}) => ({
	nfeItemInInventories: many(nfeItemInInventory),
	itemInCore: one(itemInCore, {
		fields: [ingredientInKitchen.id],
		references: [itemInCore.id]
	}),
	preparationGroupInKitchen: one(preparationGroupInKitchen, {
		fields: [ingredientInKitchen.preparationGroupId],
		references: [preparationGroupInKitchen.id]
	}),
	ceafaInKitchen: one(ceafaInKitchen, {
		fields: [ingredientInKitchen.ceafaId],
		references: [ceafaInKitchen.id]
	}),
	folderInKitchen: one(folderInKitchen, {
		fields: [ingredientInKitchen.folderId],
		references: [folderInKitchen.id]
	}),
	stockIssueRequestItemInInventories: many(stockIssueRequestItemInInventory),
	ingredientNutritionReferenceInKitchens: many(ingredientNutritionReferenceInKitchen),
	recipeIngredientAlternativesInKitchens: many(recipeIngredientAlternativesInKitchen),
	ingredientNutrientInKitchens: many(ingredientNutrientInKitchen),
	ingredientVersionInKitchens: many(ingredientVersionInKitchen),
	stockCostInInventories: many(stockCostInInventory),
	ingredientSubstitutionInKitchens_ingredientId: many(ingredientSubstitutionInKitchen, {
		relationName: "ingredientSubstitutionInKitchen_ingredientId_ingredientInKitchen_id"
	}),
	ingredientSubstitutionInKitchens_substituteIngredientId: many(ingredientSubstitutionInKitchen, {
		relationName: "ingredientSubstitutionInKitchen_substituteIngredientId_ingredientInKitchen_id"
	}),
	recipeIngredientsInKitchens: many(recipeIngredientsInKitchen),
	ingredientItemInKitchens: many(ingredientItemInKitchen),
	ingredientReviewInKitchens: many(ingredientReviewInKitchen),
	frozenPreparationInKitchens: many(frozenPreparationInKitchen),
	stockPolicyInInventories: many(stockPolicyInInventory),
	expiryAlertPolicyInInventories: many(expiryAlertPolicyInInventory),
	procurementListItemInProcurements: many(procurementListItemInProcurement),
	openingBalanceItemInInventories: many(openingBalanceItemInInventory),
	goodsReceiptItemInInventories: many(goodsReceiptItemInInventory),
	stockMovementInInventories: many(stockMovementInInventory),
	countScopeItemInInventories: many(countScopeItemInInventory),
	stockLotInInventories: many(stockLotInInventory),
	inventoryCountEntryInInventories: many(inventoryCountEntryInInventory),
	stockAdjustmentItemInInventories: many(stockAdjustmentItemInInventory),
}));

export const procurementPesquisaPrecoAmostraInProcurementRelations = relations(procurementPesquisaPrecoAmostraInProcurement, ({one}) => ({
	comprasAmostraInProcurement: one(comprasAmostraInProcurement, {
		fields: [procurementPesquisaPrecoAmostraInProcurement.amostraId],
		references: [comprasAmostraInProcurement.id]
	}),
	procurementPesquisaPrecoItemInProcurement: one(procurementPesquisaPrecoItemInProcurement, {
		fields: [procurementPesquisaPrecoAmostraInProcurement.researchItemId],
		references: [procurementPesquisaPrecoItemInProcurement.id]
	}),
}));

export const comprasAmostraInProcurementRelations = relations(comprasAmostraInProcurement, ({many}) => ({
	procurementPesquisaPrecoAmostraInProcurements: many(procurementPesquisaPrecoAmostraInProcurement),
}));

export const kitchenAtaDraftInProcurementRelations = relations(kitchenAtaDraftInProcurement, ({one, many}) => ({
	kitchenInKitchen: one(kitchenInKitchen, {
		fields: [kitchenAtaDraftInProcurement.kitchenId],
		references: [kitchenInKitchen.id]
	}),
	kitchenAtaDraftSelectionInProcurements: many(kitchenAtaDraftSelectionInProcurement),
}));

export const kitchenAtaDraftSelectionInProcurementRelations = relations(kitchenAtaDraftSelectionInProcurement, ({one}) => ({
	kitchenAtaDraftInProcurement: one(kitchenAtaDraftInProcurement, {
		fields: [kitchenAtaDraftSelectionInProcurement.draftId],
		references: [kitchenAtaDraftInProcurement.id]
	}),
	menuTemplateInKitchen: one(menuTemplateInKitchen, {
		fields: [kitchenAtaDraftSelectionInProcurement.templateId],
		references: [menuTemplateInKitchen.id]
	}),
}));

export const menuTemplateInKitchenRelations = relations(menuTemplateInKitchen, ({one, many}) => ({
	kitchenAtaDraftSelectionInProcurements: many(kitchenAtaDraftSelectionInProcurement),
	menuTemplateEventMealInKitchens: many(menuTemplateEventMealInKitchen),
	procurementListSelectionInProcurements_templateId: many(procurementListSelectionInProcurement, {
		relationName: "procurementListSelectionInProcurement_templateId_menuTemplateInKitchen_id"
	}),
	procurementListSelectionInProcurements_originTemplateId: many(procurementListSelectionInProcurement, {
		relationName: "procurementListSelectionInProcurement_originTemplateId_menuTemplateInKitchen_id"
	}),
	menuTemplateMealInKitchens: many(menuTemplateMealInKitchen),
	menuTemplateInKitchen: one(menuTemplateInKitchen, {
		fields: [menuTemplateInKitchen.baseTemplateId],
		references: [menuTemplateInKitchen.id],
		relationName: "menuTemplateInKitchen_baseTemplateId_menuTemplateInKitchen_id"
	}),
	menuTemplateInKitchens: many(menuTemplateInKitchen, {
		relationName: "menuTemplateInKitchen_baseTemplateId_menuTemplateInKitchen_id"
	}),
	kitchenInKitchen: one(kitchenInKitchen, {
		fields: [menuTemplateInKitchen.kitchenId],
		references: [kitchenInKitchen.id]
	}),
	menuTemplateItemsInKitchens: many(menuTemplateItemsInKitchen),
	snackRequestLineInKitchens: many(snackRequestLineInKitchen),
	menuItemsInKitchens: many(menuItemsInKitchen),
}));

export const mcpApiKeysInAccessControlRelations = relations(mcpApiKeysInAccessControl, ({one}) => ({
	usersInAuth: one(usersInAuth, {
		fields: [mcpApiKeysInAccessControl.userId],
		references: [usersInAuth.id]
	}),
}));

export const menuTemplateEventMealInKitchenRelations = relations(menuTemplateEventMealInKitchen, ({one, many}) => ({
	mealTypeInKitchen: one(mealTypeInKitchen, {
		fields: [menuTemplateEventMealInKitchen.mealTypeId],
		references: [mealTypeInKitchen.id]
	}),
	menuTemplateInKitchen: one(menuTemplateInKitchen, {
		fields: [menuTemplateEventMealInKitchen.menuTemplateId],
		references: [menuTemplateInKitchen.id]
	}),
	menuTemplateItemsInKitchens: many(menuTemplateItemsInKitchen),
}));

export const mealTypeInKitchenRelations = relations(mealTypeInKitchen, ({one, many}) => ({
	menuTemplateEventMealInKitchens: many(menuTemplateEventMealInKitchen),
	stockIssueRequestItemInInventories: many(stockIssueRequestItemInInventory),
	menuTemplateMealInKitchens: many(menuTemplateMealInKitchen),
	dailyMenuInKitchens: many(dailyMenuInKitchen),
	menuGroupSetInKitchen: one(menuGroupSetInKitchen, {
		fields: [mealTypeInKitchen.groupSetId],
		references: [menuGroupSetInKitchen.id]
	}),
	kitchenInKitchen: one(kitchenInKitchen, {
		fields: [mealTypeInKitchen.kitchenId],
		references: [kitchenInKitchen.id]
	}),
	menuTemplateItemsInKitchens: many(menuTemplateItemsInKitchen),
}));

export const personInCoreRelations = relations(personInCore, ({one}) => ({
	usersInAuth: one(usersInAuth, {
		fields: [personInCore.userId],
		references: [usersInAuth.id]
	}),
}));

export const recipesInKitchenRelations = relations(recipesInKitchen, ({one, many}) => ({
	recipeFolderInKitchen: one(recipeFolderInKitchen, {
		fields: [recipesInKitchen.folderId],
		references: [recipeFolderInKitchen.id]
	}),
	kitchenInKitchen: one(kitchenInKitchen, {
		fields: [recipesInKitchen.kitchenId],
		references: [kitchenInKitchen.id]
	}),
	recipeReviewInKitchens: many(recipeReviewInKitchen),
	recipeEquipmentRequirementInKitchens: many(recipeEquipmentRequirementInKitchen),
	recipeStepInKitchens: many(recipeStepInKitchen),
	recipeStepOutputInKitchens: many(recipeStepOutputInKitchen),
	recipeIngredientsInKitchens: many(recipeIngredientsInKitchen),
	menuTemplateItemsInKitchens: many(menuTemplateItemsInKitchen),
	frozenPreparationInKitchens_productionRecipeId: many(frozenPreparationInKitchen, {
		relationName: "frozenPreparationInKitchen_productionRecipeId_recipesInKitchen_id"
	}),
	frozenPreparationInKitchens_regenerationRecipeId: many(frozenPreparationInKitchen, {
		relationName: "frozenPreparationInKitchen_regenerationRecipeId_recipesInKitchen_id"
	}),
	menuItemsInKitchens: many(menuItemsInKitchen),
}));

export const recipeFolderInKitchenRelations = relations(recipeFolderInKitchen, ({many}) => ({
	recipesInKitchens: many(recipesInKitchen),
}));

export const recipeReviewInKitchenRelations = relations(recipeReviewInKitchen, ({one}) => ({
	recipesInKitchen: one(recipesInKitchen, {
		fields: [recipeReviewInKitchen.recipeId],
		references: [recipesInKitchen.id]
	}),
}));

export const goodsReceiptInInventoryRelations = relations(goodsReceiptInInventory, ({one, many}) => ({
	usersInAuth_createdBy: one(usersInAuth, {
		fields: [goodsReceiptInInventory.createdBy],
		references: [usersInAuth.id],
		relationName: "goodsReceiptInInventory_createdBy_usersInAuth_id"
	}),
	usersInAuth_definitiveBy: one(usersInAuth, {
		fields: [goodsReceiptInInventory.definitiveBy],
		references: [usersInAuth.id],
		relationName: "goodsReceiptInInventory_definitiveBy_usersInAuth_id"
	}),
	contractDesignationInProcurement_definitiveDesignationId: one(contractDesignationInProcurement, {
		fields: [goodsReceiptInInventory.definitiveDesignationId],
		references: [contractDesignationInProcurement.id],
		relationName: "goodsReceiptInInventory_definitiveDesignationId_contractDesignationInProcurement_id"
	}),
	empenhoInFinance: one(empenhoInFinance, {
		fields: [goodsReceiptInInventory.empenhoId],
		references: [empenhoInFinance.id]
	}),
	usersInAuth_fiscalResolvedBy: one(usersInAuth, {
		fields: [goodsReceiptInInventory.fiscalResolvedBy],
		references: [usersInAuth.id],
		relationName: "goodsReceiptInInventory_fiscalResolvedBy_usersInAuth_id"
	}),
	kitchenInKitchen: one(kitchenInKitchen, {
		fields: [goodsReceiptInInventory.kitchenId],
		references: [kitchenInKitchen.id]
	}),
	liquidacaoInFinance: one(liquidacaoInFinance, {
		fields: [goodsReceiptInInventory.liquidacaoId],
		references: [liquidacaoInFinance.id],
		relationName: "goodsReceiptInInventory_liquidacaoId_liquidacaoInFinance_id"
	}),
	nfeDocumentInInventory: one(nfeDocumentInInventory, {
		fields: [goodsReceiptInInventory.nfeDocumentId],
		references: [nfeDocumentInInventory.id]
	}),
	usersInAuth_provisionalBy: one(usersInAuth, {
		fields: [goodsReceiptInInventory.provisionalBy],
		references: [usersInAuth.id],
		relationName: "goodsReceiptInInventory_provisionalBy_usersInAuth_id"
	}),
	contractDesignationInProcurement_provisionalDesignationId: one(contractDesignationInProcurement, {
		fields: [goodsReceiptInInventory.provisionalDesignationId],
		references: [contractDesignationInProcurement.id],
		relationName: "goodsReceiptInInventory_provisionalDesignationId_contractDesignationInProcurement_id"
	}),
	supplyOrderInProcurement: one(supplyOrderInProcurement, {
		fields: [goodsReceiptInInventory.supplyOrderId],
		references: [supplyOrderInProcurement.id]
	}),
	receiptScanEventInInventories: many(receiptScanEventInInventory),
	liquidacaoInFinances: many(liquidacaoInFinance, {
		relationName: "liquidacaoInFinance_goodsReceiptId_goodsReceiptInInventory_id"
	}),
	goodsReceiptItemInInventories: many(goodsReceiptItemInInventory),
}));

export const contractDesignationInProcurementRelations = relations(contractDesignationInProcurement, ({one, many}) => ({
	goodsReceiptInInventories_definitiveDesignationId: many(goodsReceiptInInventory, {
		relationName: "goodsReceiptInInventory_definitiveDesignationId_contractDesignationInProcurement_id"
	}),
	goodsReceiptInInventories_provisionalDesignationId: many(goodsReceiptInInventory, {
		relationName: "goodsReceiptInInventory_provisionalDesignationId_contractDesignationInProcurement_id"
	}),
	procurementArpInProcurement: one(procurementArpInProcurement, {
		fields: [contractDesignationInProcurement.arpId],
		references: [procurementArpInProcurement.id]
	}),
	usersInAuth_createdBy: one(usersInAuth, {
		fields: [contractDesignationInProcurement.createdBy],
		references: [usersInAuth.id],
		relationName: "contractDesignationInProcurement_createdBy_usersInAuth_id"
	}),
	empenhoInFinance: one(empenhoInFinance, {
		fields: [contractDesignationInProcurement.empenhoId],
		references: [empenhoInFinance.id]
	}),
	usersInAuth_personId: one(usersInAuth, {
		fields: [contractDesignationInProcurement.personId],
		references: [usersInAuth.id],
		relationName: "contractDesignationInProcurement_personId_usersInAuth_id"
	}),
	unitsInCore: one(unitsInCore, {
		fields: [contractDesignationInProcurement.unitId],
		references: [unitsInCore.id]
	}),
}));

export const liquidacaoInFinanceRelations = relations(liquidacaoInFinance, ({one, many}) => ({
	goodsReceiptInInventories: many(goodsReceiptInInventory, {
		relationName: "goodsReceiptInInventory_liquidacaoId_liquidacaoInFinance_id"
	}),
	usersInAuth: one(usersInAuth, {
		fields: [liquidacaoInFinance.createdBy],
		references: [usersInAuth.id]
	}),
	empenhoInFinance: one(empenhoInFinance, {
		fields: [liquidacaoInFinance.empenhoId],
		references: [empenhoInFinance.id]
	}),
	goodsReceiptInInventory: one(goodsReceiptInInventory, {
		fields: [liquidacaoInFinance.goodsReceiptId],
		references: [goodsReceiptInInventory.id],
		relationName: "liquidacaoInFinance_goodsReceiptId_goodsReceiptInInventory_id"
	}),
	importBatchInSiafiIntegration: one(importBatchInSiafiIntegration, {
		fields: [liquidacaoInFinance.importBatchId],
		references: [importBatchInSiafiIntegration.id]
	}),
	nfeDocumentInInventory: one(nfeDocumentInInventory, {
		fields: [liquidacaoInFinance.nfeDocumentId],
		references: [nfeDocumentInInventory.id]
	}),
	unitsInCore: one(unitsInCore, {
		fields: [liquidacaoInFinance.unitId],
		references: [unitsInCore.id]
	}),
	pagamentoInFinances: many(pagamentoInFinance),
}));

export const purchaseItemIngredientInProcurementRelations = relations(purchaseItemIngredientInProcurement, ({one}) => ({
	ingredientInKitchen: one(ingredientInKitchen, {
		fields: [purchaseItemIngredientInProcurement.ingredientId],
		references: [ingredientInKitchen.id]
	}),
	itemInCore: one(itemInCore, {
		fields: [purchaseItemIngredientInProcurement.ingredientId],
		references: [itemInCore.id]
	}),
	purchaseItemInProcurement: one(purchaseItemInProcurement, {
		fields: [purchaseItemIngredientInProcurement.purchaseItemId],
		references: [purchaseItemInProcurement.id]
	}),
}));

export const itemInCoreRelations = relations(itemInCore, ({one, many}) => ({
	purchaseItemIngredientInProcurements: many(purchaseItemIngredientInProcurement),
	ingredientInKitchens: many(ingredientInKitchen),
	measureUnitInCore: one(measureUnitInCore, {
		fields: [itemInCore.measureUnit],
		references: [measureUnitInCore.code]
	}),
}));

export const receiptScanEventInInventoryRelations = relations(receiptScanEventInInventory, ({one, many}) => ({
	usersInAuth: one(usersInAuth, {
		fields: [receiptScanEventInInventory.createdBy],
		references: [usersInAuth.id]
	}),
	goodsReceiptInInventory: one(goodsReceiptInInventory, {
		fields: [receiptScanEventInInventory.receiptId],
		references: [goodsReceiptInInventory.id]
	}),
	goodsReceiptItemInInventory: one(goodsReceiptItemInInventory, {
		fields: [receiptScanEventInInventory.receiptItemId],
		references: [goodsReceiptItemInInventory.id]
	}),
	receiptScanEventInInventory: one(receiptScanEventInInventory, {
		fields: [receiptScanEventInInventory.reversedEventId],
		references: [receiptScanEventInInventory.id],
		relationName: "receiptScanEventInInventory_reversedEventId_receiptScanEventInInventory_id"
	}),
	receiptScanEventInInventories: many(receiptScanEventInInventory, {
		relationName: "receiptScanEventInInventory_reversedEventId_receiptScanEventInInventory_id"
	}),
}));

export const goodsReceiptItemInInventoryRelations = relations(goodsReceiptItemInInventory, ({one, many}) => ({
	receiptScanEventInInventories: many(receiptScanEventInInventory),
	frozenPreparationInKitchen: one(frozenPreparationInKitchen, {
		fields: [goodsReceiptItemInInventory.frozenPreparationId],
		references: [frozenPreparationInKitchen.id]
	}),
	ingredientInKitchen: one(ingredientInKitchen, {
		fields: [goodsReceiptItemInInventory.ingredientId],
		references: [ingredientInKitchen.id]
	}),
	ingredientItemInKitchen: one(ingredientItemInKitchen, {
		fields: [goodsReceiptItemInInventory.ingredientItemId],
		references: [ingredientItemInKitchen.id]
	}),
	nfeItemInInventory: one(nfeItemInInventory, {
		fields: [goodsReceiptItemInInventory.nfeItemId],
		references: [nfeItemInInventory.id]
	}),
	purchaseItemInProcurement: one(purchaseItemInProcurement, {
		fields: [goodsReceiptItemInInventory.purchaseItemId],
		references: [purchaseItemInProcurement.id]
	}),
	goodsReceiptInInventory: one(goodsReceiptInInventory, {
		fields: [goodsReceiptItemInInventory.receiptId],
		references: [goodsReceiptInInventory.id]
	}),
	stockMovementInInventories: many(stockMovementInInventory),
	stockLotInInventories: many(stockLotInInventory),
	goodsReceiptItemLotInInventories: many(goodsReceiptItemLotInInventory),
}));

export const procurementListSelectionInProcurementRelations = relations(procurementListSelectionInProcurement, ({one}) => ({
	procurementListKitchenInProcurement: one(procurementListKitchenInProcurement, {
		fields: [procurementListSelectionInProcurement.listKitchenId],
		references: [procurementListKitchenInProcurement.id]
	}),
	menuTemplateInKitchen_templateId: one(menuTemplateInKitchen, {
		fields: [procurementListSelectionInProcurement.templateId],
		references: [menuTemplateInKitchen.id],
		relationName: "procurementListSelectionInProcurement_templateId_menuTemplateInKitchen_id"
	}),
	menuTemplateInKitchen_originTemplateId: one(menuTemplateInKitchen, {
		fields: [procurementListSelectionInProcurement.originTemplateId],
		references: [menuTemplateInKitchen.id],
		relationName: "procurementListSelectionInProcurement_originTemplateId_menuTemplateInKitchen_id"
	}),
}));

export const procurementListKitchenInProcurementRelations = relations(procurementListKitchenInProcurement, ({one, many}) => ({
	procurementListSelectionInProcurements: many(procurementListSelectionInProcurement),
	procurementListInProcurement: one(procurementListInProcurement, {
		fields: [procurementListKitchenInProcurement.listId],
		references: [procurementListInProcurement.id]
	}),
	kitchenInKitchen: one(kitchenInKitchen, {
		fields: [procurementListKitchenInProcurement.kitchenId],
		references: [kitchenInKitchen.id]
	}),
}));

export const preparationGroupInKitchenRelations = relations(preparationGroupInKitchen, ({one, many}) => ({
	ingredientInKitchens: many(ingredientInKitchen),
	preparationGroupInKitchen: one(preparationGroupInKitchen, {
		fields: [preparationGroupInKitchen.parentId],
		references: [preparationGroupInKitchen.id],
		relationName: "preparationGroupInKitchen_parentId_preparationGroupInKitchen_id"
	}),
	preparationGroupInKitchens: many(preparationGroupInKitchen, {
		relationName: "preparationGroupInKitchen_parentId_preparationGroupInKitchen_id"
	}),
}));

export const ceafaInKitchenRelations = relations(ceafaInKitchen, ({many}) => ({
	ingredientInKitchens: many(ingredientInKitchen),
	frozenPreparationInKitchens: many(frozenPreparationInKitchen),
}));

export const folderInKitchenRelations = relations(folderInKitchen, ({many}) => ({
	ingredientInKitchens: many(ingredientInKitchen),
	folderReviewInKitchens: many(folderReviewInKitchen),
}));

export const comprasMaterialItemInComprasGovIntegrationRelations = relations(comprasMaterialItemInComprasGovIntegration, ({many}) => ({
	purchaseItemInProcurements: many(purchaseItemInProcurement),
}));

export const equipmentModelRoleInKitchenRelations = relations(equipmentModelRoleInKitchen, ({one}) => ({
	equipmentModelInKitchen: one(equipmentModelInKitchen, {
		fields: [equipmentModelRoleInKitchen.modelId],
		references: [equipmentModelInKitchen.id]
	}),
	equipmentRoleInKitchen: one(equipmentRoleInKitchen, {
		fields: [equipmentModelRoleInKitchen.roleId],
		references: [equipmentRoleInKitchen.id]
	}),
}));

export const equipmentModelInKitchenRelations = relations(equipmentModelInKitchen, ({one, many}) => ({
	equipmentModelRoleInKitchens: many(equipmentModelRoleInKitchen),
	recipeEquipmentRequirementInKitchens: many(recipeEquipmentRequirementInKitchen),
	kitchenInKitchen: one(kitchenInKitchen, {
		fields: [equipmentModelInKitchen.kitchenId],
		references: [kitchenInKitchen.id]
	}),
	equipmentUnitInKitchens: many(equipmentUnitInKitchen),
	equipmentMaintenancePlanInKitchens: many(equipmentMaintenancePlanInKitchen),
}));

export const equipmentRoleInKitchenRelations = relations(equipmentRoleInKitchen, ({many}) => ({
	equipmentModelRoleInKitchens: many(equipmentModelRoleInKitchen),
	equipmentUnitRoleInKitchens: many(equipmentUnitRoleInKitchen),
	recipeEquipmentRequirementInKitchens: many(recipeEquipmentRequirementInKitchen),
	utensilInKitchens: many(utensilInKitchen),
	equipmentMaintenancePlanInKitchens: many(equipmentMaintenancePlanInKitchen),
}));

export const equipmentUnitRoleInKitchenRelations = relations(equipmentUnitRoleInKitchen, ({one}) => ({
	equipmentRoleInKitchen: one(equipmentRoleInKitchen, {
		fields: [equipmentUnitRoleInKitchen.roleId],
		references: [equipmentRoleInKitchen.id]
	}),
	equipmentUnitInKitchen: one(equipmentUnitInKitchen, {
		fields: [equipmentUnitRoleInKitchen.unitId],
		references: [equipmentUnitInKitchen.id]
	}),
}));

export const equipmentUnitInKitchenRelations = relations(equipmentUnitInKitchen, ({one, many}) => ({
	equipmentUnitRoleInKitchens: many(equipmentUnitRoleInKitchen),
	kitchenInKitchen: one(kitchenInKitchen, {
		fields: [equipmentUnitInKitchen.kitchenId],
		references: [kitchenInKitchen.id]
	}),
	equipmentModelInKitchen: one(equipmentModelInKitchen, {
		fields: [equipmentUnitInKitchen.modelId],
		references: [equipmentModelInKitchen.id]
	}),
	equipmentMaintenanceLogInKitchens: many(equipmentMaintenanceLogInKitchen),
	equipmentIssueInKitchens: many(equipmentIssueInKitchen),
}));

export const gtinAliasInGs1IntegrationRelations = relations(gtinAliasInGs1Integration, ({one}) => ({
	usersInAuth_createdBy: one(usersInAuth, {
		fields: [gtinAliasInGs1Integration.createdBy],
		references: [usersInAuth.id],
		relationName: "gtinAliasInGs1Integration_createdBy_usersInAuth_id"
	}),
	ingredientItemInKitchen: one(ingredientItemInKitchen, {
		fields: [gtinAliasInGs1Integration.ingredientItemId],
		references: [ingredientItemInKitchen.id]
	}),
	kitchenInKitchen: one(kitchenInKitchen, {
		fields: [gtinAliasInGs1Integration.kitchenId],
		references: [kitchenInKitchen.id]
	}),
	usersInAuth_reviewedBy: one(usersInAuth, {
		fields: [gtinAliasInGs1Integration.reviewedBy],
		references: [usersInAuth.id],
		relationName: "gtinAliasInGs1Integration_reviewedBy_usersInAuth_id"
	}),
}));

export const recipeEquipmentRequirementInKitchenRelations = relations(recipeEquipmentRequirementInKitchen, ({one}) => ({
	equipmentModelInKitchen: one(equipmentModelInKitchen, {
		fields: [recipeEquipmentRequirementInKitchen.modelId],
		references: [equipmentModelInKitchen.id]
	}),
	recipesInKitchen: one(recipesInKitchen, {
		fields: [recipeEquipmentRequirementInKitchen.recipeId],
		references: [recipesInKitchen.id]
	}),
	recipeStepInKitchen: one(recipeStepInKitchen, {
		fields: [recipeEquipmentRequirementInKitchen.recipeStepId],
		references: [recipeStepInKitchen.id]
	}),
	equipmentRoleInKitchen: one(equipmentRoleInKitchen, {
		fields: [recipeEquipmentRequirementInKitchen.roleId],
		references: [equipmentRoleInKitchen.id]
	}),
}));

export const recipeStepInKitchenRelations = relations(recipeStepInKitchen, ({one, many}) => ({
	recipeEquipmentRequirementInKitchens: many(recipeEquipmentRequirementInKitchen),
	recipesInKitchen: one(recipesInKitchen, {
		fields: [recipeStepInKitchen.recipeId],
		references: [recipesInKitchen.id]
	}),
	stepTemplateInKitchen: one(stepTemplateInKitchen, {
		fields: [recipeStepInKitchen.stepTemplateId],
		references: [stepTemplateInKitchen.id]
	}),
	recipeStepOutputInKitchens: many(recipeStepOutputInKitchen),
	recipeStepInputInKitchens: many(recipeStepInputInKitchen),
	recipeStepUtensilInKitchens: many(recipeStepUtensilInKitchen),
}));

export const analyticsChatSessionInKitchenRelations = relations(analyticsChatSessionInKitchen, ({one, many}) => ({
	usersInAuth: one(usersInAuth, {
		fields: [analyticsChatSessionInKitchen.userId],
		references: [usersInAuth.id]
	}),
	analyticsChatMessageInKitchens: many(analyticsChatMessageInKitchen),
}));

export const analyticsChatMessageInKitchenRelations = relations(analyticsChatMessageInKitchen, ({one}) => ({
	analyticsChatSessionInKitchen: one(analyticsChatSessionInKitchen, {
		fields: [analyticsChatMessageInKitchen.sessionId],
		references: [analyticsChatSessionInKitchen.id]
	}),
}));

export const productionTaskInKitchenRelations = relations(productionTaskInKitchen, ({one, many}) => ({
	kitchenInKitchen: one(kitchenInKitchen, {
		fields: [productionTaskInKitchen.kitchenId],
		references: [kitchenInKitchen.id]
	}),
	menuItemsInKitchen: one(menuItemsInKitchen, {
		fields: [productionTaskInKitchen.menuItemId],
		references: [menuItemsInKitchen.id]
	}),
	stockMovementInInventories: many(stockMovementInInventory),
}));

export const menuItemsInKitchenRelations = relations(menuItemsInKitchen, ({one, many}) => ({
	productionTaskInKitchens: many(productionTaskInKitchen),
	dailyMenuInKitchen: one(dailyMenuInKitchen, {
		fields: [menuItemsInKitchen.dailyMenuId],
		references: [dailyMenuInKitchen.id]
	}),
	snackRequestInKitchen: one(snackRequestInKitchen, {
		fields: [menuItemsInKitchen.originSnackRequestId],
		references: [snackRequestInKitchen.id]
	}),
	menuTemplateInKitchen: one(menuTemplateInKitchen, {
		fields: [menuItemsInKitchen.originTemplateId],
		references: [menuTemplateInKitchen.id]
	}),
	recipesInKitchen: one(recipesInKitchen, {
		fields: [menuItemsInKitchen.recipeOriginId],
		references: [recipesInKitchen.id]
	}),
}));

export const ranchoInKitchenRelations = relations(ranchoInKitchen, ({one, many}) => ({
	kitchenInKitchen: one(kitchenInKitchen, {
		fields: [ranchoInKitchen.kitchenId],
		references: [kitchenInKitchen.id]
	}),
	messHallsInKitchen: one(messHallsInKitchen, {
		fields: [ranchoInKitchen.messHallId],
		references: [messHallsInKitchen.id]
	}),
	unitsInCore: one(unitsInCore, {
		fields: [ranchoInKitchen.unitId],
		references: [unitsInCore.id]
	}),
	workforceSubmissionInKitchens: many(workforceSubmissionInKitchen),
}));

export const workforceSurveyInKitchenRelations = relations(workforceSurveyInKitchen, ({one, many}) => ({
	usersInAuth: one(usersInAuth, {
		fields: [workforceSurveyInKitchen.createdBy],
		references: [usersInAuth.id]
	}),
	workforceSubmissionInKitchens: many(workforceSubmissionInKitchen),
}));

export const workforceSubmissionInKitchenRelations = relations(workforceSubmissionInKitchen, ({one, many}) => ({
	ranchoInKitchen: one(ranchoInKitchen, {
		fields: [workforceSubmissionInKitchen.ranchoId],
		references: [ranchoInKitchen.id]
	}),
	usersInAuth: one(usersInAuth, {
		fields: [workforceSubmissionInKitchen.submittedBy],
		references: [usersInAuth.id]
	}),
	workforceSurveyInKitchen: one(workforceSurveyInKitchen, {
		fields: [workforceSubmissionInKitchen.surveyId],
		references: [workforceSurveyInKitchen.id]
	}),
	workforceHeadcountInKitchens: many(workforceHeadcountInKitchen),
	workforceNoteInKitchens: many(workforceNoteInKitchen),
}));

export const stockIssueRequestInInventoryRelations = relations(stockIssueRequestInInventory, ({one, many}) => ({
	usersInAuth_closedBy: one(usersInAuth, {
		fields: [stockIssueRequestInInventory.closedBy],
		references: [usersInAuth.id],
		relationName: "stockIssueRequestInInventory_closedBy_usersInAuth_id"
	}),
	usersInAuth_createdBy: one(usersInAuth, {
		fields: [stockIssueRequestInInventory.createdBy],
		references: [usersInAuth.id],
		relationName: "stockIssueRequestInInventory_createdBy_usersInAuth_id"
	}),
	kitchenInKitchen: one(kitchenInKitchen, {
		fields: [stockIssueRequestInInventory.kitchenId],
		references: [kitchenInKitchen.id]
	}),
	stockIssueRequestItemInInventories: many(stockIssueRequestItemInInventory),
	stockMovementInInventories: many(stockMovementInInventory),
}));

export const stockIssueRequestItemInInventoryRelations = relations(stockIssueRequestItemInInventory, ({one}) => ({
	ingredientInKitchen: one(ingredientInKitchen, {
		fields: [stockIssueRequestItemInInventory.ingredientId],
		references: [ingredientInKitchen.id]
	}),
	mealTypeInKitchen: one(mealTypeInKitchen, {
		fields: [stockIssueRequestItemInInventory.mealTypeId],
		references: [mealTypeInKitchen.id]
	}),
	stockIssueRequestInInventory: one(stockIssueRequestInInventory, {
		fields: [stockIssueRequestItemInInventory.requestId],
		references: [stockIssueRequestInInventory.id]
	}),
}));

export const workforceHeadcountInKitchenRelations = relations(workforceHeadcountInKitchen, ({one}) => ({
	workforceCategoryInKitchen: one(workforceCategoryInKitchen, {
		fields: [workforceHeadcountInKitchen.categoryId],
		references: [workforceCategoryInKitchen.id]
	}),
	workforceSubmissionInKitchen: one(workforceSubmissionInKitchen, {
		fields: [workforceHeadcountInKitchen.submissionId],
		references: [workforceSubmissionInKitchen.id]
	}),
}));

export const workforceCategoryInKitchenRelations = relations(workforceCategoryInKitchen, ({many}) => ({
	workforceHeadcountInKitchens: many(workforceHeadcountInKitchen),
}));

export const mealPresencesInKitchenRelations = relations(mealPresencesInKitchen, ({one}) => ({
	messHallsInKitchen: one(messHallsInKitchen, {
		fields: [mealPresencesInKitchen.messHallId],
		references: [messHallsInKitchen.id]
	}),
	usersInAuth: one(usersInAuth, {
		fields: [mealPresencesInKitchen.userId],
		references: [usersInAuth.id]
	}),
}));

export const workforceNoteInKitchenRelations = relations(workforceNoteInKitchen, ({one}) => ({
	workforceSubmissionInKitchen: one(workforceSubmissionInKitchen, {
		fields: [workforceNoteInKitchen.submissionId],
		references: [workforceSubmissionInKitchen.id]
	}),
}));

export const ingredientNutritionReferenceInKitchenRelations = relations(ingredientNutritionReferenceInKitchen, ({one}) => ({
	foodItemRevisionInNutritionReference: one(foodItemRevisionInNutritionReference, {
		fields: [ingredientNutritionReferenceInKitchen.foodRevisionId],
		references: [foodItemRevisionInNutritionReference.id]
	}),
	ingredientInKitchen: one(ingredientInKitchen, {
		fields: [ingredientNutritionReferenceInKitchen.ingredientId],
		references: [ingredientInKitchen.id]
	}),
}));

export const menuTemplateMealInKitchenRelations = relations(menuTemplateMealInKitchen, ({one}) => ({
	mealTypeInKitchen: one(mealTypeInKitchen, {
		fields: [menuTemplateMealInKitchen.mealTypeId],
		references: [mealTypeInKitchen.id]
	}),
	menuTemplateInKitchen: one(menuTemplateInKitchen, {
		fields: [menuTemplateMealInKitchen.menuTemplateId],
		references: [menuTemplateInKitchen.id]
	}),
}));

export const otherPresencesInKitchenRelations = relations(otherPresencesInKitchen, ({one}) => ({
	usersInAuth: one(usersInAuth, {
		fields: [otherPresencesInKitchen.adminId],
		references: [usersInAuth.id]
	}),
	messHallsInKitchen: one(messHallsInKitchen, {
		fields: [otherPresencesInKitchen.messHallId],
		references: [messHallsInKitchen.id]
	}),
}));

export const stepTemplateUtensilInKitchenRelations = relations(stepTemplateUtensilInKitchen, ({one}) => ({
	stepTemplateInKitchen: one(stepTemplateInKitchen, {
		fields: [stepTemplateUtensilInKitchen.stepTemplateId],
		references: [stepTemplateInKitchen.id]
	}),
	utensilInKitchen: one(utensilInKitchen, {
		fields: [stepTemplateUtensilInKitchen.utensilId],
		references: [utensilInKitchen.id]
	}),
}));

export const stepTemplateInKitchenRelations = relations(stepTemplateInKitchen, ({one, many}) => ({
	stepTemplateUtensilInKitchens: many(stepTemplateUtensilInKitchen),
	recipeStepInKitchens: many(recipeStepInKitchen),
	kitchenInKitchen: one(kitchenInKitchen, {
		fields: [stepTemplateInKitchen.kitchenId],
		references: [kitchenInKitchen.id]
	}),
}));

export const utensilInKitchenRelations = relations(utensilInKitchen, ({one, many}) => ({
	stepTemplateUtensilInKitchens: many(stepTemplateUtensilInKitchen),
	kitchenInKitchen: one(kitchenInKitchen, {
		fields: [utensilInKitchen.kitchenId],
		references: [kitchenInKitchen.id]
	}),
	equipmentRoleInKitchen: one(equipmentRoleInKitchen, {
		fields: [utensilInKitchen.roleId],
		references: [equipmentRoleInKitchen.id]
	}),
	recipeStepUtensilInKitchens: many(recipeStepUtensilInKitchen),
}));

export const recipeIngredientAlternativesInKitchenRelations = relations(recipeIngredientAlternativesInKitchen, ({one}) => ({
	frozenPreparationInKitchen: one(frozenPreparationInKitchen, {
		fields: [recipeIngredientAlternativesInKitchen.frozenPreparationId],
		references: [frozenPreparationInKitchen.id]
	}),
	ingredientInKitchen: one(ingredientInKitchen, {
		fields: [recipeIngredientAlternativesInKitchen.ingredientId],
		references: [ingredientInKitchen.id]
	}),
	recipeIngredientsInKitchen: one(recipeIngredientsInKitchen, {
		fields: [recipeIngredientAlternativesInKitchen.recipeIngredientId],
		references: [recipeIngredientsInKitchen.id]
	}),
}));

export const frozenPreparationInKitchenRelations = relations(frozenPreparationInKitchen, ({one, many}) => ({
	recipeIngredientAlternativesInKitchens: many(recipeIngredientAlternativesInKitchen),
	stockCostInInventories: many(stockCostInInventory),
	recipeIngredientsInKitchens: many(recipeIngredientsInKitchen),
	ceafaInKitchen: one(ceafaInKitchen, {
		fields: [frozenPreparationInKitchen.ceafaId],
		references: [ceafaInKitchen.id]
	}),
	recipesInKitchen_productionRecipeId: one(recipesInKitchen, {
		fields: [frozenPreparationInKitchen.productionRecipeId],
		references: [recipesInKitchen.id],
		relationName: "frozenPreparationInKitchen_productionRecipeId_recipesInKitchen_id"
	}),
	recipesInKitchen_regenerationRecipeId: one(recipesInKitchen, {
		fields: [frozenPreparationInKitchen.regenerationRecipeId],
		references: [recipesInKitchen.id],
		relationName: "frozenPreparationInKitchen_regenerationRecipeId_recipesInKitchen_id"
	}),
	ingredientInKitchen: one(ingredientInKitchen, {
		fields: [frozenPreparationInKitchen.sourceIngredientId],
		references: [ingredientInKitchen.id]
	}),
	goodsReceiptItemInInventories: many(goodsReceiptItemInInventory),
	stockMovementInInventories: many(stockMovementInInventory),
	countScopeItemInInventories: many(countScopeItemInInventory),
	stockLotInInventories: many(stockLotInInventory),
	inventoryCountEntryInInventories: many(inventoryCountEntryInInventory),
	stockAdjustmentItemInInventories: many(stockAdjustmentItemInInventory),
}));

export const recipeIngredientsInKitchenRelations = relations(recipeIngredientsInKitchen, ({one, many}) => ({
	recipeIngredientAlternativesInKitchens: many(recipeIngredientAlternativesInKitchen),
	recipeStepInputInKitchens: many(recipeStepInputInKitchen),
	frozenPreparationInKitchen: one(frozenPreparationInKitchen, {
		fields: [recipeIngredientsInKitchen.frozenPreparationId],
		references: [frozenPreparationInKitchen.id]
	}),
	ingredientInKitchen: one(ingredientInKitchen, {
		fields: [recipeIngredientsInKitchen.ingredientId],
		references: [ingredientInKitchen.id]
	}),
	recipesInKitchen: one(recipesInKitchen, {
		fields: [recipeIngredientsInKitchen.recipeId],
		references: [recipesInKitchen.id]
	}),
}));

export const ingredientNutrientInKitchenRelations = relations(ingredientNutrientInKitchen, ({one}) => ({
	nutrientInKitchen: one(nutrientInKitchen, {
		fields: [ingredientNutrientInKitchen.nutrientId],
		references: [nutrientInKitchen.id]
	}),
	ingredientInKitchen: one(ingredientInKitchen, {
		fields: [ingredientNutrientInKitchen.ingredientId],
		references: [ingredientInKitchen.id]
	}),
}));

export const ingredientVersionInKitchenRelations = relations(ingredientVersionInKitchen, ({one}) => ({
	ingredientInKitchen: one(ingredientInKitchen, {
		fields: [ingredientVersionInKitchen.ingredientId],
		references: [ingredientInKitchen.id]
	}),
}));

export const moduleChatSessionInKitchenRelations = relations(moduleChatSessionInKitchen, ({one, many}) => ({
	usersInAuth: one(usersInAuth, {
		fields: [moduleChatSessionInKitchen.userId],
		references: [usersInAuth.id]
	}),
	moduleChatMessageInKitchens: many(moduleChatMessageInKitchen),
}));

export const moduleChatMessageInKitchenRelations = relations(moduleChatMessageInKitchen, ({one}) => ({
	moduleChatSessionInKitchen: one(moduleChatSessionInKitchen, {
		fields: [moduleChatMessageInKitchen.sessionId],
		references: [moduleChatSessionInKitchen.id]
	}),
}));

export const mealForecastsInKitchenRelations = relations(mealForecastsInKitchen, ({one}) => ({
	messHallsInKitchen: one(messHallsInKitchen, {
		fields: [mealForecastsInKitchen.messHallId],
		references: [messHallsInKitchen.id]
	}),
	usersInAuth: one(usersInAuth, {
		fields: [mealForecastsInKitchen.userId],
		references: [usersInAuth.id]
	}),
}));

export const dailyMenuInKitchenRelations = relations(dailyMenuInKitchen, ({one, many}) => ({
	kitchenInKitchen: one(kitchenInKitchen, {
		fields: [dailyMenuInKitchen.kitchenId],
		references: [kitchenInKitchen.id]
	}),
	mealTypeInKitchen: one(mealTypeInKitchen, {
		fields: [dailyMenuInKitchen.mealTypeId],
		references: [mealTypeInKitchen.id]
	}),
	menuItemsInKitchens: many(menuItemsInKitchen),
}));

export const inventoryCountItemInInventoryRelations = relations(inventoryCountItemInInventory, ({one}) => ({
	inventoryCountInInventory: one(inventoryCountInInventory, {
		fields: [inventoryCountItemInInventory.countId],
		references: [inventoryCountInInventory.id]
	}),
	stockLotInInventory: one(stockLotInInventory, {
		fields: [inventoryCountItemInInventory.lotId],
		references: [stockLotInInventory.id]
	}),
}));

export const inventoryCountInInventoryRelations = relations(inventoryCountInInventory, ({one, many}) => ({
	inventoryCountItemInInventories: many(inventoryCountItemInInventory),
	stockAdjustmentInInventory: one(stockAdjustmentInInventory, {
		fields: [inventoryCountInInventory.adjustmentId],
		references: [stockAdjustmentInInventory.id],
		relationName: "inventoryCountInInventory_adjustmentId_stockAdjustmentInInventory_id"
	}),
	usersInAuth_approvedBy: one(usersInAuth, {
		fields: [inventoryCountInInventory.approvedBy],
		references: [usersInAuth.id],
		relationName: "inventoryCountInInventory_approvedBy_usersInAuth_id"
	}),
	usersInAuth_confirmedBy: one(usersInAuth, {
		fields: [inventoryCountInInventory.confirmedBy],
		references: [usersInAuth.id],
		relationName: "inventoryCountInInventory_confirmedBy_usersInAuth_id"
	}),
	usersInAuth_createdBy: one(usersInAuth, {
		fields: [inventoryCountInInventory.createdBy],
		references: [usersInAuth.id],
		relationName: "inventoryCountInInventory_createdBy_usersInAuth_id"
	}),
	kitchenInKitchen: one(kitchenInKitchen, {
		fields: [inventoryCountInInventory.kitchenId],
		references: [kitchenInKitchen.id]
	}),
	inventoryCountInInventory: one(inventoryCountInInventory, {
		fields: [inventoryCountInInventory.parentCountId],
		references: [inventoryCountInInventory.id],
		relationName: "inventoryCountInInventory_parentCountId_inventoryCountInInventory_id"
	}),
	inventoryCountInInventories: many(inventoryCountInInventory, {
		relationName: "inventoryCountInInventory_parentCountId_inventoryCountInInventory_id"
	}),
	stockMovementInInventories: many(stockMovementInInventory),
	countScopeItemInInventories: many(countScopeItemInInventory),
	inventoryCountEntryInInventories: many(inventoryCountEntryInInventory),
	stockAdjustmentInInventories: many(stockAdjustmentInInventory, {
		relationName: "stockAdjustmentInInventory_inventoryCountId_inventoryCountInInventory_id"
	}),
}));

export const stockLotInInventoryRelations = relations(stockLotInInventory, ({one, many}) => ({
	inventoryCountItemInInventories: many(inventoryCountItemInInventory),
	openingBalanceItemInInventories: many(openingBalanceItemInInventory),
	stockMovementInInventories: many(stockMovementInInventory),
	frozenPreparationInKitchen: one(frozenPreparationInKitchen, {
		fields: [stockLotInInventory.frozenPreparationId],
		references: [frozenPreparationInKitchen.id]
	}),
	goodsReceiptItemInInventory: one(goodsReceiptItemInInventory, {
		fields: [stockLotInInventory.goodsReceiptItemId],
		references: [goodsReceiptItemInInventory.id]
	}),
	goodsReceiptItemLotInInventory: one(goodsReceiptItemLotInInventory, {
		fields: [stockLotInInventory.goodsReceiptItemLotId],
		references: [goodsReceiptItemLotInInventory.id]
	}),
	ingredientInKitchen: one(ingredientInKitchen, {
		fields: [stockLotInInventory.ingredientId],
		references: [ingredientInKitchen.id]
	}),
	kitchenInKitchen: one(kitchenInKitchen, {
		fields: [stockLotInInventory.kitchenId],
		references: [kitchenInKitchen.id]
	}),
	stockLotInInventory: one(stockLotInInventory, {
		fields: [stockLotInInventory.parentLotId],
		references: [stockLotInInventory.id],
		relationName: "stockLotInInventory_parentLotId_stockLotInInventory_id"
	}),
	stockLotInInventories: many(stockLotInInventory, {
		relationName: "stockLotInInventory_parentLotId_stockLotInInventory_id"
	}),
	usersInAuth: one(usersInAuth, {
		fields: [stockLotInInventory.quarantinedBy],
		references: [usersInAuth.id]
	}),
	inventoryCountEntryInInventories: many(inventoryCountEntryInInventory),
	stockAdjustmentItemInInventories: many(stockAdjustmentItemInInventory),
}));

export const menuGroupSetInKitchenRelations = relations(menuGroupSetInKitchen, ({one, many}) => ({
	mealTypeInKitchens: many(mealTypeInKitchen),
	kitchenInKitchen: one(kitchenInKitchen, {
		fields: [menuGroupSetInKitchen.kitchenId],
		references: [kitchenInKitchen.id]
	}),
	menuGroupInKitchens: many(menuGroupInKitchen),
}));

export const stockCostInInventoryRelations = relations(stockCostInInventory, ({one}) => ({
	frozenPreparationInKitchen: one(frozenPreparationInKitchen, {
		fields: [stockCostInInventory.frozenPreparationId],
		references: [frozenPreparationInKitchen.id]
	}),
	ingredientInKitchen: one(ingredientInKitchen, {
		fields: [stockCostInInventory.ingredientId],
		references: [ingredientInKitchen.id]
	}),
	kitchenInKitchen: one(kitchenInKitchen, {
		fields: [stockCostInInventory.kitchenId],
		references: [kitchenInKitchen.id]
	}),
}));

export const sensitiveOperationLogInAccessControlRelations = relations(sensitiveOperationLogInAccessControl, ({one}) => ({
	usersInAuth: one(usersInAuth, {
		fields: [sensitiveOperationLogInAccessControl.actorId],
		references: [usersInAuth.id]
	}),
}));

export const recipeStepOutputInKitchenRelations = relations(recipeStepOutputInKitchen, ({one, many}) => ({
	recipesInKitchen: one(recipesInKitchen, {
		fields: [recipeStepOutputInKitchen.recipeId],
		references: [recipesInKitchen.id]
	}),
	recipeStepInKitchen: one(recipeStepInKitchen, {
		fields: [recipeStepOutputInKitchen.recipeStepId],
		references: [recipeStepInKitchen.id]
	}),
	recipeStepInputInKitchens: many(recipeStepInputInKitchen),
}));

export const ingredientSubstitutionInKitchenRelations = relations(ingredientSubstitutionInKitchen, ({one}) => ({
	ingredientInKitchen_ingredientId: one(ingredientInKitchen, {
		fields: [ingredientSubstitutionInKitchen.ingredientId],
		references: [ingredientInKitchen.id],
		relationName: "ingredientSubstitutionInKitchen_ingredientId_ingredientInKitchen_id"
	}),
	ingredientInKitchen_substituteIngredientId: one(ingredientInKitchen, {
		fields: [ingredientSubstitutionInKitchen.substituteIngredientId],
		references: [ingredientInKitchen.id],
		relationName: "ingredientSubstitutionInKitchen_substituteIngredientId_ingredientInKitchen_id"
	}),
}));

export const recipeStepInputInKitchenRelations = relations(recipeStepInputInKitchen, ({one}) => ({
	recipeIngredientsInKitchen: one(recipeIngredientsInKitchen, {
		fields: [recipeStepInputInKitchen.recipeIngredientId],
		references: [recipeIngredientsInKitchen.id]
	}),
	recipeStepInKitchen: one(recipeStepInKitchen, {
		fields: [recipeStepInputInKitchen.recipeStepId],
		references: [recipeStepInKitchen.id]
	}),
	recipeStepOutputInKitchen: one(recipeStepOutputInKitchen, {
		fields: [recipeStepInputInKitchen.sourceOutputId],
		references: [recipeStepOutputInKitchen.id]
	}),
}));

export const recipeStepUtensilInKitchenRelations = relations(recipeStepUtensilInKitchen, ({one}) => ({
	recipeStepInKitchen: one(recipeStepInKitchen, {
		fields: [recipeStepUtensilInKitchen.recipeStepId],
		references: [recipeStepInKitchen.id]
	}),
	utensilInKitchen: one(utensilInKitchen, {
		fields: [recipeStepUtensilInKitchen.utensilId],
		references: [utensilInKitchen.id]
	}),
}));

export const mfaRecoveryCodeInAccessControlRelations = relations(mfaRecoveryCodeInAccessControl, ({one}) => ({
	usersInAuth: one(usersInAuth, {
		fields: [mfaRecoveryCodeInAccessControl.userId],
		references: [usersInAuth.id]
	}),
}));

export const opinionsInKitchenRelations = relations(opinionsInKitchen, ({one}) => ({
	usersInAuth: one(usersInAuth, {
		fields: [opinionsInKitchen.userId],
		references: [usersInAuth.id]
	}),
}));

export const mfaResetLogInAccessControlRelations = relations(mfaResetLogInAccessControl, ({one}) => ({
	usersInAuth_performedBy: one(usersInAuth, {
		fields: [mfaResetLogInAccessControl.performedBy],
		references: [usersInAuth.id],
		relationName: "mfaResetLogInAccessControl_performedBy_usersInAuth_id"
	}),
	usersInAuth_targetUserId: one(usersInAuth, {
		fields: [mfaResetLogInAccessControl.targetUserId],
		references: [usersInAuth.id],
		relationName: "mfaResetLogInAccessControl_targetUserId_usersInAuth_id"
	}),
}));

export const menuTemplateItemsInKitchenRelations = relations(menuTemplateItemsInKitchen, ({one}) => ({
	menuTemplateEventMealInKitchen: one(menuTemplateEventMealInKitchen, {
		fields: [menuTemplateItemsInKitchen.eventMealId],
		references: [menuTemplateEventMealInKitchen.id]
	}),
	mealTypeInKitchen: one(mealTypeInKitchen, {
		fields: [menuTemplateItemsInKitchen.mealTypeId],
		references: [mealTypeInKitchen.id]
	}),
	menuTemplateInKitchen: one(menuTemplateInKitchen, {
		fields: [menuTemplateItemsInKitchen.menuTemplateId],
		references: [menuTemplateInKitchen.id]
	}),
	recipesInKitchen: one(recipesInKitchen, {
		fields: [menuTemplateItemsInKitchen.recipeId],
		references: [recipesInKitchen.id]
	}),
}));

export const ingredientReviewInKitchenRelations = relations(ingredientReviewInKitchen, ({one}) => ({
	ingredientInKitchen: one(ingredientInKitchen, {
		fields: [ingredientReviewInKitchen.ingredientId],
		references: [ingredientInKitchen.id]
	}),
}));

export const snackRequestInKitchenRelations = relations(snackRequestInKitchen, ({one, many}) => ({
	usersInAuth_cancelledBy: one(usersInAuth, {
		fields: [snackRequestInKitchen.cancelledBy],
		references: [usersInAuth.id],
		relationName: "snackRequestInKitchen_cancelledBy_usersInAuth_id"
	}),
	usersInAuth_decidedBy: one(usersInAuth, {
		fields: [snackRequestInKitchen.decidedBy],
		references: [usersInAuth.id],
		relationName: "snackRequestInKitchen_decidedBy_usersInAuth_id"
	}),
	usersInAuth_deliveredBy: one(usersInAuth, {
		fields: [snackRequestInKitchen.deliveredBy],
		references: [usersInAuth.id],
		relationName: "snackRequestInKitchen_deliveredBy_usersInAuth_id"
	}),
	kitchenInKitchen: one(kitchenInKitchen, {
		fields: [snackRequestInKitchen.kitchenId],
		references: [kitchenInKitchen.id]
	}),
	usersInAuth_requestedBy: one(usersInAuth, {
		fields: [snackRequestInKitchen.requestedBy],
		references: [usersInAuth.id],
		relationName: "snackRequestInKitchen_requestedBy_usersInAuth_id"
	}),
	usersInAuth_sampleCollectedBy: one(usersInAuth, {
		fields: [snackRequestInKitchen.sampleCollectedBy],
		references: [usersInAuth.id],
		relationName: "snackRequestInKitchen_sampleCollectedBy_usersInAuth_id"
	}),
	snackRequestLineInKitchens: many(snackRequestLineInKitchen),
	snackRequestEventInKitchens: many(snackRequestEventInKitchen),
	snackRequestMaterialInKitchens: many(snackRequestMaterialInKitchen),
	menuItemsInKitchens: many(menuItemsInKitchen),
}));

export const snackRequestLineInKitchenRelations = relations(snackRequestLineInKitchen, ({one}) => ({
	snackRequestInKitchen: one(snackRequestInKitchen, {
		fields: [snackRequestLineInKitchen.requestId],
		references: [snackRequestInKitchen.id]
	}),
	menuTemplateInKitchen: one(menuTemplateInKitchen, {
		fields: [snackRequestLineInKitchen.standardId],
		references: [menuTemplateInKitchen.id]
	}),
}));

export const snackRequestEventInKitchenRelations = relations(snackRequestEventInKitchen, ({one}) => ({
	usersInAuth: one(usersInAuth, {
		fields: [snackRequestEventInKitchen.actorId],
		references: [usersInAuth.id]
	}),
	snackRequestInKitchen: one(snackRequestInKitchen, {
		fields: [snackRequestEventInKitchen.requestId],
		references: [snackRequestInKitchen.id]
	}),
}));

export const monthlyClosingInInventoryRelations = relations(monthlyClosingInInventory, ({one}) => ({
	usersInAuth: one(usersInAuth, {
		fields: [monthlyClosingInInventory.closedBy],
		references: [usersInAuth.id]
	}),
	kitchenInKitchen: one(kitchenInKitchen, {
		fields: [monthlyClosingInInventory.kitchenId],
		references: [kitchenInKitchen.id]
	}),
}));

export const snackRequestMaterialInKitchenRelations = relations(snackRequestMaterialInKitchen, ({one}) => ({
	snackRequestInKitchen: one(snackRequestInKitchen, {
		fields: [snackRequestMaterialInKitchen.requestId],
		references: [snackRequestInKitchen.id]
	}),
}));

export const stockPolicyInInventoryRelations = relations(stockPolicyInInventory, ({one}) => ({
	ingredientInKitchen: one(ingredientInKitchen, {
		fields: [stockPolicyInInventory.ingredientId],
		references: [ingredientInKitchen.id]
	}),
	kitchenInKitchen: one(kitchenInKitchen, {
		fields: [stockPolicyInInventory.kitchenId],
		references: [kitchenInKitchen.id]
	}),
}));

export const expiryAlertPolicyInInventoryRelations = relations(expiryAlertPolicyInInventory, ({one}) => ({
	usersInAuth: one(usersInAuth, {
		fields: [expiryAlertPolicyInInventory.createdBy],
		references: [usersInAuth.id]
	}),
	ingredientInKitchen: one(ingredientInKitchen, {
		fields: [expiryAlertPolicyInInventory.ingredientId],
		references: [ingredientInKitchen.id]
	}),
	kitchenInKitchen: one(kitchenInKitchen, {
		fields: [expiryAlertPolicyInInventory.kitchenId],
		references: [kitchenInKitchen.id]
	}),
}));

export const stockAdjustmentInInventoryRelations = relations(stockAdjustmentInInventory, ({one, many}) => ({
	inventoryCountInInventories: many(inventoryCountInInventory, {
		relationName: "inventoryCountInInventory_adjustmentId_stockAdjustmentInInventory_id"
	}),
	usersInAuth_createdBy: one(usersInAuth, {
		fields: [stockAdjustmentInInventory.createdBy],
		references: [usersInAuth.id],
		relationName: "stockAdjustmentInInventory_createdBy_usersInAuth_id"
	}),
	usersInAuth_decidedBy: one(usersInAuth, {
		fields: [stockAdjustmentInInventory.decidedBy],
		references: [usersInAuth.id],
		relationName: "stockAdjustmentInInventory_decidedBy_usersInAuth_id"
	}),
	inventoryCountInInventory: one(inventoryCountInInventory, {
		fields: [stockAdjustmentInInventory.inventoryCountId],
		references: [inventoryCountInInventory.id],
		relationName: "stockAdjustmentInInventory_inventoryCountId_inventoryCountInInventory_id"
	}),
	kitchenInKitchen: one(kitchenInKitchen, {
		fields: [stockAdjustmentInInventory.kitchenId],
		references: [kitchenInKitchen.id]
	}),
	stockAdjustmentItemInInventories: many(stockAdjustmentItemInInventory),
	stockAdjustmentAttachmentInInventories: many(stockAdjustmentAttachmentInInventory),
}));

export const gpcAttributeValueInGs1IntegrationRelations = relations(gpcAttributeValueInGs1Integration, ({one, many}) => ({
	gpcAttributeInGs1Integration: one(gpcAttributeInGs1Integration, {
		fields: [gpcAttributeValueInGs1Integration.attributeCode],
		references: [gpcAttributeInGs1Integration.attributeCode]
	}),
	gtinGpcAttributeInGs1Integrations: many(gtinGpcAttributeInGs1Integration),
}));

export const gpcAttributeInGs1IntegrationRelations = relations(gpcAttributeInGs1Integration, ({many}) => ({
	gpcAttributeValueInGs1Integrations: many(gpcAttributeValueInGs1Integration),
	purchaseItemGpcRequirementInProcurements: many(purchaseItemGpcRequirementInProcurement),
	gpcBrickAttributeInGs1Integrations: many(gpcBrickAttributeInGs1Integration),
	gtinGpcAttributeInGs1Integrations: many(gtinGpcAttributeInGs1Integration),
}));

export const gtinSpecificationCheckInGs1IntegrationRelations = relations(gtinSpecificationCheckInGs1Integration, ({one}) => ({
	usersInAuth: one(usersInAuth, {
		fields: [gtinSpecificationCheckInGs1Integration.checkedBy],
		references: [usersInAuth.id]
	}),
	purchaseItemInProcurement: one(purchaseItemInProcurement, {
		fields: [gtinSpecificationCheckInGs1Integration.purchaseItemId],
		references: [purchaseItemInProcurement.id]
	}),
}));

export const purchaseItemGpcRequirementInProcurementRelations = relations(purchaseItemGpcRequirementInProcurement, ({one}) => ({
	gpcAttributeInGs1Integration: one(gpcAttributeInGs1Integration, {
		fields: [purchaseItemGpcRequirementInProcurement.attributeCode],
		references: [gpcAttributeInGs1Integration.attributeCode]
	}),
	purchaseItemInProcurement: one(purchaseItemInProcurement, {
		fields: [purchaseItemGpcRequirementInProcurement.purchaseItemId],
		references: [purchaseItemInProcurement.id]
	}),
}));

export const equipmentMaintenancePlanInKitchenRelations = relations(equipmentMaintenancePlanInKitchen, ({one, many}) => ({
	kitchenInKitchen: one(kitchenInKitchen, {
		fields: [equipmentMaintenancePlanInKitchen.kitchenId],
		references: [kitchenInKitchen.id]
	}),
	equipmentModelInKitchen: one(equipmentModelInKitchen, {
		fields: [equipmentMaintenancePlanInKitchen.modelId],
		references: [equipmentModelInKitchen.id]
	}),
	equipmentRoleInKitchen: one(equipmentRoleInKitchen, {
		fields: [equipmentMaintenancePlanInKitchen.roleId],
		references: [equipmentRoleInKitchen.id]
	}),
	equipmentMaintenanceLogInKitchens: many(equipmentMaintenanceLogInKitchen),
}));

export const equipmentMaintenanceLogInKitchenRelations = relations(equipmentMaintenanceLogInKitchen, ({one}) => ({
	equipmentIssueInKitchen: one(equipmentIssueInKitchen, {
		fields: [equipmentMaintenanceLogInKitchen.issueId],
		references: [equipmentIssueInKitchen.id]
	}),
	usersInAuth: one(usersInAuth, {
		fields: [equipmentMaintenanceLogInKitchen.performedBy],
		references: [usersInAuth.id]
	}),
	equipmentMaintenancePlanInKitchen: one(equipmentMaintenancePlanInKitchen, {
		fields: [equipmentMaintenanceLogInKitchen.planId],
		references: [equipmentMaintenancePlanInKitchen.id]
	}),
	equipmentUnitInKitchen: one(equipmentUnitInKitchen, {
		fields: [equipmentMaintenanceLogInKitchen.unitId],
		references: [equipmentUnitInKitchen.id]
	}),
}));

export const equipmentIssueInKitchenRelations = relations(equipmentIssueInKitchen, ({one, many}) => ({
	equipmentMaintenanceLogInKitchens: many(equipmentMaintenanceLogInKitchen),
	usersInAuth_reportedBy: one(usersInAuth, {
		fields: [equipmentIssueInKitchen.reportedBy],
		references: [usersInAuth.id],
		relationName: "equipmentIssueInKitchen_reportedBy_usersInAuth_id"
	}),
	usersInAuth_resolvedBy: one(usersInAuth, {
		fields: [equipmentIssueInKitchen.resolvedBy],
		references: [usersInAuth.id],
		relationName: "equipmentIssueInKitchen_resolvedBy_usersInAuth_id"
	}),
	equipmentUnitInKitchen: one(equipmentUnitInKitchen, {
		fields: [equipmentIssueInKitchen.unitId],
		references: [equipmentUnitInKitchen.id]
	}),
}));

export const policyStatementInAccessControlRelations = relations(policyStatementInAccessControl, ({one}) => ({
	kitchenInKitchen: one(kitchenInKitchen, {
		fields: [policyStatementInAccessControl.kitchenId],
		references: [kitchenInKitchen.id]
	}),
	messHallsInKitchen: one(messHallsInKitchen, {
		fields: [policyStatementInAccessControl.messHallId],
		references: [messHallsInKitchen.id]
	}),
	policyInAccessControl: one(policyInAccessControl, {
		fields: [policyStatementInAccessControl.policyId],
		references: [policyInAccessControl.id]
	}),
	unitsInCore: one(unitsInCore, {
		fields: [policyStatementInAccessControl.unitId],
		references: [unitsInCore.id]
	}),
}));

export const policyInAccessControlRelations = relations(policyInAccessControl, ({many}) => ({
	policyStatementInAccessControls: many(policyStatementInAccessControl),
	userPolicyAttachmentInAccessControls: many(userPolicyAttachmentInAccessControl),
}));

export const userPolicyAttachmentInAccessControlRelations = relations(userPolicyAttachmentInAccessControl, ({one}) => ({
	policyInAccessControl: one(policyInAccessControl, {
		fields: [userPolicyAttachmentInAccessControl.policyId],
		references: [policyInAccessControl.id]
	}),
}));

export const importBatchInSiafiIntegrationRelations = relations(importBatchInSiafiIntegration, ({one, many}) => ({
	usersInAuth: one(usersInAuth, {
		fields: [importBatchInSiafiIntegration.createdBy],
		references: [usersInAuth.id]
	}),
	unitsInCore: one(unitsInCore, {
		fields: [importBatchInSiafiIntegration.unitId],
		references: [unitsInCore.id]
	}),
	importRowInSiafiIntegrations: many(importRowInSiafiIntegration),
	budgetCreditInFinances: many(budgetCreditInFinance),
	empenhoInFinances: many(empenhoInFinance),
	liquidacaoInFinances: many(liquidacaoInFinance),
	pagamentoInFinances: many(pagamentoInFinance),
}));

export const importRowInSiafiIntegrationRelations = relations(importRowInSiafiIntegration, ({one}) => ({
	importBatchInSiafiIntegration: one(importBatchInSiafiIntegration, {
		fields: [importRowInSiafiIntegration.batchId],
		references: [importBatchInSiafiIntegration.id]
	}),
}));

export const budgetCreditInFinanceRelations = relations(budgetCreditInFinance, ({one}) => ({
	importBatchInSiafiIntegration: one(importBatchInSiafiIntegration, {
		fields: [budgetCreditInFinance.importBatchId],
		references: [importBatchInSiafiIntegration.id]
	}),
	unitsInCore: one(unitsInCore, {
		fields: [budgetCreditInFinance.unitId],
		references: [unitsInCore.id]
	}),
}));

export const empenhoEventInFinanceRelations = relations(empenhoEventInFinance, ({one}) => ({
	usersInAuth: one(usersInAuth, {
		fields: [empenhoEventInFinance.createdBy],
		references: [usersInAuth.id]
	}),
	empenhoInFinance: one(empenhoInFinance, {
		fields: [empenhoEventInFinance.empenhoId],
		references: [empenhoInFinance.id]
	}),
}));

export const pagamentoInFinanceRelations = relations(pagamentoInFinance, ({one}) => ({
	usersInAuth: one(usersInAuth, {
		fields: [pagamentoInFinance.createdBy],
		references: [usersInAuth.id]
	}),
	importBatchInSiafiIntegration: one(importBatchInSiafiIntegration, {
		fields: [pagamentoInFinance.importBatchId],
		references: [importBatchInSiafiIntegration.id]
	}),
	liquidacaoInFinance: one(liquidacaoInFinance, {
		fields: [pagamentoInFinance.liquidacaoId],
		references: [liquidacaoInFinance.id]
	}),
	unitsInCore: one(unitsInCore, {
		fields: [pagamentoInFinance.unitId],
		references: [unitsInCore.id]
	}),
}));

export const folderReviewInKitchenRelations = relations(folderReviewInKitchen, ({one}) => ({
	folderInKitchen: one(folderInKitchen, {
		fields: [folderReviewInKitchen.folderId],
		references: [folderInKitchen.id]
	}),
}));

export const reconciliationDecisionInFinanceRelations = relations(reconciliationDecisionInFinance, ({one}) => ({
	usersInAuth: one(usersInAuth, {
		fields: [reconciliationDecisionInFinance.decidedBy],
		references: [usersInAuth.id]
	}),
	unitsInCore: one(unitsInCore, {
		fields: [reconciliationDecisionInFinance.unitId],
		references: [unitsInCore.id]
	}),
}));

export const userPermissionsInAccessControlRelations = relations(userPermissionsInAccessControl, ({one}) => ({
	kitchenInKitchen: one(kitchenInKitchen, {
		fields: [userPermissionsInAccessControl.kitchenId],
		references: [kitchenInKitchen.id]
	}),
	messHallsInKitchen: one(messHallsInKitchen, {
		fields: [userPermissionsInAccessControl.messHallId],
		references: [messHallsInKitchen.id]
	}),
	unitsInCore: one(unitsInCore, {
		fields: [userPermissionsInAccessControl.unitId],
		references: [unitsInCore.id]
	}),
	usersInAuth: one(usersInAuth, {
		fields: [userPermissionsInAccessControl.userId],
		references: [usersInAuth.id]
	}),
}));

export const openingBalanceInInventoryRelations = relations(openingBalanceInInventory, ({one, many}) => ({
	usersInAuth_cancelledBy: one(usersInAuth, {
		fields: [openingBalanceInInventory.cancelledBy],
		references: [usersInAuth.id],
		relationName: "openingBalanceInInventory_cancelledBy_usersInAuth_id"
	}),
	usersInAuth_createdBy: one(usersInAuth, {
		fields: [openingBalanceInInventory.createdBy],
		references: [usersInAuth.id],
		relationName: "openingBalanceInInventory_createdBy_usersInAuth_id"
	}),
	kitchenInKitchen: one(kitchenInKitchen, {
		fields: [openingBalanceInInventory.kitchenId],
		references: [kitchenInKitchen.id]
	}),
	usersInAuth_postedBy: one(usersInAuth, {
		fields: [openingBalanceInInventory.postedBy],
		references: [usersInAuth.id],
		relationName: "openingBalanceInInventory_postedBy_usersInAuth_id"
	}),
	openingBalanceItemInInventories: many(openingBalanceItemInInventory),
}));

export const openingBalanceItemInInventoryRelations = relations(openingBalanceItemInInventory, ({one}) => ({
	ingredientInKitchen: one(ingredientInKitchen, {
		fields: [openingBalanceItemInInventory.ingredientId],
		references: [ingredientInKitchen.id]
	}),
	stockLotInInventory: one(stockLotInInventory, {
		fields: [openingBalanceItemInInventory.lotId],
		references: [stockLotInInventory.id]
	}),
	stockMovementInInventory: one(stockMovementInInventory, {
		fields: [openingBalanceItemInInventory.movementId],
		references: [stockMovementInInventory.id]
	}),
	openingBalanceInInventory: one(openingBalanceInInventory, {
		fields: [openingBalanceItemInInventory.openingBalanceId],
		references: [openingBalanceInInventory.id]
	}),
}));

export const stockMovementInInventoryRelations = relations(stockMovementInInventory, ({one, many}) => ({
	openingBalanceItemInInventories: many(openingBalanceItemInInventory),
	inventoryCountInInventory: one(inventoryCountInInventory, {
		fields: [stockMovementInInventory.inventoryCountId],
		references: [inventoryCountInInventory.id]
	}),
	usersInAuth: one(usersInAuth, {
		fields: [stockMovementInInventory.createdBy],
		references: [usersInAuth.id]
	}),
	frozenPreparationInKitchen: one(frozenPreparationInKitchen, {
		fields: [stockMovementInInventory.frozenPreparationId],
		references: [frozenPreparationInKitchen.id]
	}),
	goodsReceiptItemInInventory: one(goodsReceiptItemInInventory, {
		fields: [stockMovementInInventory.goodsReceiptItemId],
		references: [goodsReceiptItemInInventory.id]
	}),
	ingredientInKitchen: one(ingredientInKitchen, {
		fields: [stockMovementInInventory.ingredientId],
		references: [ingredientInKitchen.id]
	}),
	stockIssueRequestInInventory: one(stockIssueRequestInInventory, {
		fields: [stockMovementInInventory.issueRequestId],
		references: [stockIssueRequestInInventory.id]
	}),
	kitchenInKitchen: one(kitchenInKitchen, {
		fields: [stockMovementInInventory.kitchenId],
		references: [kitchenInKitchen.id]
	}),
	stockLotInInventory: one(stockLotInInventory, {
		fields: [stockMovementInInventory.lotId],
		references: [stockLotInInventory.id]
	}),
	productionTaskInKitchen: one(productionTaskInKitchen, {
		fields: [stockMovementInInventory.productionTaskId],
		references: [productionTaskInKitchen.id]
	}),
	stockAdjustmentItemInInventories_correctedMovementId: many(stockAdjustmentItemInInventory, {
		relationName: "stockAdjustmentItemInInventory_correctedMovementId_stockMovementInInventory_id"
	}),
	stockAdjustmentItemInInventories_movementId: many(stockAdjustmentItemInInventory, {
		relationName: "stockAdjustmentItemInInventory_movementId_stockMovementInInventory_id"
	}),
}));

export const comprasMaterialGrupoInComprasGovIntegrationRelations = relations(comprasMaterialGrupoInComprasGovIntegration, ({many}) => ({
	comprasMaterialClasseInComprasGovIntegrations: many(comprasMaterialClasseInComprasGovIntegration),
}));

export const kitchenStockSettingsInInventoryRelations = relations(kitchenStockSettingsInInventory, ({one}) => ({
	kitchenInKitchen: one(kitchenInKitchen, {
		fields: [kitchenStockSettingsInInventory.kitchenId],
		references: [kitchenInKitchen.id]
	}),
	usersInAuth: one(usersInAuth, {
		fields: [kitchenStockSettingsInInventory.updatedBy],
		references: [usersInAuth.id]
	}),
}));

export const menuGroupInKitchenRelations = relations(menuGroupInKitchen, ({one}) => ({
	menuGroupSetInKitchen: one(menuGroupSetInKitchen, {
		fields: [menuGroupInKitchen.groupSetId],
		references: [menuGroupSetInKitchen.id]
	}),
}));

export const countScopeItemInInventoryRelations = relations(countScopeItemInInventory, ({one}) => ({
	inventoryCountInInventory: one(inventoryCountInInventory, {
		fields: [countScopeItemInInventory.countId],
		references: [inventoryCountInInventory.id]
	}),
	frozenPreparationInKitchen: one(frozenPreparationInKitchen, {
		fields: [countScopeItemInInventory.frozenPreparationId],
		references: [frozenPreparationInKitchen.id]
	}),
	ingredientInKitchen: one(ingredientInKitchen, {
		fields: [countScopeItemInInventory.ingredientId],
		references: [ingredientInKitchen.id]
	}),
	kitchenInKitchen: one(kitchenInKitchen, {
		fields: [countScopeItemInInventory.kitchenId],
		references: [kitchenInKitchen.id]
	}),
}));

export const goodsReceiptItemLotInInventoryRelations = relations(goodsReceiptItemLotInInventory, ({one, many}) => ({
	stockLotInInventories: many(stockLotInInventory),
	goodsReceiptItemInInventory: one(goodsReceiptItemInInventory, {
		fields: [goodsReceiptItemLotInInventory.receiptItemId],
		references: [goodsReceiptItemInInventory.id]
	}),
	usersInAuth: one(usersInAuth, {
		fields: [goodsReceiptItemLotInInventory.temperatureAckBy],
		references: [usersInAuth.id]
	}),
}));

export const inventoryCountEntryInInventoryRelations = relations(inventoryCountEntryInInventory, ({one}) => ({
	inventoryCountInInventory: one(inventoryCountInInventory, {
		fields: [inventoryCountEntryInInventory.countId],
		references: [inventoryCountInInventory.id]
	}),
	usersInAuth: one(usersInAuth, {
		fields: [inventoryCountEntryInInventory.countedBy],
		references: [usersInAuth.id]
	}),
	frozenPreparationInKitchen: one(frozenPreparationInKitchen, {
		fields: [inventoryCountEntryInInventory.frozenPreparationId],
		references: [frozenPreparationInKitchen.id]
	}),
	ingredientInKitchen: one(ingredientInKitchen, {
		fields: [inventoryCountEntryInInventory.ingredientId],
		references: [ingredientInKitchen.id]
	}),
	stockLotInInventory: one(stockLotInInventory, {
		fields: [inventoryCountEntryInInventory.lotId],
		references: [stockLotInInventory.id]
	}),
}));

export const stockAdjustmentItemInInventoryRelations = relations(stockAdjustmentItemInInventory, ({one}) => ({
	stockAdjustmentInInventory: one(stockAdjustmentInInventory, {
		fields: [stockAdjustmentItemInInventory.adjustmentId],
		references: [stockAdjustmentInInventory.id]
	}),
	stockMovementInInventory_correctedMovementId: one(stockMovementInInventory, {
		fields: [stockAdjustmentItemInInventory.correctedMovementId],
		references: [stockMovementInInventory.id],
		relationName: "stockAdjustmentItemInInventory_correctedMovementId_stockMovementInInventory_id"
	}),
	frozenPreparationInKitchen: one(frozenPreparationInKitchen, {
		fields: [stockAdjustmentItemInInventory.frozenPreparationId],
		references: [frozenPreparationInKitchen.id]
	}),
	ingredientInKitchen: one(ingredientInKitchen, {
		fields: [stockAdjustmentItemInInventory.ingredientId],
		references: [ingredientInKitchen.id]
	}),
	stockLotInInventory: one(stockLotInInventory, {
		fields: [stockAdjustmentItemInInventory.lotId],
		references: [stockLotInInventory.id]
	}),
	stockMovementInInventory_movementId: one(stockMovementInInventory, {
		fields: [stockAdjustmentItemInInventory.movementId],
		references: [stockMovementInInventory.id],
		relationName: "stockAdjustmentItemInInventory_movementId_stockMovementInInventory_id"
	}),
}));

export const stockAdjustmentAttachmentInInventoryRelations = relations(stockAdjustmentAttachmentInInventory, ({one}) => ({
	stockAdjustmentInInventory: one(stockAdjustmentInInventory, {
		fields: [stockAdjustmentAttachmentInInventory.adjustmentId],
		references: [stockAdjustmentInInventory.id]
	}),
	usersInAuth: one(usersInAuth, {
		fields: [stockAdjustmentAttachmentInInventory.uploadedBy],
		references: [usersInAuth.id]
	}),
}));

export const gpcBrickAttributeInGs1IntegrationRelations = relations(gpcBrickAttributeInGs1Integration, ({one}) => ({
	gpcAttributeInGs1Integration: one(gpcAttributeInGs1Integration, {
		fields: [gpcBrickAttributeInGs1Integration.attributeCode],
		references: [gpcAttributeInGs1Integration.attributeCode]
	}),
}));

export const gtinGpcAttributeInGs1IntegrationRelations = relations(gtinGpcAttributeInGs1Integration, ({one}) => ({
	gpcAttributeInGs1Integration: one(gpcAttributeInGs1Integration, {
		fields: [gtinGpcAttributeInGs1Integration.attributeCode],
		references: [gpcAttributeInGs1Integration.attributeCode]
	}),
	usersInAuth: one(usersInAuth, {
		fields: [gtinGpcAttributeInGs1Integration.declaredBy],
		references: [usersInAuth.id]
	}),
	gtinInGs1Integration: one(gtinInGs1Integration, {
		fields: [gtinGpcAttributeInGs1Integration.gtin],
		references: [gtinInGs1Integration.gtin]
	}),
	gpcAttributeValueInGs1Integration: one(gpcAttributeValueInGs1Integration, {
		fields: [gtinGpcAttributeInGs1Integration.valueCode],
		references: [gpcAttributeValueInGs1Integration.valueCode]
	}),
}));

export const scannerProfileInInventoryRelations = relations(scannerProfileInInventory, ({one}) => ({
	kitchenInKitchen: one(kitchenInKitchen, {
		fields: [scannerProfileInInventory.kitchenId],
		references: [kitchenInKitchen.id]
	}),
	usersInAuth: one(usersInAuth, {
		fields: [scannerProfileInInventory.userId],
		references: [usersInAuth.id]
	}),
}));