import { relations } from "drizzle-orm/relations";
import { usersInAuth, profilesAdminInSisub, ingredientInSisub, ingredientVersionInSisub, kitchenInSisub, messHallsInSisub, unitsInSisub, recipeIngredientsInSisub, recipesInSisub, purchaseItemInSisub, ingredientItemInSisub, dailyMenuInSisub, menuItemsInSisub, ingredientReviewInSisub, mealForecastsInSisub, menuTemplateInSisub, userDataInSisub, opinionsInSisub, mealPresencesInSisub, otherPresencesInSisub, mealTypeInSisub, menuTemplateItemsInSisub, recipeIngredientAlternativesInSisub, userPermissionsInSisub, comprasMaterialGrupoInSisub, comprasMaterialClasseInSisub, comprasMaterialPdmInSisub, mcpApiKeysInSisub, nutrientInSisub, ingredientNutrientInSisub, comprasServicoSecaoInSisub, comprasServicoDivisaoInSisub, comprasServicoGrupoInSisub, comprasServicoClasseInSisub, comprasMaterialItemInSisub, purchaseItemIngredientInSisub, ceafaInSisub, folderInSisub, comprasSyncLogInSisub, comprasSyncStepInSisub, procurementListInSisub, procurementListKitchenInSisub, procurementListSelectionInSisub, procurementListItemInSisub, comprasAmostraInSisub, procurementPesquisaPrecoAmostraInSisub, procurementPesquisaPrecoItemInSisub, procurementPesquisaPrecoInSisub, kitchenAtaDraftInSisub, kitchenAtaDraftSelectionInSisub, productionTaskInSisub, procurementArpItemInSisub, empenhoInSisub, procurementArpInSisub, analyticsChatSessionInSisub, analyticsChatMessageInSisub, moduleChatSessionInSisub, moduleChatMessageInSisub, stepTemplateInSisub, utensilInSisub, stepTemplateUtensilInSisub, recipeStepInSisub, recipeStepOutputInSisub, recipeStepInputInSisub, recipeStepUtensilInSisub } from "./schema";

export const profilesAdminInSisubRelations = relations(profilesAdminInSisub, ({one}) => ({
	usersInAuth: one(usersInAuth, {
		fields: [profilesAdminInSisub.id],
		references: [usersInAuth.id]
	}),
}));

export const usersInAuthRelations = relations(usersInAuth, ({many}) => ({
	profilesAdminInSisubs: many(profilesAdminInSisub),
	mealForecastsInSisubs: many(mealForecastsInSisub),
	userDataInSisubs: many(userDataInSisub),
	opinionsInSisubs: many(opinionsInSisub),
	mealPresencesInSisubs: many(mealPresencesInSisub),
	otherPresencesInSisubs: many(otherPresencesInSisub),
	userPermissionsInSisubs: many(userPermissionsInSisub),
	mcpApiKeysInSisubs: many(mcpApiKeysInSisub),
	empenhoInSisubs: many(empenhoInSisub),
	analyticsChatSessionInSisubs: many(analyticsChatSessionInSisub),
	moduleChatSessionInSisubs: many(moduleChatSessionInSisub),
}));

export const ingredientVersionInSisubRelations = relations(ingredientVersionInSisub, ({one}) => ({
	ingredientInSisub: one(ingredientInSisub, {
		fields: [ingredientVersionInSisub.ingredientId],
		references: [ingredientInSisub.id]
	}),
}));

export const ingredientInSisubRelations = relations(ingredientInSisub, ({one, many}) => ({
	ingredientVersionInSisubs: many(ingredientVersionInSisub),
	recipeIngredientsInSisubs: many(recipeIngredientsInSisub),
	ingredientItemInSisubs: many(ingredientItemInSisub),
	ingredientReviewInSisubs: many(ingredientReviewInSisub),
	recipeIngredientAlternativesInSisubs: many(recipeIngredientAlternativesInSisub),
	ingredientNutrientInSisubs: many(ingredientNutrientInSisub),
	purchaseItemIngredientInSisubs: many(purchaseItemIngredientInSisub),
	ceafaInSisub: one(ceafaInSisub, {
		fields: [ingredientInSisub.ceafaId],
		references: [ceafaInSisub.id]
	}),
	folderInSisub: one(folderInSisub, {
		fields: [ingredientInSisub.folderId],
		references: [folderInSisub.id]
	}),
	procurementListItemInSisubs: many(procurementListItemInSisub),
}));

export const messHallsInSisubRelations = relations(messHallsInSisub, ({one, many}) => ({
	kitchenInSisub: one(kitchenInSisub, {
		fields: [messHallsInSisub.kitchenId],
		references: [kitchenInSisub.id]
	}),
	unitsInSisub_unitId: one(unitsInSisub, {
		fields: [messHallsInSisub.unitId],
		references: [unitsInSisub.id],
		relationName: "messHallsInSisub_unitId_unitsInSisub_id"
	}),
	mealForecastsInSisubs: many(mealForecastsInSisub),
	userDataInSisubs: many(userDataInSisub),
	mealPresencesInSisubs: many(mealPresencesInSisub),
	otherPresencesInSisubs: many(otherPresencesInSisub),
	userPermissionsInSisubs: many(userPermissionsInSisub),
}));

export const kitchenInSisubRelations = relations(kitchenInSisub, ({one, many}) => ({
	messHallsInSisubs: many(messHallsInSisub),
	kitchenInSisub: one(kitchenInSisub, {
		fields: [kitchenInSisub.kitchenId],
		references: [kitchenInSisub.id],
		relationName: "kitchenInSisub_kitchenId_kitchenInSisub_id"
	}),
	kitchenInSisubs: many(kitchenInSisub, {
		relationName: "kitchenInSisub_kitchenId_kitchenInSisub_id"
	}),
	unitsInSisub_purchaseUnitId: one(unitsInSisub, {
		fields: [kitchenInSisub.purchaseUnitId],
		references: [unitsInSisub.id],
		relationName: "kitchenInSisub_purchaseUnitId_unitsInSisub_id"
	}),
	unitsInSisub_unitId: one(unitsInSisub, {
		fields: [kitchenInSisub.unitId],
		references: [unitsInSisub.id],
		relationName: "kitchenInSisub_unitId_unitsInSisub_id"
	}),
	menuTemplateInSisubs: many(menuTemplateInSisub),
	mealTypeInSisubs: many(mealTypeInSisub),
	recipesInSisubs: many(recipesInSisub),
	dailyMenuInSisubs: many(dailyMenuInSisub),
	userPermissionsInSisubs: many(userPermissionsInSisub),
	procurementListKitchenInSisubs: many(procurementListKitchenInSisub),
	kitchenAtaDraftInSisubs: many(kitchenAtaDraftInSisub),
	productionTaskInSisubs: many(productionTaskInSisub),
	stepTemplateInSisubs: many(stepTemplateInSisub),
	utensilInSisubs: many(utensilInSisub),
}));

export const unitsInSisubRelations = relations(unitsInSisub, ({many}) => ({
	messHallsInSisubs_unitId: many(messHallsInSisub, {
		relationName: "messHallsInSisub_unitId_unitsInSisub_id"
	}),
	kitchenInSisubs_purchaseUnitId: many(kitchenInSisub, {
		relationName: "kitchenInSisub_purchaseUnitId_unitsInSisub_id"
	}),
	kitchenInSisubs_unitId: many(kitchenInSisub, {
		relationName: "kitchenInSisub_unitId_unitsInSisub_id"
	}),
	userPermissionsInSisubs: many(userPermissionsInSisub),
	procurementListInSisubs: many(procurementListInSisub),
	empenhoInSisubs: many(empenhoInSisub),
	procurementArpInSisubs: many(procurementArpInSisub),
}));

export const recipeIngredientsInSisubRelations = relations(recipeIngredientsInSisub, ({one, many}) => ({
	ingredientInSisub: one(ingredientInSisub, {
		fields: [recipeIngredientsInSisub.ingredientId],
		references: [ingredientInSisub.id]
	}),
	recipesInSisub: one(recipesInSisub, {
		fields: [recipeIngredientsInSisub.recipeId],
		references: [recipesInSisub.id]
	}),
	recipeIngredientAlternativesInSisubs: many(recipeIngredientAlternativesInSisub),
	recipeStepInputInSisubs: many(recipeStepInputInSisub),
}));

export const recipesInSisubRelations = relations(recipesInSisub, ({one, many}) => ({
	recipeIngredientsInSisubs: many(recipeIngredientsInSisub),
	menuItemsInSisubs: many(menuItemsInSisub),
	kitchenInSisub: one(kitchenInSisub, {
		fields: [recipesInSisub.kitchenId],
		references: [kitchenInSisub.id]
	}),
	menuTemplateItemsInSisubs: many(menuTemplateItemsInSisub),
	recipeStepInSisubs: many(recipeStepInSisub),
	recipeStepOutputInSisubs: many(recipeStepOutputInSisub),
}));

export const ingredientItemInSisubRelations = relations(ingredientItemInSisub, ({one}) => ({
	purchaseItemInSisub: one(purchaseItemInSisub, {
		fields: [ingredientItemInSisub.purchaseItemId],
		references: [purchaseItemInSisub.id]
	}),
	ingredientInSisub: one(ingredientInSisub, {
		fields: [ingredientItemInSisub.ingredientId],
		references: [ingredientInSisub.id]
	}),
}));

export const purchaseItemInSisubRelations = relations(purchaseItemInSisub, ({one, many}) => ({
	ingredientItemInSisubs: many(ingredientItemInSisub),
	comprasMaterialItemInSisub: one(comprasMaterialItemInSisub, {
		fields: [purchaseItemInSisub.catmatItemCodigo],
		references: [comprasMaterialItemInSisub.codigoItem]
	}),
	purchaseItemIngredientInSisubs: many(purchaseItemIngredientInSisub),
	procurementListItemInSisubs: many(procurementListItemInSisub),
}));

export const menuItemsInSisubRelations = relations(menuItemsInSisub, ({one, many}) => ({
	dailyMenuInSisub: one(dailyMenuInSisub, {
		fields: [menuItemsInSisub.dailyMenuId],
		references: [dailyMenuInSisub.id]
	}),
	recipesInSisub: one(recipesInSisub, {
		fields: [menuItemsInSisub.recipeOriginId],
		references: [recipesInSisub.id]
	}),
	productionTaskInSisubs: many(productionTaskInSisub),
}));

export const dailyMenuInSisubRelations = relations(dailyMenuInSisub, ({one, many}) => ({
	menuItemsInSisubs: many(menuItemsInSisub),
	kitchenInSisub: one(kitchenInSisub, {
		fields: [dailyMenuInSisub.kitchenId],
		references: [kitchenInSisub.id]
	}),
	mealTypeInSisub: one(mealTypeInSisub, {
		fields: [dailyMenuInSisub.mealTypeId],
		references: [mealTypeInSisub.id]
	}),
}));

export const ingredientReviewInSisubRelations = relations(ingredientReviewInSisub, ({one}) => ({
	ingredientInSisub: one(ingredientInSisub, {
		fields: [ingredientReviewInSisub.ingredientId],
		references: [ingredientInSisub.id]
	}),
}));

export const mealForecastsInSisubRelations = relations(mealForecastsInSisub, ({one}) => ({
	messHallsInSisub: one(messHallsInSisub, {
		fields: [mealForecastsInSisub.messHallId],
		references: [messHallsInSisub.id]
	}),
	usersInAuth: one(usersInAuth, {
		fields: [mealForecastsInSisub.userId],
		references: [usersInAuth.id]
	}),
}));

export const menuTemplateInSisubRelations = relations(menuTemplateInSisub, ({one, many}) => ({
	menuTemplateInSisub: one(menuTemplateInSisub, {
		fields: [menuTemplateInSisub.baseTemplateId],
		references: [menuTemplateInSisub.id],
		relationName: "menuTemplateInSisub_baseTemplateId_menuTemplateInSisub_id"
	}),
	menuTemplateInSisubs: many(menuTemplateInSisub, {
		relationName: "menuTemplateInSisub_baseTemplateId_menuTemplateInSisub_id"
	}),
	kitchenInSisub: one(kitchenInSisub, {
		fields: [menuTemplateInSisub.kitchenId],
		references: [kitchenInSisub.id]
	}),
	menuTemplateItemsInSisubs: many(menuTemplateItemsInSisub),
	procurementListSelectionInSisubs: many(procurementListSelectionInSisub),
	kitchenAtaDraftSelectionInSisubs: many(kitchenAtaDraftSelectionInSisub),
}));

export const userDataInSisubRelations = relations(userDataInSisub, ({one}) => ({
	messHallsInSisub: one(messHallsInSisub, {
		fields: [userDataInSisub.defaultMessHallId],
		references: [messHallsInSisub.id]
	}),
	usersInAuth: one(usersInAuth, {
		fields: [userDataInSisub.id],
		references: [usersInAuth.id]
	}),
}));

export const opinionsInSisubRelations = relations(opinionsInSisub, ({one}) => ({
	usersInAuth: one(usersInAuth, {
		fields: [opinionsInSisub.userId],
		references: [usersInAuth.id]
	}),
}));

export const mealPresencesInSisubRelations = relations(mealPresencesInSisub, ({one}) => ({
	messHallsInSisub: one(messHallsInSisub, {
		fields: [mealPresencesInSisub.messHallId],
		references: [messHallsInSisub.id]
	}),
	usersInAuth: one(usersInAuth, {
		fields: [mealPresencesInSisub.userId],
		references: [usersInAuth.id]
	}),
}));

export const otherPresencesInSisubRelations = relations(otherPresencesInSisub, ({one}) => ({
	usersInAuth: one(usersInAuth, {
		fields: [otherPresencesInSisub.adminId],
		references: [usersInAuth.id]
	}),
	messHallsInSisub: one(messHallsInSisub, {
		fields: [otherPresencesInSisub.messHallId],
		references: [messHallsInSisub.id]
	}),
}));

export const mealTypeInSisubRelations = relations(mealTypeInSisub, ({one, many}) => ({
	kitchenInSisub: one(kitchenInSisub, {
		fields: [mealTypeInSisub.kitchenId],
		references: [kitchenInSisub.id]
	}),
	dailyMenuInSisubs: many(dailyMenuInSisub),
	menuTemplateItemsInSisubs: many(menuTemplateItemsInSisub),
}));

export const menuTemplateItemsInSisubRelations = relations(menuTemplateItemsInSisub, ({one}) => ({
	mealTypeInSisub: one(mealTypeInSisub, {
		fields: [menuTemplateItemsInSisub.mealTypeId],
		references: [mealTypeInSisub.id]
	}),
	menuTemplateInSisub: one(menuTemplateInSisub, {
		fields: [menuTemplateItemsInSisub.menuTemplateId],
		references: [menuTemplateInSisub.id]
	}),
	recipesInSisub: one(recipesInSisub, {
		fields: [menuTemplateItemsInSisub.recipeId],
		references: [recipesInSisub.id]
	}),
}));

export const recipeIngredientAlternativesInSisubRelations = relations(recipeIngredientAlternativesInSisub, ({one}) => ({
	ingredientInSisub: one(ingredientInSisub, {
		fields: [recipeIngredientAlternativesInSisub.ingredientId],
		references: [ingredientInSisub.id]
	}),
	recipeIngredientsInSisub: one(recipeIngredientsInSisub, {
		fields: [recipeIngredientAlternativesInSisub.recipeIngredientId],
		references: [recipeIngredientsInSisub.id]
	}),
}));

export const userPermissionsInSisubRelations = relations(userPermissionsInSisub, ({one}) => ({
	kitchenInSisub: one(kitchenInSisub, {
		fields: [userPermissionsInSisub.kitchenId],
		references: [kitchenInSisub.id]
	}),
	messHallsInSisub: one(messHallsInSisub, {
		fields: [userPermissionsInSisub.messHallId],
		references: [messHallsInSisub.id]
	}),
	unitsInSisub: one(unitsInSisub, {
		fields: [userPermissionsInSisub.unitId],
		references: [unitsInSisub.id]
	}),
	usersInAuth: one(usersInAuth, {
		fields: [userPermissionsInSisub.userId],
		references: [usersInAuth.id]
	}),
}));

export const comprasMaterialClasseInSisubRelations = relations(comprasMaterialClasseInSisub, ({one, many}) => ({
	comprasMaterialGrupoInSisub: one(comprasMaterialGrupoInSisub, {
		fields: [comprasMaterialClasseInSisub.codigoGrupo],
		references: [comprasMaterialGrupoInSisub.codigoGrupo]
	}),
	comprasMaterialPdmInSisubs: many(comprasMaterialPdmInSisub),
}));

export const comprasMaterialGrupoInSisubRelations = relations(comprasMaterialGrupoInSisub, ({many}) => ({
	comprasMaterialClasseInSisubs: many(comprasMaterialClasseInSisub),
}));

export const comprasMaterialPdmInSisubRelations = relations(comprasMaterialPdmInSisub, ({one}) => ({
	comprasMaterialClasseInSisub: one(comprasMaterialClasseInSisub, {
		fields: [comprasMaterialPdmInSisub.codigoClasse],
		references: [comprasMaterialClasseInSisub.codigoClasse]
	}),
}));

export const mcpApiKeysInSisubRelations = relations(mcpApiKeysInSisub, ({one}) => ({
	usersInAuth: one(usersInAuth, {
		fields: [mcpApiKeysInSisub.userId],
		references: [usersInAuth.id]
	}),
}));

export const ingredientNutrientInSisubRelations = relations(ingredientNutrientInSisub, ({one}) => ({
	nutrientInSisub: one(nutrientInSisub, {
		fields: [ingredientNutrientInSisub.nutrientId],
		references: [nutrientInSisub.id]
	}),
	ingredientInSisub: one(ingredientInSisub, {
		fields: [ingredientNutrientInSisub.ingredientId],
		references: [ingredientInSisub.id]
	}),
}));

export const nutrientInSisubRelations = relations(nutrientInSisub, ({many}) => ({
	ingredientNutrientInSisubs: many(ingredientNutrientInSisub),
}));

export const comprasServicoDivisaoInSisubRelations = relations(comprasServicoDivisaoInSisub, ({one, many}) => ({
	comprasServicoSecaoInSisub: one(comprasServicoSecaoInSisub, {
		fields: [comprasServicoDivisaoInSisub.codigoSecao],
		references: [comprasServicoSecaoInSisub.codigoSecao]
	}),
	comprasServicoGrupoInSisubs: many(comprasServicoGrupoInSisub),
}));

export const comprasServicoSecaoInSisubRelations = relations(comprasServicoSecaoInSisub, ({many}) => ({
	comprasServicoDivisaoInSisubs: many(comprasServicoDivisaoInSisub),
}));

export const comprasServicoGrupoInSisubRelations = relations(comprasServicoGrupoInSisub, ({one, many}) => ({
	comprasServicoDivisaoInSisub: one(comprasServicoDivisaoInSisub, {
		fields: [comprasServicoGrupoInSisub.codigoDivisao],
		references: [comprasServicoDivisaoInSisub.codigoDivisao]
	}),
	comprasServicoClasseInSisubs: many(comprasServicoClasseInSisub),
}));

export const comprasServicoClasseInSisubRelations = relations(comprasServicoClasseInSisub, ({one}) => ({
	comprasServicoGrupoInSisub: one(comprasServicoGrupoInSisub, {
		fields: [comprasServicoClasseInSisub.codigoGrupo],
		references: [comprasServicoGrupoInSisub.codigoGrupo]
	}),
}));

export const comprasMaterialItemInSisubRelations = relations(comprasMaterialItemInSisub, ({many}) => ({
	purchaseItemInSisubs: many(purchaseItemInSisub),
}));

export const purchaseItemIngredientInSisubRelations = relations(purchaseItemIngredientInSisub, ({one}) => ({
	ingredientInSisub: one(ingredientInSisub, {
		fields: [purchaseItemIngredientInSisub.ingredientId],
		references: [ingredientInSisub.id]
	}),
	purchaseItemInSisub: one(purchaseItemInSisub, {
		fields: [purchaseItemIngredientInSisub.purchaseItemId],
		references: [purchaseItemInSisub.id]
	}),
}));

export const ceafaInSisubRelations = relations(ceafaInSisub, ({many}) => ({
	ingredientInSisubs: many(ingredientInSisub),
}));

export const folderInSisubRelations = relations(folderInSisub, ({many}) => ({
	ingredientInSisubs: many(ingredientInSisub),
}));

export const comprasSyncStepInSisubRelations = relations(comprasSyncStepInSisub, ({one}) => ({
	comprasSyncLogInSisub: one(comprasSyncLogInSisub, {
		fields: [comprasSyncStepInSisub.syncId],
		references: [comprasSyncLogInSisub.id]
	}),
}));

export const comprasSyncLogInSisubRelations = relations(comprasSyncLogInSisub, ({many}) => ({
	comprasSyncStepInSisubs: many(comprasSyncStepInSisub),
}));

export const procurementListKitchenInSisubRelations = relations(procurementListKitchenInSisub, ({one, many}) => ({
	procurementListInSisub: one(procurementListInSisub, {
		fields: [procurementListKitchenInSisub.listId],
		references: [procurementListInSisub.id]
	}),
	kitchenInSisub: one(kitchenInSisub, {
		fields: [procurementListKitchenInSisub.kitchenId],
		references: [kitchenInSisub.id]
	}),
	procurementListSelectionInSisubs: many(procurementListSelectionInSisub),
}));

export const procurementListInSisubRelations = relations(procurementListInSisub, ({one, many}) => ({
	procurementListKitchenInSisubs: many(procurementListKitchenInSisub),
	unitsInSisub: one(unitsInSisub, {
		fields: [procurementListInSisub.unitId],
		references: [unitsInSisub.id]
	}),
	procurementListItemInSisubs: many(procurementListItemInSisub),
	procurementPesquisaPrecoInSisubs: many(procurementPesquisaPrecoInSisub),
	procurementArpInSisubs: many(procurementArpInSisub),
}));

export const procurementListSelectionInSisubRelations = relations(procurementListSelectionInSisub, ({one}) => ({
	procurementListKitchenInSisub: one(procurementListKitchenInSisub, {
		fields: [procurementListSelectionInSisub.listKitchenId],
		references: [procurementListKitchenInSisub.id]
	}),
	menuTemplateInSisub: one(menuTemplateInSisub, {
		fields: [procurementListSelectionInSisub.templateId],
		references: [menuTemplateInSisub.id]
	}),
}));

export const procurementListItemInSisubRelations = relations(procurementListItemInSisub, ({one, many}) => ({
	procurementListInSisub: one(procurementListInSisub, {
		fields: [procurementListItemInSisub.listId],
		references: [procurementListInSisub.id]
	}),
	ingredientInSisub: one(ingredientInSisub, {
		fields: [procurementListItemInSisub.ingredientId],
		references: [ingredientInSisub.id]
	}),
	purchaseItemInSisub: one(purchaseItemInSisub, {
		fields: [procurementListItemInSisub.purchaseItemId],
		references: [purchaseItemInSisub.id]
	}),
	procurementPesquisaPrecoItemInSisubs: many(procurementPesquisaPrecoItemInSisub),
	procurementArpItemInSisubs: many(procurementArpItemInSisub),
}));

export const procurementPesquisaPrecoAmostraInSisubRelations = relations(procurementPesquisaPrecoAmostraInSisub, ({one}) => ({
	comprasAmostraInSisub: one(comprasAmostraInSisub, {
		fields: [procurementPesquisaPrecoAmostraInSisub.amostraId],
		references: [comprasAmostraInSisub.id]
	}),
	procurementPesquisaPrecoItemInSisub: one(procurementPesquisaPrecoItemInSisub, {
		fields: [procurementPesquisaPrecoAmostraInSisub.researchItemId],
		references: [procurementPesquisaPrecoItemInSisub.id]
	}),
}));

export const comprasAmostraInSisubRelations = relations(comprasAmostraInSisub, ({many}) => ({
	procurementPesquisaPrecoAmostraInSisubs: many(procurementPesquisaPrecoAmostraInSisub),
}));

export const procurementPesquisaPrecoItemInSisubRelations = relations(procurementPesquisaPrecoItemInSisub, ({one, many}) => ({
	procurementPesquisaPrecoAmostraInSisubs: many(procurementPesquisaPrecoAmostraInSisub),
	procurementListItemInSisub: one(procurementListItemInSisub, {
		fields: [procurementPesquisaPrecoItemInSisub.ataItemId],
		references: [procurementListItemInSisub.id]
	}),
	procurementPesquisaPrecoInSisub: one(procurementPesquisaPrecoInSisub, {
		fields: [procurementPesquisaPrecoItemInSisub.researchId],
		references: [procurementPesquisaPrecoInSisub.id]
	}),
}));

export const procurementPesquisaPrecoInSisubRelations = relations(procurementPesquisaPrecoInSisub, ({one, many}) => ({
	procurementListInSisub: one(procurementListInSisub, {
		fields: [procurementPesquisaPrecoInSisub.ataId],
		references: [procurementListInSisub.id]
	}),
	procurementPesquisaPrecoItemInSisubs: many(procurementPesquisaPrecoItemInSisub),
}));

export const kitchenAtaDraftInSisubRelations = relations(kitchenAtaDraftInSisub, ({one, many}) => ({
	kitchenInSisub: one(kitchenInSisub, {
		fields: [kitchenAtaDraftInSisub.kitchenId],
		references: [kitchenInSisub.id]
	}),
	kitchenAtaDraftSelectionInSisubs: many(kitchenAtaDraftSelectionInSisub),
}));

export const kitchenAtaDraftSelectionInSisubRelations = relations(kitchenAtaDraftSelectionInSisub, ({one}) => ({
	kitchenAtaDraftInSisub: one(kitchenAtaDraftInSisub, {
		fields: [kitchenAtaDraftSelectionInSisub.draftId],
		references: [kitchenAtaDraftInSisub.id]
	}),
	menuTemplateInSisub: one(menuTemplateInSisub, {
		fields: [kitchenAtaDraftSelectionInSisub.templateId],
		references: [menuTemplateInSisub.id]
	}),
}));

export const productionTaskInSisubRelations = relations(productionTaskInSisub, ({one}) => ({
	kitchenInSisub: one(kitchenInSisub, {
		fields: [productionTaskInSisub.kitchenId],
		references: [kitchenInSisub.id]
	}),
	menuItemsInSisub: one(menuItemsInSisub, {
		fields: [productionTaskInSisub.menuItemId],
		references: [menuItemsInSisub.id]
	}),
}));

export const empenhoInSisubRelations = relations(empenhoInSisub, ({one}) => ({
	procurementArpItemInSisub: one(procurementArpItemInSisub, {
		fields: [empenhoInSisub.arpItemId],
		references: [procurementArpItemInSisub.id]
	}),
	usersInAuth: one(usersInAuth, {
		fields: [empenhoInSisub.createdBy],
		references: [usersInAuth.id]
	}),
	unitsInSisub: one(unitsInSisub, {
		fields: [empenhoInSisub.unitId],
		references: [unitsInSisub.id]
	}),
}));

export const procurementArpItemInSisubRelations = relations(procurementArpItemInSisub, ({one, many}) => ({
	empenhoInSisubs: many(empenhoInSisub),
	procurementArpInSisub: one(procurementArpInSisub, {
		fields: [procurementArpItemInSisub.arpId],
		references: [procurementArpInSisub.id]
	}),
	procurementListItemInSisub: one(procurementListItemInSisub, {
		fields: [procurementArpItemInSisub.ataItemId],
		references: [procurementListItemInSisub.id]
	}),
}));

export const procurementArpInSisubRelations = relations(procurementArpInSisub, ({one, many}) => ({
	procurementListInSisub: one(procurementListInSisub, {
		fields: [procurementArpInSisub.ataId],
		references: [procurementListInSisub.id]
	}),
	unitsInSisub: one(unitsInSisub, {
		fields: [procurementArpInSisub.unitId],
		references: [unitsInSisub.id]
	}),
	procurementArpItemInSisubs: many(procurementArpItemInSisub),
}));

export const analyticsChatMessageInSisubRelations = relations(analyticsChatMessageInSisub, ({one}) => ({
	analyticsChatSessionInSisub: one(analyticsChatSessionInSisub, {
		fields: [analyticsChatMessageInSisub.sessionId],
		references: [analyticsChatSessionInSisub.id]
	}),
}));

export const analyticsChatSessionInSisubRelations = relations(analyticsChatSessionInSisub, ({one, many}) => ({
	analyticsChatMessageInSisubs: many(analyticsChatMessageInSisub),
	usersInAuth: one(usersInAuth, {
		fields: [analyticsChatSessionInSisub.userId],
		references: [usersInAuth.id]
	}),
}));

export const moduleChatSessionInSisubRelations = relations(moduleChatSessionInSisub, ({one, many}) => ({
	usersInAuth: one(usersInAuth, {
		fields: [moduleChatSessionInSisub.userId],
		references: [usersInAuth.id]
	}),
	moduleChatMessageInSisubs: many(moduleChatMessageInSisub),
}));

export const moduleChatMessageInSisubRelations = relations(moduleChatMessageInSisub, ({one}) => ({
	moduleChatSessionInSisub: one(moduleChatSessionInSisub, {
		fields: [moduleChatMessageInSisub.sessionId],
		references: [moduleChatSessionInSisub.id]
	}),
}));

export const stepTemplateInSisubRelations = relations(stepTemplateInSisub, ({one, many}) => ({
	kitchenInSisub: one(kitchenInSisub, {
		fields: [stepTemplateInSisub.kitchenId],
		references: [kitchenInSisub.id]
	}),
	stepTemplateUtensilInSisubs: many(stepTemplateUtensilInSisub),
	recipeStepInSisubs: many(recipeStepInSisub),
}));

export const utensilInSisubRelations = relations(utensilInSisub, ({one, many}) => ({
	kitchenInSisub: one(kitchenInSisub, {
		fields: [utensilInSisub.kitchenId],
		references: [kitchenInSisub.id]
	}),
	stepTemplateUtensilInSisubs: many(stepTemplateUtensilInSisub),
	recipeStepUtensilInSisubs: many(recipeStepUtensilInSisub),
}));

export const stepTemplateUtensilInSisubRelations = relations(stepTemplateUtensilInSisub, ({one}) => ({
	stepTemplateInSisub: one(stepTemplateInSisub, {
		fields: [stepTemplateUtensilInSisub.stepTemplateId],
		references: [stepTemplateInSisub.id]
	}),
	utensilInSisub: one(utensilInSisub, {
		fields: [stepTemplateUtensilInSisub.utensilId],
		references: [utensilInSisub.id]
	}),
}));

export const recipeStepInSisubRelations = relations(recipeStepInSisub, ({one, many}) => ({
	recipesInSisub: one(recipesInSisub, {
		fields: [recipeStepInSisub.recipeId],
		references: [recipesInSisub.id]
	}),
	stepTemplateInSisub: one(stepTemplateInSisub, {
		fields: [recipeStepInSisub.stepTemplateId],
		references: [stepTemplateInSisub.id]
	}),
	recipeStepOutputInSisubs: many(recipeStepOutputInSisub),
	recipeStepInputInSisubs: many(recipeStepInputInSisub),
	recipeStepUtensilInSisubs: many(recipeStepUtensilInSisub),
}));

export const recipeStepOutputInSisubRelations = relations(recipeStepOutputInSisub, ({one, many}) => ({
	recipesInSisub: one(recipesInSisub, {
		fields: [recipeStepOutputInSisub.recipeId],
		references: [recipesInSisub.id]
	}),
	recipeStepInSisub: one(recipeStepInSisub, {
		fields: [recipeStepOutputInSisub.recipeStepId],
		references: [recipeStepInSisub.id]
	}),
	recipeStepInputInSisubs: many(recipeStepInputInSisub),
}));

export const recipeStepInputInSisubRelations = relations(recipeStepInputInSisub, ({one}) => ({
	recipeIngredientsInSisub: one(recipeIngredientsInSisub, {
		fields: [recipeStepInputInSisub.recipeIngredientId],
		references: [recipeIngredientsInSisub.id]
	}),
	recipeStepInSisub: one(recipeStepInSisub, {
		fields: [recipeStepInputInSisub.recipeStepId],
		references: [recipeStepInSisub.id]
	}),
	recipeStepOutputInSisub: one(recipeStepOutputInSisub, {
		fields: [recipeStepInputInSisub.sourceOutputId],
		references: [recipeStepOutputInSisub.id]
	}),
}));

export const recipeStepUtensilInSisubRelations = relations(recipeStepUtensilInSisub, ({one}) => ({
	recipeStepInSisub: one(recipeStepInSisub, {
		fields: [recipeStepUtensilInSisub.recipeStepId],
		references: [recipeStepInSisub.id]
	}),
	utensilInSisub: one(utensilInSisub, {
		fields: [recipeStepUtensilInSisub.utensilId],
		references: [utensilInSisub.id]
	}),
}));