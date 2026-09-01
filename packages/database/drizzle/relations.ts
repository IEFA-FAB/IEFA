import { relations } from "drizzle-orm/relations";
import { usersInAuth, profilesAdminInAccessControl, dailyMenuInKitchen, menuItemsInKitchen, recipesInKitchen, kitchenInKitchen, unitsInCore, messHallsInKitchen, userDataInCore, mealTypeInKitchen, mealPresencesInKitchen, otherPresencesInKitchen, menuTemplateItemsInKitchen, menuTemplateInKitchen, userPermissionsInAccessControl, comprasMaterialGrupoInComprasGovIntegration, comprasMaterialClasseInComprasGovIntegration, mcpApiKeysInAccessControl, comprasMaterialItemInComprasGovIntegration, purchaseItemInProcurement, comprasServicoDivisaoInComprasGovIntegration, comprasServicoGrupoInComprasGovIntegration, comprasServicoClasseInComprasGovIntegration, ceafaInKitchen, ingredientInKitchen, folderInKitchen, purchaseItemIngredientInProcurement, comprasSyncLogInComprasGovIntegration, comprasSyncStepInComprasGovIntegration, procurementListInProcurement, procurementListItemInProcurement, procurementListKitchenInProcurement, procurementListSelectionInProcurement, productionTaskInKitchen, procurementArpItemInProcurement, empenhoInFinance, procurementArpInProcurement, analyticsChatSessionInKitchen, analyticsChatMessageInKitchen, moduleChatSessionInKitchen, moduleChatMessageInKitchen, stepTemplateInKitchen, utensilInKitchen, stepTemplateUtensilInKitchen, recipeStepInKitchen, recipeStepOutputInKitchen, recipeIngredientsInKitchen, recipeStepInputInKitchen, recipeStepUtensilInKitchen, comprasMaterialPdmInComprasGovIntegration, comprasServicoSecaoInComprasGovIntegration, opinionsInKitchen, recipeIngredientAlternativesInKitchen, ingredientSubstitutionInKitchen, mealForecastsInKitchen, ingredientItemInKitchen, nutrientInKitchen, ingredientNutrientInKitchen, ingredientVersionInKitchen, ingredientReviewInKitchen, equipmentMaintenancePlanInKitchen, equipmentIssueInKitchen, equipmentMaintenanceLogInKitchen, procurementPesquisaPrecoInProcurement, procurementPesquisaPrecoItemInProcurement, comprasAmostraInProcurement, procurementPesquisaPrecoAmostraInProcurement, kitchenAtaDraftInProcurement, kitchenAtaDraftSelectionInProcurement, frozenPreparationInKitchen, menuTemplateMealInKitchen, equipmentRoleInKitchen, equipmentModelInKitchen, equipmentModelRoleInKitchen, equipmentUnitInKitchen, equipmentUnitRoleInKitchen, recipeEquipmentRequirementInKitchen, ranchoInKitchen, workforceCategoryInKitchen, workforceSurveyInKitchen, workforceSubmissionInKitchen, workforceHeadcountInKitchen, workforceNoteInKitchen } from "./schema";
export const profilesAdminInAccessControlRelations = relations(profilesAdminInAccessControl, ({one}) => ({
	usersInAuth: one(usersInAuth, {
		fields: [profilesAdminInAccessControl.id],
		references: [usersInAuth.id]
	}),
}));

export const usersInAuthRelations = relations(usersInAuth, ({many}) => ({
	equipmentMaintenanceLogInKitchens: many(equipmentMaintenanceLogInKitchen),
	equipmentIssueInKitchens_reportedBy: many(equipmentIssueInKitchen, {
		relationName: "equipmentIssueInKitchen_reportedBy_usersInAuth_id"
	}),
	equipmentIssueInKitchens_resolvedBy: many(equipmentIssueInKitchen, {
		relationName: "equipmentIssueInKitchen_resolvedBy_usersInAuth_id"
	}),
	profilesAdminInAccessControls: many(profilesAdminInAccessControl),
	userDataInCores: many(userDataInCore),
	mealPresencesInKitchens: many(mealPresencesInKitchen),
	otherPresencesInKitchens: many(otherPresencesInKitchen),
	userPermissionsInAccessControls: many(userPermissionsInAccessControl),
	mcpApiKeysInAccessControls: many(mcpApiKeysInAccessControl),
	empenhoInFinances: many(empenhoInFinance),
	analyticsChatSessionInCores: many(analyticsChatSessionInKitchen),
	moduleChatSessionInCores: many(moduleChatSessionInKitchen),
	opinionsInCores: many(opinionsInKitchen),
	mealForecastsInKitchens: many(mealForecastsInKitchen),
}));

export const menuItemsInKitchenRelations = relations(menuItemsInKitchen, ({one, many}) => ({
	dailyMenuInKitchen: one(dailyMenuInKitchen, {
		fields: [menuItemsInKitchen.dailyMenuId],
		references: [dailyMenuInKitchen.id]
	}),
	recipesInKitchen: one(recipesInKitchen, {
		fields: [menuItemsInKitchen.recipeOriginId],
		references: [recipesInKitchen.id]
	}),
	productionTaskInKitchens: many(productionTaskInKitchen),
}));

export const dailyMenuInKitchenRelations = relations(dailyMenuInKitchen, ({one, many}) => ({
	menuItemsInKitchens: many(menuItemsInKitchen),
	kitchenInKitchen: one(kitchenInKitchen, {
		fields: [dailyMenuInKitchen.kitchenId],
		references: [kitchenInKitchen.id]
	}),
	mealTypeInKitchen: one(mealTypeInKitchen, {
		fields: [dailyMenuInKitchen.mealTypeId],
		references: [mealTypeInKitchen.id]
	}),
}));

export const recipesInKitchenRelations = relations(recipesInKitchen, ({one, many}) => ({
	menuItemsInKitchens: many(menuItemsInKitchen),
	menuTemplateItemsInKitchens: many(menuTemplateItemsInKitchen),
	kitchenInKitchen: one(kitchenInKitchen, {
		fields: [recipesInKitchen.kitchenId],
		references: [kitchenInKitchen.id]
	}),
	recipeStepInKitchens: many(recipeStepInKitchen),
	recipeStepOutputInKitchens: many(recipeStepOutputInKitchen),
	recipeIngredientsInKitchens: many(recipeIngredientsInKitchen),
}));

export const kitchenInCoreRelations = relations(kitchenInKitchen, ({one, many}) => ({
	equipmentMaintenancePlanInKitchens: many(equipmentMaintenancePlanInKitchen),
	kitchenInKitchen: one(kitchenInKitchen, {
		fields: [kitchenInKitchen.kitchenId],
		references: [kitchenInKitchen.id],
		relationName: "kitchenInCore_kitchenId_kitchenInCore_id"
	}),
	kitchenInCores: many(kitchenInKitchen, {
		relationName: "kitchenInCore_kitchenId_kitchenInCore_id"
	}),
	unitsInCore_purchaseUnitId: one(unitsInCore, {
		fields: [kitchenInKitchen.purchaseUnitId],
		references: [unitsInCore.id],
		relationName: "kitchenInCore_purchaseUnitId_unitsInCore_id"
	}),
	unitsInCore_unitId: one(unitsInCore, {
		fields: [kitchenInKitchen.unitId],
		references: [unitsInCore.id],
		relationName: "kitchenInCore_unitId_unitsInCore_id"
	}),
	mealTypeInKitchens: many(mealTypeInKitchen),
	dailyMenuInKitchens: many(dailyMenuInKitchen),
	recipesInKitchens: many(recipesInKitchen),
	userPermissionsInAccessControls: many(userPermissionsInAccessControl),
	procurementListKitchenInProcurements: many(procurementListKitchenInProcurement),
	productionTaskInKitchens: many(productionTaskInKitchen),
	stepTemplateInKitchens: many(stepTemplateInKitchen),
	utensilInKitchens: many(utensilInKitchen),
	messHallsInCores: many(messHallsInKitchen),
	menuTemplateInKitchens: many(menuTemplateInKitchen),
	kitchenAtaDraftInProcurements: many(kitchenAtaDraftInProcurement),
}));

export const unitsInCoreRelations = relations(unitsInCore, ({many}) => ({
	kitchenInCores_purchaseUnitId: many(kitchenInKitchen, {
		relationName: "kitchenInCore_purchaseUnitId_unitsInCore_id"
	}),
	kitchenInCores_unitId: many(kitchenInKitchen, {
		relationName: "kitchenInCore_unitId_unitsInCore_id"
	}),
	userPermissionsInAccessControls: many(userPermissionsInAccessControl),
	procurementListInProcurements: many(procurementListInProcurement),
	empenhoInFinances: many(empenhoInFinance),
	procurementArpInProcurements: many(procurementArpInProcurement),
	messHallsInCores_unitId: many(messHallsInKitchen, {
		relationName: "messHallsInCore_unitId_unitsInCore_id"
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

export const messHallsInCoreRelations = relations(messHallsInKitchen, ({one, many}) => ({
	userDataInCores: many(userDataInCore),
	mealPresencesInKitchens: many(mealPresencesInKitchen),
	otherPresencesInKitchens: many(otherPresencesInKitchen),
	userPermissionsInAccessControls: many(userPermissionsInAccessControl),
	kitchenInKitchen: one(kitchenInKitchen, {
		fields: [messHallsInKitchen.kitchenId],
		references: [kitchenInKitchen.id]
	}),
	unitsInCore_unitId: one(unitsInCore, {
		fields: [messHallsInKitchen.unitId],
		references: [unitsInCore.id],
		relationName: "messHallsInCore_unitId_unitsInCore_id"
	}),
	mealForecastsInKitchens: many(mealForecastsInKitchen),
}));

export const mealTypeInKitchenRelations = relations(mealTypeInKitchen, ({one, many}) => ({
	kitchenInKitchen: one(kitchenInKitchen, {
		fields: [mealTypeInKitchen.kitchenId],
		references: [kitchenInKitchen.id]
	}),
	dailyMenuInKitchens: many(dailyMenuInKitchen),
	menuTemplateItemsInKitchens: many(menuTemplateItemsInKitchen),
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

export const menuTemplateItemsInKitchenRelations = relations(menuTemplateItemsInKitchen, ({one}) => ({
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

export const menuTemplateMealInKitchenRelations = relations(menuTemplateMealInKitchen, ({one}) => ({
	menuTemplateInKitchen: one(menuTemplateInKitchen, {
		fields: [menuTemplateMealInKitchen.menuTemplateId],
		references: [menuTemplateInKitchen.id]
	}),
	mealTypeInKitchen: one(mealTypeInKitchen, {
		fields: [menuTemplateMealInKitchen.mealTypeId],
		references: [mealTypeInKitchen.id]
	}),
}));

export const menuTemplateInKitchenRelations = relations(menuTemplateInKitchen, ({one, many}) => ({
	menuTemplateItemsInKitchens: many(menuTemplateItemsInKitchen),
	menuTemplateMealsInKitchens: many(menuTemplateMealInKitchen),
	procurementListSelectionInProcurements: many(procurementListSelectionInProcurement),
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
	kitchenAtaDraftSelectionInProcurements: many(kitchenAtaDraftSelectionInProcurement),
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

export const comprasMaterialClasseInComprasGovIntegrationRelations = relations(comprasMaterialClasseInComprasGovIntegration, ({one, many}) => ({
	comprasMaterialGrupoInComprasGovIntegration: one(comprasMaterialGrupoInComprasGovIntegration, {
		fields: [comprasMaterialClasseInComprasGovIntegration.codigoGrupo],
		references: [comprasMaterialGrupoInComprasGovIntegration.codigoGrupo]
	}),
	comprasMaterialPdmInComprasGovIntegrations: many(comprasMaterialPdmInComprasGovIntegration),
}));

export const comprasMaterialGrupoInComprasGovIntegrationRelations = relations(comprasMaterialGrupoInComprasGovIntegration, ({many}) => ({
	comprasMaterialClasseInComprasGovIntegrations: many(comprasMaterialClasseInComprasGovIntegration),
}));

export const mcpApiKeysInAccessControlRelations = relations(mcpApiKeysInAccessControl, ({one}) => ({
	usersInAuth: one(usersInAuth, {
		fields: [mcpApiKeysInAccessControl.userId],
		references: [usersInAuth.id]
	}),
}));

export const purchaseItemInProcurementRelations = relations(purchaseItemInProcurement, ({one, many}) => ({
	comprasMaterialItemInComprasGovIntegration: one(comprasMaterialItemInComprasGovIntegration, {
		fields: [purchaseItemInProcurement.catmatItemCodigo],
		references: [comprasMaterialItemInComprasGovIntegration.codigoItem]
	}),
	purchaseItemIngredientInProcurements: many(purchaseItemIngredientInProcurement),
	procurementListItemInProcurements: many(procurementListItemInProcurement),
	ingredientItemInKitchens: many(ingredientItemInKitchen),
}));

export const comprasMaterialItemInComprasGovIntegrationRelations = relations(comprasMaterialItemInComprasGovIntegration, ({many}) => ({
	purchaseItemInProcurements: many(purchaseItemInProcurement),
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

export const ingredientInKitchenRelations = relations(ingredientInKitchen, ({one, many}) => ({
	ceafaInKitchen: one(ceafaInKitchen, {
		fields: [ingredientInKitchen.ceafaId],
		references: [ceafaInKitchen.id]
	}),
	folderInKitchen: one(folderInKitchen, {
		fields: [ingredientInKitchen.folderId],
		references: [folderInKitchen.id]
	}),
	purchaseItemIngredientInProcurements: many(purchaseItemIngredientInProcurement),
	procurementListItemInProcurements: many(procurementListItemInProcurement),
	recipeIngredientsInKitchens: many(recipeIngredientsInKitchen),
	recipeIngredientAlternativesInKitchens: many(recipeIngredientAlternativesInKitchen),
	ingredientItemInKitchens: many(ingredientItemInKitchen),
	ingredientNutrientInKitchens: many(ingredientNutrientInKitchen),
	ingredientVersionInKitchens: many(ingredientVersionInKitchen),
	ingredientReviewInKitchens: many(ingredientReviewInKitchen),
}));

export const ceafaInKitchenRelations = relations(ceafaInKitchen, ({many}) => ({
	ingredientInKitchens: many(ingredientInKitchen),
}));

export const folderInKitchenRelations = relations(folderInKitchen, ({many}) => ({
	ingredientInKitchens: many(ingredientInKitchen),
}));

export const purchaseItemIngredientInProcurementRelations = relations(purchaseItemIngredientInProcurement, ({one}) => ({
	ingredientInKitchen: one(ingredientInKitchen, {
		fields: [purchaseItemIngredientInProcurement.ingredientId],
		references: [ingredientInKitchen.id]
	}),
	purchaseItemInProcurement: one(purchaseItemInProcurement, {
		fields: [purchaseItemIngredientInProcurement.purchaseItemId],
		references: [purchaseItemInProcurement.id]
	}),
}));

export const comprasSyncStepInComprasGovIntegrationRelations = relations(comprasSyncStepInComprasGovIntegration, ({one}) => ({
	comprasSyncLogInComprasGovIntegration: one(comprasSyncLogInComprasGovIntegration, {
		fields: [comprasSyncStepInComprasGovIntegration.syncId],
		references: [comprasSyncLogInComprasGovIntegration.id]
	}),
}));

export const comprasSyncLogInComprasGovIntegrationRelations = relations(comprasSyncLogInComprasGovIntegration, ({many}) => ({
	comprasSyncStepInComprasGovIntegrations: many(comprasSyncStepInComprasGovIntegration),
}));

export const procurementListInProcurementRelations = relations(procurementListInProcurement, ({one, many}) => ({
	unitsInCore: one(unitsInCore, {
		fields: [procurementListInProcurement.unitId],
		references: [unitsInCore.id]
	}),
	procurementListItemInProcurements: many(procurementListItemInProcurement),
	procurementListKitchenInProcurements: many(procurementListKitchenInProcurement),
	procurementArpInProcurements: many(procurementArpInProcurement),
	procurementPesquisaPrecoInProcurements: many(procurementPesquisaPrecoInProcurement),
}));

export const procurementListItemInProcurementRelations = relations(procurementListItemInProcurement, ({one, many}) => ({
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
	procurementArpItemInProcurements: many(procurementArpItemInProcurement),
	procurementPesquisaPrecoItemInProcurements: many(procurementPesquisaPrecoItemInProcurement),
}));

export const procurementListKitchenInProcurementRelations = relations(procurementListKitchenInProcurement, ({one, many}) => ({
	procurementListInProcurement: one(procurementListInProcurement, {
		fields: [procurementListKitchenInProcurement.listId],
		references: [procurementListInProcurement.id]
	}),
	kitchenInKitchen: one(kitchenInKitchen, {
		fields: [procurementListKitchenInProcurement.kitchenId],
		references: [kitchenInKitchen.id]
	}),
	procurementListSelectionInProcurements: many(procurementListSelectionInProcurement),
}));

export const procurementListSelectionInProcurementRelations = relations(procurementListSelectionInProcurement, ({one}) => ({
	procurementListKitchenInProcurement: one(procurementListKitchenInProcurement, {
		fields: [procurementListSelectionInProcurement.listKitchenId],
		references: [procurementListKitchenInProcurement.id]
	}),
	menuTemplateInKitchen: one(menuTemplateInKitchen, {
		fields: [procurementListSelectionInProcurement.templateId],
		references: [menuTemplateInKitchen.id]
	}),
}));

export const productionTaskInKitchenRelations = relations(productionTaskInKitchen, ({one}) => ({
	kitchenInKitchen: one(kitchenInKitchen, {
		fields: [productionTaskInKitchen.kitchenId],
		references: [kitchenInKitchen.id]
	}),
	menuItemsInKitchen: one(menuItemsInKitchen, {
		fields: [productionTaskInKitchen.menuItemId],
		references: [menuItemsInKitchen.id]
	}),
}));

export const empenhoInFinanceRelations = relations(empenhoInFinance, ({one}) => ({
	procurementArpItemInProcurement: one(procurementArpItemInProcurement, {
		fields: [empenhoInFinance.arpItemId],
		references: [procurementArpItemInProcurement.id]
	}),
	usersInAuth: one(usersInAuth, {
		fields: [empenhoInFinance.createdBy],
		references: [usersInAuth.id]
	}),
	unitsInCore: one(unitsInCore, {
		fields: [empenhoInFinance.unitId],
		references: [unitsInCore.id]
	}),
}));

export const procurementArpItemInProcurementRelations = relations(procurementArpItemInProcurement, ({one, many}) => ({
	empenhoInFinances: many(empenhoInFinance),
	procurementArpInProcurement: one(procurementArpInProcurement, {
		fields: [procurementArpItemInProcurement.arpId],
		references: [procurementArpInProcurement.id]
	}),
	procurementListItemInProcurement: one(procurementListItemInProcurement, {
		fields: [procurementArpItemInProcurement.ataItemId],
		references: [procurementListItemInProcurement.id]
	}),
}));

export const procurementArpInProcurementRelations = relations(procurementArpInProcurement, ({one, many}) => ({
	procurementListInProcurement: one(procurementListInProcurement, {
		fields: [procurementArpInProcurement.ataId],
		references: [procurementListInProcurement.id]
	}),
	unitsInCore: one(unitsInCore, {
		fields: [procurementArpInProcurement.unitId],
		references: [unitsInCore.id]
	}),
	procurementArpItemInProcurements: many(procurementArpItemInProcurement),
}));

export const analyticsChatMessageInCoreRelations = relations(analyticsChatMessageInKitchen, ({one}) => ({
	analyticsChatSessionInKitchen: one(analyticsChatSessionInKitchen, {
		fields: [analyticsChatMessageInKitchen.sessionId],
		references: [analyticsChatSessionInKitchen.id]
	}),
}));

export const analyticsChatSessionInCoreRelations = relations(analyticsChatSessionInKitchen, ({one, many}) => ({
	analyticsChatMessageInCores: many(analyticsChatMessageInKitchen),
	usersInAuth: one(usersInAuth, {
		fields: [analyticsChatSessionInKitchen.userId],
		references: [usersInAuth.id]
	}),
}));

export const moduleChatSessionInCoreRelations = relations(moduleChatSessionInKitchen, ({one, many}) => ({
	usersInAuth: one(usersInAuth, {
		fields: [moduleChatSessionInKitchen.userId],
		references: [usersInAuth.id]
	}),
	moduleChatMessageInCores: many(moduleChatMessageInKitchen),
}));

export const moduleChatMessageInCoreRelations = relations(moduleChatMessageInKitchen, ({one}) => ({
	moduleChatSessionInKitchen: one(moduleChatSessionInKitchen, {
		fields: [moduleChatMessageInKitchen.sessionId],
		references: [moduleChatSessionInKitchen.id]
	}),
}));

export const stepTemplateInKitchenRelations = relations(stepTemplateInKitchen, ({one, many}) => ({
	kitchenInKitchen: one(kitchenInKitchen, {
		fields: [stepTemplateInKitchen.kitchenId],
		references: [kitchenInKitchen.id]
	}),
	stepTemplateUtensilInKitchens: many(stepTemplateUtensilInKitchen),
	recipeStepInKitchens: many(recipeStepInKitchen),
}));

export const utensilInKitchenRelations = relations(utensilInKitchen, ({one, many}) => ({
	kitchenInKitchen: one(kitchenInKitchen, {
		fields: [utensilInKitchen.kitchenId],
		references: [kitchenInKitchen.id]
	}),
	equipmentRoleInKitchen: one(equipmentRoleInKitchen, {
		fields: [utensilInKitchen.roleId],
		references: [equipmentRoleInKitchen.id]
	}),
	stepTemplateUtensilInKitchens: many(stepTemplateUtensilInKitchen),
	recipeStepUtensilInKitchens: many(recipeStepUtensilInKitchen),
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

export const recipeStepInKitchenRelations = relations(recipeStepInKitchen, ({one, many}) => ({
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

export const recipeIngredientsInKitchenRelations = relations(recipeIngredientsInKitchen, ({one, many}) => ({
	recipeStepInputInKitchens: many(recipeStepInputInKitchen),
	ingredientInKitchen: one(ingredientInKitchen, {
		fields: [recipeIngredientsInKitchen.ingredientId],
		references: [ingredientInKitchen.id]
	}),
	frozenPreparationInKitchen: one(frozenPreparationInKitchen, {
		fields: [recipeIngredientsInKitchen.frozenPreparationId],
		references: [frozenPreparationInKitchen.id]
	}),
	recipesInKitchen: one(recipesInKitchen, {
		fields: [recipeIngredientsInKitchen.recipeId],
		references: [recipesInKitchen.id]
	}),
	recipeIngredientAlternativesInKitchens: many(recipeIngredientAlternativesInKitchen),
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

export const comprasMaterialPdmInComprasGovIntegrationRelations = relations(comprasMaterialPdmInComprasGovIntegration, ({one}) => ({
	comprasMaterialClasseInComprasGovIntegration: one(comprasMaterialClasseInComprasGovIntegration, {
		fields: [comprasMaterialPdmInComprasGovIntegration.codigoClasse],
		references: [comprasMaterialClasseInComprasGovIntegration.codigoClasse]
	}),
}));

export const comprasServicoSecaoInComprasGovIntegrationRelations = relations(comprasServicoSecaoInComprasGovIntegration, ({many}) => ({
	comprasServicoDivisaoInComprasGovIntegrations: many(comprasServicoDivisaoInComprasGovIntegration),
}));

export const opinionsInCoreRelations = relations(opinionsInKitchen, ({one}) => ({
	usersInAuth: one(usersInAuth, {
		fields: [opinionsInKitchen.userId],
		references: [usersInAuth.id]
	}),
}));

export const recipeIngredientAlternativesInKitchenRelations = relations(recipeIngredientAlternativesInKitchen, ({one}) => ({
	ingredientInKitchen: one(ingredientInKitchen, {
		fields: [recipeIngredientAlternativesInKitchen.ingredientId],
		references: [ingredientInKitchen.id]
	}),
	recipeIngredientsInKitchen: one(recipeIngredientsInKitchen, {
		fields: [recipeIngredientAlternativesInKitchen.recipeIngredientId],
		references: [recipeIngredientsInKitchen.id]
	}),
	frozenPreparationInKitchen: one(frozenPreparationInKitchen, {
		fields: [recipeIngredientAlternativesInKitchen.frozenPreparationId],
		references: [frozenPreparationInKitchen.id]
	}),
}));

export const ingredientSubstitutionInKitchenRelations = relations(ingredientSubstitutionInKitchen, ({one}) => ({
	ingredientInKitchen: one(ingredientInKitchen, {
		fields: [ingredientSubstitutionInKitchen.ingredientId],
		references: [ingredientInKitchen.id],
		relationName: "ingredientSubstitution_ingredient"
	}),
	substituteIngredientInKitchen: one(ingredientInKitchen, {
		fields: [ingredientSubstitutionInKitchen.substituteIngredientId],
		references: [ingredientInKitchen.id],
		relationName: "ingredientSubstitution_substitute"
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

export const ingredientItemInKitchenRelations = relations(ingredientItemInKitchen, ({one}) => ({
	purchaseItemInProcurement: one(purchaseItemInProcurement, {
		fields: [ingredientItemInKitchen.purchaseItemId],
		references: [purchaseItemInProcurement.id]
	}),
	ingredientInKitchen: one(ingredientInKitchen, {
		fields: [ingredientItemInKitchen.ingredientId],
		references: [ingredientInKitchen.id]
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

export const nutrientInKitchenRelations = relations(nutrientInKitchen, ({many}) => ({
	ingredientNutrientInKitchens: many(ingredientNutrientInKitchen),
}));

export const ingredientVersionInKitchenRelations = relations(ingredientVersionInKitchen, ({one}) => ({
	ingredientInKitchen: one(ingredientInKitchen, {
		fields: [ingredientVersionInKitchen.ingredientId],
		references: [ingredientInKitchen.id]
	}),
}));

export const ingredientReviewInKitchenRelations = relations(ingredientReviewInKitchen, ({one}) => ({
	ingredientInKitchen: one(ingredientInKitchen, {
		fields: [ingredientReviewInKitchen.ingredientId],
		references: [ingredientInKitchen.id]
	}),
}));

export const procurementPesquisaPrecoInProcurementRelations = relations(procurementPesquisaPrecoInProcurement, ({one, many}) => ({
	procurementListInProcurement: one(procurementListInProcurement, {
		fields: [procurementPesquisaPrecoInProcurement.ataId],
		references: [procurementListInProcurement.id]
	}),
	procurementPesquisaPrecoItemInProcurements: many(procurementPesquisaPrecoItemInProcurement),
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
export const equipmentRoleInKitchenRelations = relations(equipmentRoleInKitchen, ({many}) => ({
	equipmentMaintenancePlanInKitchens: many(equipmentMaintenancePlanInKitchen),
	equipmentModelRoleInKitchens: many(equipmentModelRoleInKitchen),
	equipmentUnitRoleInKitchens: many(equipmentUnitRoleInKitchen),
	recipeEquipmentRequirementInKitchens: many(recipeEquipmentRequirementInKitchen),
	utensilInKitchens: many(utensilInKitchen),
}));

export const equipmentModelInKitchenRelations = relations(equipmentModelInKitchen, ({one, many}) => ({
	equipmentMaintenancePlanInKitchens: many(equipmentMaintenancePlanInKitchen),
	kitchenInKitchen: one(kitchenInKitchen, {
		fields: [equipmentModelInKitchen.kitchenId],
		references: [kitchenInKitchen.id]
	}),
	equipmentModelRoleInKitchens: many(equipmentModelRoleInKitchen),
	equipmentUnitInKitchens: many(equipmentUnitInKitchen),
	recipeEquipmentRequirementInKitchens: many(recipeEquipmentRequirementInKitchen),
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

export const equipmentUnitInKitchenRelations = relations(equipmentUnitInKitchen, ({one, many}) => ({
	equipmentMaintenanceLogInKitchens: many(equipmentMaintenanceLogInKitchen),
	equipmentIssueInKitchens: many(equipmentIssueInKitchen),
	kitchenInKitchen: one(kitchenInKitchen, {
		fields: [equipmentUnitInKitchen.kitchenId],
		references: [kitchenInKitchen.id]
	}),
	equipmentModelInKitchen: one(equipmentModelInKitchen, {
		fields: [equipmentUnitInKitchen.modelId],
		references: [equipmentModelInKitchen.id]
	}),
	equipmentUnitRoleInKitchens: many(equipmentUnitRoleInKitchen),
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

export const equipmentUnitRoleInKitchenRelations = relations(equipmentUnitRoleInKitchen, ({one}) => ({
	equipmentUnitInKitchen: one(equipmentUnitInKitchen, {
		fields: [equipmentUnitRoleInKitchen.unitId],
		references: [equipmentUnitInKitchen.id]
	}),
	equipmentRoleInKitchen: one(equipmentRoleInKitchen, {
		fields: [equipmentUnitRoleInKitchen.roleId],
		references: [equipmentRoleInKitchen.id]
	}),
}));

export const recipeEquipmentRequirementInKitchenRelations = relations(recipeEquipmentRequirementInKitchen, ({one}) => ({
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
	equipmentModelInKitchen: one(equipmentModelInKitchen, {
		fields: [recipeEquipmentRequirementInKitchen.modelId],
		references: [equipmentModelInKitchen.id]
	}),
}));

export const ranchoInCoreRelations = relations(ranchoInKitchen, ({one, many}) => ({
	unitsInCore: one(unitsInCore, {
		fields: [ranchoInKitchen.unitId],
		references: [unitsInCore.id]
	}),
	messHallsInKitchen: one(messHallsInKitchen, {
		fields: [ranchoInKitchen.messHallId],
		references: [messHallsInKitchen.id]
	}),
	kitchenInKitchen: one(kitchenInKitchen, {
		fields: [ranchoInKitchen.kitchenId],
		references: [kitchenInKitchen.id]
	}),
	workforceSubmissionInCores: many(workforceSubmissionInKitchen),
}));

export const workforceSurveyInCoreRelations = relations(workforceSurveyInKitchen, ({one, many}) => ({
	usersInAuth: one(usersInAuth, {
		fields: [workforceSurveyInKitchen.createdBy],
		references: [usersInAuth.id]
	}),
	workforceSubmissionInCores: many(workforceSubmissionInKitchen),
}));

export const workforceSubmissionInCoreRelations = relations(workforceSubmissionInKitchen, ({one, many}) => ({
	workforceSurveyInKitchen: one(workforceSurveyInKitchen, {
		fields: [workforceSubmissionInKitchen.surveyId],
		references: [workforceSurveyInKitchen.id]
	}),
	ranchoInKitchen: one(ranchoInKitchen, {
		fields: [workforceSubmissionInKitchen.ranchoId],
		references: [ranchoInKitchen.id]
	}),
	usersInAuth: one(usersInAuth, {
		fields: [workforceSubmissionInKitchen.submittedBy],
		references: [usersInAuth.id]
	}),
	workforceHeadcountInCores: many(workforceHeadcountInKitchen),
	workforceNoteInCores: many(workforceNoteInKitchen),
}));

export const workforceHeadcountInCoreRelations = relations(workforceHeadcountInKitchen, ({one}) => ({
	workforceSubmissionInKitchen: one(workforceSubmissionInKitchen, {
		fields: [workforceHeadcountInKitchen.submissionId],
		references: [workforceSubmissionInKitchen.id]
	}),
	workforceCategoryInKitchen: one(workforceCategoryInKitchen, {
		fields: [workforceHeadcountInKitchen.categoryId],
		references: [workforceCategoryInKitchen.id]
	}),
}));

export const workforceCategoryInCoreRelations = relations(workforceCategoryInKitchen, ({many}) => ({
	workforceHeadcountInCores: many(workforceHeadcountInKitchen),
}));

export const workforceNoteInCoreRelations = relations(workforceNoteInKitchen, ({one}) => ({
	workforceSubmissionInKitchen: one(workforceSubmissionInKitchen, {
		fields: [workforceNoteInKitchen.submissionId],
		references: [workforceSubmissionInKitchen.id]
	}),
}));
