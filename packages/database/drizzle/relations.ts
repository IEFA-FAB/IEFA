import { relations } from "drizzle-orm/relations";
import { usersInAuth, profilesAdminInAccessControl, dailyMenuInKitchen, menuItemsInKitchen, recipesInKitchen, kitchenInCore, unitsInCore, messHallsInCore, userDataInCore, mealTypeInKitchen, mealPresencesInKitchen, otherPresencesInKitchen, menuTemplateItemsInKitchen, menuTemplateInKitchen, userPermissionsInAccessControl, comprasMaterialGrupoInComprasGovIntegration, comprasMaterialClasseInComprasGovIntegration, mcpApiKeysInAccessControl, comprasMaterialItemInComprasGovIntegration, purchaseItemInProcurement, comprasServicoDivisaoInComprasGovIntegration, comprasServicoGrupoInComprasGovIntegration, comprasServicoClasseInComprasGovIntegration, ceafaInKitchen, ingredientInKitchen, folderInKitchen, purchaseItemIngredientInProcurement, comprasSyncLogInComprasGovIntegration, comprasSyncStepInComprasGovIntegration, procurementListInProcurement, procurementListItemInProcurement, procurementListKitchenInProcurement, procurementListSelectionInProcurement, productionTaskInKitchen, procurementArpItemInProcurement, empenhoInFinance, procurementArpInProcurement, analyticsChatSessionInCore, analyticsChatMessageInCore, moduleChatSessionInCore, moduleChatMessageInCore, stepTemplateInKitchen, utensilInKitchen, stepTemplateUtensilInKitchen, recipeStepInKitchen, recipeStepOutputInKitchen, recipeIngredientsInKitchen, recipeStepInputInKitchen, recipeStepUtensilInKitchen, comprasMaterialPdmInComprasGovIntegration, comprasServicoSecaoInComprasGovIntegration, opinionsInCore, recipeIngredientAlternativesInKitchen, mealForecastsInKitchen, ingredientItemInKitchen, nutrientInKitchen, ingredientNutrientInKitchen, ingredientVersionInKitchen, ingredientReviewInKitchen, procurementPesquisaPrecoInProcurement, procurementPesquisaPrecoItemInProcurement, comprasAmostraInProcurement, procurementPesquisaPrecoAmostraInProcurement, kitchenAtaDraftInProcurement, kitchenAtaDraftSelectionInProcurement, frozenPreparationInKitchen } from "./schema";

export const profilesAdminInAccessControlRelations = relations(profilesAdminInAccessControl, ({one}) => ({
	usersInAuth: one(usersInAuth, {
		fields: [profilesAdminInAccessControl.id],
		references: [usersInAuth.id]
	}),
}));

export const usersInAuthRelations = relations(usersInAuth, ({many}) => ({
	profilesAdminInAccessControls: many(profilesAdminInAccessControl),
	userDataInCores: many(userDataInCore),
	mealPresencesInKitchens: many(mealPresencesInKitchen),
	otherPresencesInKitchens: many(otherPresencesInKitchen),
	userPermissionsInAccessControls: many(userPermissionsInAccessControl),
	mcpApiKeysInAccessControls: many(mcpApiKeysInAccessControl),
	empenhoInFinances: many(empenhoInFinance),
	analyticsChatSessionInCores: many(analyticsChatSessionInCore),
	moduleChatSessionInCores: many(moduleChatSessionInCore),
	opinionsInCores: many(opinionsInCore),
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
	kitchenInCore: one(kitchenInCore, {
		fields: [dailyMenuInKitchen.kitchenId],
		references: [kitchenInCore.id]
	}),
	mealTypeInKitchen: one(mealTypeInKitchen, {
		fields: [dailyMenuInKitchen.mealTypeId],
		references: [mealTypeInKitchen.id]
	}),
}));

export const recipesInKitchenRelations = relations(recipesInKitchen, ({one, many}) => ({
	menuItemsInKitchens: many(menuItemsInKitchen),
	menuTemplateItemsInKitchens: many(menuTemplateItemsInKitchen),
	kitchenInCore: one(kitchenInCore, {
		fields: [recipesInKitchen.kitchenId],
		references: [kitchenInCore.id]
	}),
	recipeStepInKitchens: many(recipeStepInKitchen),
	recipeStepOutputInKitchens: many(recipeStepOutputInKitchen),
	recipeIngredientsInKitchens: many(recipeIngredientsInKitchen),
}));

export const kitchenInCoreRelations = relations(kitchenInCore, ({one, many}) => ({
	kitchenInCore: one(kitchenInCore, {
		fields: [kitchenInCore.kitchenId],
		references: [kitchenInCore.id],
		relationName: "kitchenInCore_kitchenId_kitchenInCore_id"
	}),
	kitchenInCores: many(kitchenInCore, {
		relationName: "kitchenInCore_kitchenId_kitchenInCore_id"
	}),
	unitsInCore_purchaseUnitId: one(unitsInCore, {
		fields: [kitchenInCore.purchaseUnitId],
		references: [unitsInCore.id],
		relationName: "kitchenInCore_purchaseUnitId_unitsInCore_id"
	}),
	unitsInCore_unitId: one(unitsInCore, {
		fields: [kitchenInCore.unitId],
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
	messHallsInCores: many(messHallsInCore),
	menuTemplateInKitchens: many(menuTemplateInKitchen),
	kitchenAtaDraftInProcurements: many(kitchenAtaDraftInProcurement),
}));

export const unitsInCoreRelations = relations(unitsInCore, ({many}) => ({
	kitchenInCores_purchaseUnitId: many(kitchenInCore, {
		relationName: "kitchenInCore_purchaseUnitId_unitsInCore_id"
	}),
	kitchenInCores_unitId: many(kitchenInCore, {
		relationName: "kitchenInCore_unitId_unitsInCore_id"
	}),
	userPermissionsInAccessControls: many(userPermissionsInAccessControl),
	procurementListInProcurements: many(procurementListInProcurement),
	empenhoInFinances: many(empenhoInFinance),
	procurementArpInProcurements: many(procurementArpInProcurement),
	messHallsInCores_unitId: many(messHallsInCore, {
		relationName: "messHallsInCore_unitId_unitsInCore_id"
	}),
}));

export const userDataInCoreRelations = relations(userDataInCore, ({one}) => ({
	messHallsInCore: one(messHallsInCore, {
		fields: [userDataInCore.defaultMessHallId],
		references: [messHallsInCore.id]
	}),
	usersInAuth: one(usersInAuth, {
		fields: [userDataInCore.id],
		references: [usersInAuth.id]
	}),
}));

export const messHallsInCoreRelations = relations(messHallsInCore, ({one, many}) => ({
	userDataInCores: many(userDataInCore),
	mealPresencesInKitchens: many(mealPresencesInKitchen),
	otherPresencesInKitchens: many(otherPresencesInKitchen),
	userPermissionsInAccessControls: many(userPermissionsInAccessControl),
	kitchenInCore: one(kitchenInCore, {
		fields: [messHallsInCore.kitchenId],
		references: [kitchenInCore.id]
	}),
	unitsInCore_unitId: one(unitsInCore, {
		fields: [messHallsInCore.unitId],
		references: [unitsInCore.id],
		relationName: "messHallsInCore_unitId_unitsInCore_id"
	}),
	mealForecastsInKitchens: many(mealForecastsInKitchen),
}));

export const mealTypeInKitchenRelations = relations(mealTypeInKitchen, ({one, many}) => ({
	kitchenInCore: one(kitchenInCore, {
		fields: [mealTypeInKitchen.kitchenId],
		references: [kitchenInCore.id]
	}),
	dailyMenuInKitchens: many(dailyMenuInKitchen),
	menuTemplateItemsInKitchens: many(menuTemplateItemsInKitchen),
}));

export const mealPresencesInKitchenRelations = relations(mealPresencesInKitchen, ({one}) => ({
	messHallsInCore: one(messHallsInCore, {
		fields: [mealPresencesInKitchen.messHallId],
		references: [messHallsInCore.id]
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
	messHallsInCore: one(messHallsInCore, {
		fields: [otherPresencesInKitchen.messHallId],
		references: [messHallsInCore.id]
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

export const menuTemplateInKitchenRelations = relations(menuTemplateInKitchen, ({one, many}) => ({
	menuTemplateItemsInKitchens: many(menuTemplateItemsInKitchen),
	procurementListSelectionInProcurements: many(procurementListSelectionInProcurement),
	menuTemplateInKitchen: one(menuTemplateInKitchen, {
		fields: [menuTemplateInKitchen.baseTemplateId],
		references: [menuTemplateInKitchen.id],
		relationName: "menuTemplateInKitchen_baseTemplateId_menuTemplateInKitchen_id"
	}),
	menuTemplateInKitchens: many(menuTemplateInKitchen, {
		relationName: "menuTemplateInKitchen_baseTemplateId_menuTemplateInKitchen_id"
	}),
	kitchenInCore: one(kitchenInCore, {
		fields: [menuTemplateInKitchen.kitchenId],
		references: [kitchenInCore.id]
	}),
	kitchenAtaDraftSelectionInProcurements: many(kitchenAtaDraftSelectionInProcurement),
}));

export const userPermissionsInAccessControlRelations = relations(userPermissionsInAccessControl, ({one}) => ({
	kitchenInCore: one(kitchenInCore, {
		fields: [userPermissionsInAccessControl.kitchenId],
		references: [kitchenInCore.id]
	}),
	messHallsInCore: one(messHallsInCore, {
		fields: [userPermissionsInAccessControl.messHallId],
		references: [messHallsInCore.id]
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
	kitchenInCore: one(kitchenInCore, {
		fields: [procurementListKitchenInProcurement.kitchenId],
		references: [kitchenInCore.id]
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
	kitchenInCore: one(kitchenInCore, {
		fields: [productionTaskInKitchen.kitchenId],
		references: [kitchenInCore.id]
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

export const analyticsChatMessageInCoreRelations = relations(analyticsChatMessageInCore, ({one}) => ({
	analyticsChatSessionInCore: one(analyticsChatSessionInCore, {
		fields: [analyticsChatMessageInCore.sessionId],
		references: [analyticsChatSessionInCore.id]
	}),
}));

export const analyticsChatSessionInCoreRelations = relations(analyticsChatSessionInCore, ({one, many}) => ({
	analyticsChatMessageInCores: many(analyticsChatMessageInCore),
	usersInAuth: one(usersInAuth, {
		fields: [analyticsChatSessionInCore.userId],
		references: [usersInAuth.id]
	}),
}));

export const moduleChatSessionInCoreRelations = relations(moduleChatSessionInCore, ({one, many}) => ({
	usersInAuth: one(usersInAuth, {
		fields: [moduleChatSessionInCore.userId],
		references: [usersInAuth.id]
	}),
	moduleChatMessageInCores: many(moduleChatMessageInCore),
}));

export const moduleChatMessageInCoreRelations = relations(moduleChatMessageInCore, ({one}) => ({
	moduleChatSessionInCore: one(moduleChatSessionInCore, {
		fields: [moduleChatMessageInCore.sessionId],
		references: [moduleChatSessionInCore.id]
	}),
}));

export const stepTemplateInKitchenRelations = relations(stepTemplateInKitchen, ({one, many}) => ({
	kitchenInCore: one(kitchenInCore, {
		fields: [stepTemplateInKitchen.kitchenId],
		references: [kitchenInCore.id]
	}),
	stepTemplateUtensilInKitchens: many(stepTemplateUtensilInKitchen),
	recipeStepInKitchens: many(recipeStepInKitchen),
}));

export const utensilInKitchenRelations = relations(utensilInKitchen, ({one, many}) => ({
	kitchenInCore: one(kitchenInCore, {
		fields: [utensilInKitchen.kitchenId],
		references: [kitchenInCore.id]
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

export const opinionsInCoreRelations = relations(opinionsInCore, ({one}) => ({
	usersInAuth: one(usersInAuth, {
		fields: [opinionsInCore.userId],
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

export const mealForecastsInKitchenRelations = relations(mealForecastsInKitchen, ({one}) => ({
	messHallsInCore: one(messHallsInCore, {
		fields: [mealForecastsInKitchen.messHallId],
		references: [messHallsInCore.id]
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
	kitchenInCore: one(kitchenInCore, {
		fields: [kitchenAtaDraftInProcurement.kitchenId],
		references: [kitchenInCore.id]
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