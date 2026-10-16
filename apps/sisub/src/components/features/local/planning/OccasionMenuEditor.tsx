import type { EditScope, SetSnackClassification } from "@iefa/sisub-domain"
import { getBrasiliaToday } from "@iefa/sisub-domain/civil-date"
import { MAX_EVENT_MEALS } from "@iefa/sisub-domain/schemas"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { type LinkOptions, useNavigate } from "@tanstack/react-router"
import { Loader2 } from "lucide-react"
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react"
import { AddModelMealDialog } from "@/components/features/local/planning/AddModelMealDialog"
import { ApplyEventDialog } from "@/components/features/local/planning/ApplyEventDialog"
import { EventMealCard } from "@/components/features/local/planning/EventMealCard"
import { EventMealDialog } from "@/components/features/local/planning/EventMealDialog"
import type { BoardArrangement, BoardItem } from "@/components/features/local/planning/MealGroupBoard"
import type { MealTypeInfo } from "@/components/features/local/planning/MealTypeSection"
import { MenuHeadcountDialog } from "@/components/features/local/planning/MenuHeadcountDialog"
import { MenuSelectionBar } from "@/components/features/local/planning/MenuSelectionBar"
import {
	ForkNotice,
	GlobalEventMealsAlert,
	OccasionContentSummary,
	OccasionFillToolbar,
	OccasionHeaderActions,
	OccasionMealsEmpty,
	OccasionMetadataCard,
	OccasionNotFound,
	OccasionSlotAlerts,
} from "@/components/features/local/planning/OccasionMenuEditorParts"
import {
	buildInitialOccasionContent,
	buildOccasionUpdates,
	buildSlotOptions,
	collectRecipeIdsInMeal,
	deriveOccasionEditorFlags,
	describeMealOrigin,
	getKitchenId,
	getLockedSlotName,
	getMealDialogView,
	getPrintTooltipLabel,
	hasReadySlots,
	isForkOnSave,
	isTemplateOutOfContext,
	type MealDialogState,
	resolveSlotName,
	saveBlockReason,
} from "@/components/features/local/planning/occasion-menu-editor"
import { RecipeSelector } from "@/components/features/local/planning/RecipeSelector"
import { RecipeVersionBadge } from "@/components/features/local/planning/RecipeVersionUpdateDialog"
import { SnackStandardPanel } from "@/components/features/local/planning/SnackStandardPanel"
import type { AutoSaveState } from "@/components/features/shared/AutoSaveStatus"
import { RecipeLinkScope } from "@/components/features/shared/RecipeLink"
import { UnsavedChangesGuard } from "@/components/features/shared/UnsavedChangesGuard"
import { PageHeader } from "@/components/layout/PageHeader"
import { toast } from "@/components/ui/toast"
import { useTemplateRecipeVersions } from "@/hooks/business/useTemplateRecipeVersions"
import { mealTypesQueryOptions } from "@/hooks/data/useMealTypes"
import { useRecipes } from "@/hooks/data/useRecipes"
import { useSetSnackClassification, useSnackMealType } from "@/hooks/data/useSnackRequests"
import { useDuplicateTemplateAsVariant, useTemplateFolders } from "@/hooks/data/useTemplateFolders"
import { useMenuTemplates, useSaveTemplateEdit, useTemplate } from "@/hooks/data/useTemplates"
import {
	applyHeadcountToEventMeals,
	countEventMealHeadcountTargets,
	countItemsLeavingComposition,
	type EventMealDraft,
	eventItemsPayload,
	eventMealsPayload,
	mealsFromModel,
	moveEventMeal,
	newEventMeal,
	removeEventMeal,
	setEventMealBase,
	upsertEventMeal,
} from "@/lib/event-meals"
import { applyRecipeSelection, type HeadcountPlan, menuItemKey, removeMenuItems, replaceMenuRecipe, setItemHeadcount } from "@/lib/menu-fill"
import {
	EMPTY_SNACK_STANDARD_DRAFT,
	OCCASION_DAY,
	OCCASION_MENU_COPY,
	type OccasionMenuType,
	proportionModeFor,
	type SnackStandardDraft,
	snackClassificationFromDraft,
	snackDraftIssues,
} from "@/lib/occasion-menu"
import { queryKeys } from "@/lib/query-keys"
import { replaceRecipeVersions } from "@/lib/recipe-versions"
import type { TemplateItemDraft } from "@/types/domain/planning"

/**
 * Editor de evento ou apoio — na cozinha e no catálogo global.
 *
 * Não há estrutura de dias/semana. Evento e apoio têm refeições próprias (zero ou mais): nome,
 * horário no calendário e composição (entradas, volantes…; sanduíche, bebida…) definidos
 * neles, sem relação com os tipos de refeição da cozinha — regras em `@/lib/event-meals`. A
 * refeição tem efetivo e cada preparação diz a proporção dele ou o pax direto, como no cardápio
 * semanal (`resolveItemDemand`). Cada grupo pode dizer quantas preparações espera; fora disso é
 * aviso, nunca trava.
 *
 * No APOIO o efetivo da refeição é o número de KITS e a proporção é lida como porções por kit.
 * O apoio simples é uma refeição "Kit" sem grupos — o editor a cria quando o apoio abre sem
 * refeição nenhuma — e mostra as preparações em lista. O apoio acrescenta as ocorrências
 * mensais, que multiplicam o custeio no anexo quantitativo.
 *
 * Um apoio pode ser classificado como padrão de lanche (Módulo 7): as ocorrências passam a ser
 * kits por mês (o anexo quantitativo multiplica igual), os kits de cada pedido vêm do pedido (sem
 * efetivo nem pax no editor), e as refeições ficam no tipo de refeição de sistema "Lanches de
 * Bordo/Apoio".
 *
 * Global é relativo, local é absoluto: no catálogo global o editor não mostra nem envia pax,
 * efetivo, kits nem ocorrências — quem os define é a cozinha que adaptar ou aplicar o modelo.
 *
 * O contexto da edição é o da ROTA, nunca inferido do template: na cozinha, um modelo global
 * aberto vira cópia local ao salvar; no catálogo global a edição é in-place.
 */

type OccasionEditorState = {
	name: string
	description: string
	occurrences: string
	items: TemplateItemDraft[]
	initialized: boolean
	selectorOpen: boolean
	selectedMealTypeId: string | null
	/** Grupo em que o seletor põe as preparações novas (`null` = sem grupo, na refeição sem colunas). */
	selectedGroup: string | null
	snack: SnackStandardDraft
	/** Refeições próprias do evento ou do apoio. */
	eventMeals: EventMealDraft[]
}

type OccasionEditorAction =
	| { type: "SET_NAME"; value: string }
	| { type: "SET_DESCRIPTION"; value: string }
	| { type: "SET_OCCURRENCES"; value: string }
	| { type: "SET_ITEMS"; value: TemplateItemDraft[] }
	| { type: "SET_INITIALIZED" }
	| { type: "SET_SELECTOR_OPEN"; value: boolean }
	| { type: "SET_SELECTED_MEAL_TYPE_ID"; value: string | null; group?: string | null }
	| { type: "SET_SNACK"; value: SnackStandardDraft }
	| { type: "SET_EVENT_CONTENT"; meals: EventMealDraft[]; items: TemplateItemDraft[] }

const initialOccasionEditorState: OccasionEditorState = {
	name: "",
	description: "",
	occurrences: "",
	items: [],
	initialized: false,
	selectorOpen: false,
	selectedMealTypeId: null,
	selectedGroup: null,
	snack: EMPTY_SNACK_STANDARD_DRAFT,
	eventMeals: [],
}

function occasionEditorReducer(state: OccasionEditorState, action: OccasionEditorAction): OccasionEditorState {
	switch (action.type) {
		case "SET_NAME":
			return { ...state, name: action.value }
		case "SET_DESCRIPTION":
			return { ...state, description: action.value }
		case "SET_OCCURRENCES":
			return { ...state, occurrences: action.value }
		case "SET_ITEMS":
			return { ...state, items: action.value }
		case "SET_INITIALIZED":
			return { ...state, initialized: true }
		case "SET_SELECTOR_OPEN":
			return { ...state, selectorOpen: action.value }
		case "SET_SELECTED_MEAL_TYPE_ID":
			return { ...state, selectedMealTypeId: action.value, selectedGroup: action.group ?? null }
		case "SET_SNACK":
			return { ...state, snack: action.value }
		// Refeições e itens mudam juntos: tirar a refeição leva os itens dela, e mudar a
		// composição tira de grupo os que estavam num grupo removido.
		case "SET_EVENT_CONTENT":
			return { ...state, eventMeals: action.meals, items: action.items }
		default:
			return state
	}
}

interface OccasionMenuEditorProps {
	templateId: string
	templateType: OccasionMenuType
	editContext: EditScope
	/** Listagem de origem — destino do voltar e do cancelar. */
	listLink: LinkOptions
	/** Editor de outro template no mesmo contexto — usado quando o salvamento cria a cópia local. */
	editorLink: (templateId: string) => LinkOptions
	/** Folha impressa (PDF/DOCX) deste template no mesmo contexto. */
	printLink: (templateId: string) => LinkOptions
}

export function OccasionMenuEditor({ templateId, templateType, editContext, listLink, editorLink, printLink }: OccasionMenuEditorProps) {
	const navigate = useNavigate()
	const copy = OCCASION_MENU_COPY[templateType]
	const isSupportMenu = templateType === "apoio"
	const proportionMode = proportionModeFor(templateType)
	const kitchenId = getKitchenId(editContext)

	const { data: template, isLoading: templateLoading } = useTemplate(templateId)
	// No catálogo global só os tipos de refeição genéricos (kitchen_id = null). As query options
	// desligam a busca sem cozinha, pensando na tela de cozinha — aqui o nulo é intencional.
	const { data: mealTypes, isFetched: mealTypesFetched } = useQuery({ ...mealTypesQueryOptions(kitchenId), enabled: true })
	// Catálogo global + as preparações DESTA cozinha. Sem o escopo, a listagem volta só com
	// as globais e a cozinha não enxergava as próprias preparações no cardápio.
	const { data: allRecipes } = useRecipes({ kitchen_id: kitchenId })

	// Template global aberto numa cozinha: salvar vai forkar (o porquê está em `isForkOnSave`).
	const willFork = isForkOnSave(editContext, template)
	// Template fora do contexto da rota: seria recusado no salvamento (`isTemplateOutOfContext`).
	const outOfContext = isTemplateOutOfContext(template, templateType, editContext)

	// Mesmo escopo: auto-save e "Salvar" gravam em fila, na ordem em que foram disparados.
	const { mutate: saveTemplate, isPending: isSaving } = useSaveTemplateEdit({ scopeId: `template-save:${templateId}` })
	const { mutate: autoSave } = useSaveTemplateEdit({ silent: true, scopeId: `template-save:${templateId}` })
	const { mutate: setSnackClassification } = useSetSnackClassification()
	const queryClient = useQueryClient()

	const [editorState, dispatch] = useReducer(occasionEditorReducer, initialOccasionEditorState)
	const { name, description, occurrences, items, initialized, selectorOpen, selectedMealTypeId, selectedGroup, snack, eventMeals } = editorState
	// Quantidade absoluta, padrão de lanche, modelo global… — as regras estão em `deriveOccasionEditorFlags`.
	const {
		isSnackStandard,
		isKitchenTemplate,
		allowAbsolutes,
		allowMealAbsolutes,
		isGlobalEvent,
		canAddModelMeal,
		showOccurrences,
		canApplyToCalendar,
		isSuggestedSlot,
		headcountScope,
	} = deriveOccasionEditorFlags({ editContext, templateType, isSupportMenu, snackEnabled: snack.enabled, willFork, kitchenId })
	// Tipo de refeição de sistema dos padrões de lanche — `fetchMealTypes` não o devolve. Buscado
	// em todo apoio: um que DEIXOU de ser padrão ainda pode ter refeição nele.
	const { data: snackMealType, error: snackMealTypeError, isFetched: snackMealTypeFetched } = useSnackMealType(isSupportMenu)
	// Data civil de Brasília: o mesmo "hoje" que o painel usa para cobrar a revisão trimestral.
	const snackIssues = useMemo(() => snackDraftIssues(snack, getBrasiliaToday()), [snack])
	const hasSnackIssues = Object.keys(snackIssues).length > 0
	const snackPayload = useMemo(
		() => (isSupportMenu ? snackClassificationFromDraft(snack, { isKitchenTemplate }) : null),
		[isSupportMenu, snack, isKitchenTemplate]
	)
	const snackSignature = JSON.stringify(snackPayload)
	// Última classificação gravada — só chama `setSnackClassification` quando ela mudou.
	const savedSnackSignatureRef = useRef<string | null>(null)
	const { recipeById, outdated, outdatedById } = useTemplateRecipeVersions(template?.items, allRecipes, items)

	const [saveStatus, setSaveStatus] = useState<AutoSaveState>("idle")
	// Conteúdo recém-carregado já conta como gravado. Sem esta marca, `savedSignatureRef`
	// fica nulo e qualquer saída pareceria ter alteração pendente.
	const loadedSignatureRef = useRef(false)
	const [selectionMode, setSelectionMode] = useState(false)
	const [selectedKeys, setSelectedKeys] = useState<ReadonlySet<string>>(new Set())
	const [highlightedKey, setHighlightedKey] = useState<string | null>(null)
	const [headcountOpen, setHeadcountOpen] = useState(false)
	const [applyOpen, setApplyOpen] = useState(false)
	const [modelMealOpen, setModelMealOpen] = useState(false)
	/** Refeição do evento no diálogo: nova (ainda fora do rascunho) ou existente. */
	// `open` à parte do conteúdo: fechar mantém refeição e modo até a animação terminar — sem
	// isso o título trocava para "Editar refeição" enquanto o diálogo de uma NOVA saía da tela.
	const [mealDialog, setMealDialog] = useState<MealDialogState>(null)
	const prevInitializedRef = useRef(false)
	const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
	// Conteúdo da última gravação bem-sucedida. O efeito de auto-save também reage à troca
	// de ROTA — salvar um template global na cozinha cria o fork e muda `templateId`/`willFork`
	// —, e sem esta comparação ele regravaria, 1,5s depois, o fork recém-criado inteiro.
	const savedSignatureRef = useRef<string | null>(null)
	const contentSignature = JSON.stringify({ name: name.trim(), description: description.trim(), occurrences, items, snack: snackSignature, eventMeals })
	// Só o conteúdo que o servidor usa no kcal por kit (preparações + porções).
	const itemsSignature = JSON.stringify(items)
	const savedItemsSignatureRef = useRef<string | null>(null)
	// Lida pelo guarda de saída no momento da navegação, não na renderização.
	const contentSignatureRef = useRef(contentSignature)
	contentSignatureRef.current = contentSignature

	const updates = useMemo(
		() => buildOccasionUpdates({ name, description, occurrences, isSupportMenu, allowAbsolutes }),
		[name, description, occurrences, isSupportMenu, allowAbsolutes]
	)

	const { mutate: duplicateVariant, isPending: isDuplicating } = useDuplicateTemplateAsVariant()
	// Procedência das refeições: o nome e a pasta do modelo de onde vieram.
	const { data: scopeTemplates } = useMenuTemplates(kitchenId)
	const { data: folders } = useTemplateFolders(kitchenId !== null ? templateType : null)
	const originLabel = (sourceTemplateId: string | null | undefined) => describeMealOrigin(scopeTemplates, folders, sourceTemplateId)

	const payloadItems = useMemo(() => eventItemsPayload(items, eventMeals, { allowItemHeadcount: allowMealAbsolutes }), [items, eventMeals, allowMealAbsolutes])
	const payloadEventMeals = useMemo(() => eventMealsPayload(eventMeals, { allowBase: allowMealAbsolutes }), [eventMeals, allowMealAbsolutes])
	// Refeição sem horário (o apoio abriu sem tipo de refeição nenhum para o "Kit") não tem como
	// ser gravada: o salvamento a cobra em vez de o servidor recusar o cardápio inteiro.
	const mealWithoutSlot = eventMeals.find((m) => m.meal_type_id === "")

	// O apoio sem refeição abre com o "Kit": a carga espera pelos horários (`hasReadySlots`).
	const slotsReady = hasReadySlots(isSupportMenu, mealTypesFetched, snackMealTypeFetched)
	useEffect(() => {
		if (!template || initialized || !slotsReady) return
		const initial = buildInitialOccasionContent(template, { isSupportMenu, templateType, mealTypes, snackMealType })
		dispatch({ type: "SET_NAME", value: initial.name })
		dispatch({ type: "SET_DESCRIPTION", value: initial.description })
		dispatch({ type: "SET_OCCURRENCES", value: initial.occurrences })
		dispatch({ type: "SET_EVENT_CONTENT", meals: initial.meals, items: initial.items })
		dispatch({ type: "SET_SNACK", value: initial.snack })
		dispatch({ type: "SET_INITIALIZED" })
	}, [template, initialized, slotsReady, isSupportMenu, templateType, mealTypes, snackMealType])

	useEffect(() => {
		if (!initialized || loadedSignatureRef.current) return
		loadedSignatureRef.current = true
		savedSignatureRef.current = contentSignature
		savedSnackSignatureRef.current = snackSignature
		savedItemsSignatureRef.current = itemsSignature
	}, [initialized, contentSignature, snackSignature, itemsSignature])

	/**
	 * Depois que o conteúdo foi gravado (e o template existe com o id definitivo — o fork cria
	 * outro), grava a classificação de lanche se ela mudou. A falha é avisada pelo hook e deixa o
	 * editor com alteração pendente, para o guarda de saída e o próximo salvamento cobrarem.
	 * `onDone` roda quando o gravado está completo (conteúdo + classificação) — não roda se a
	 * classificação falhar: a folha sairia com a classificação velha.
	 */
	const persistSnackClassification = useCallback(
		(
			saved: {
				id: string
				contentSignature: string
				snackSignature: string
				snackPayload: SetSnackClassification["classification"]
				itemsSignature: string
			},
			onDone?: () => void
		) => {
			savedItemsSignatureRef.current = saved.itemsSignature
			// Id diferente = o salvamento caiu numa CÓPIA da cozinha (fork novo OU fork que já
			// existia). Escrever a classificação do template aberto ali sobrescreveria a do
			// padrão da cozinha — apagando "disponível para pedido" e a data de revisão dele —,
			// e num fork novo carimbaria a revisão da origem, que `forkTemplate` limpa de
			// propósito. A cópia se classifica na tela dela.
			const idChanged = saved.id !== templateId
			if (idChanged) {
				queryClient.invalidateQueries({ queryKey: queryKeys.snackRequests.standardEnergy(saved.id) })
				if (isSupportMenu && saved.snackSignature !== savedSnackSignatureRef.current) {
					toast.info("A cópia da cozinha mantém a própria classificação de padrão de lanche — ajuste-a na cópia, se precisar.")
				}
				onDone?.()
				return
			}
			if (!isSupportMenu || saved.snackSignature === savedSnackSignatureRef.current) {
				queryClient.invalidateQueries({ queryKey: queryKeys.snackRequests.standardEnergy(saved.id) })
				onDone?.()
				return
			}
			setSnackClassification(
				{ templateId: saved.id, classification: saved.snackPayload },
				{
					onSuccess: () => {
						savedSnackSignatureRef.current = saved.snackSignature
						onDone?.()
					},
					// Marca o editor como pendente (assinatura que nunca casa) para o guarda de saída
					// e o próximo salvamento cobrarem a classificação que não foi gravada.
					onError: () => {
						if (savedSignatureRef.current === saved.contentSignature) savedSignatureRef.current = ""
					},
				}
			)
		},
		[templateId, isSupportMenu, queryClient, setSnackClassification]
	)

	useEffect(() => {
		if (!initialized) return
		if (!prevInitializedRef.current) {
			prevInitializedRef.current = true
			return
		}
		if (!name.trim()) return
		// Auto-save NÃO forka: criar uma cópia local no primeiro caractere digitado seria
		// uma bifurcação silenciosa. Num template global a cópia sai só do salvamento
		// explícito, depois do aviso.
		if (willFork || outOfContext) return
		// Nada mudou desde a última gravação (o efeito re-executou por troca de rota, não por
		// edição do usuário) — não há o que salvar.
		if (contentSignature === savedSignatureRef.current) return
		// Classificação inválida não entra no auto-save: o painel mostra o erro e o salvamento
		// explícito cobra. Gravar aqui descartaria o valor digitado em silêncio. Idem refeição sem horário.
		if (hasSnackIssues || mealWithoutSlot) return
		setSaveStatus("idle")
		if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
		autoSaveTimerRef.current = setTimeout(() => {
			setSaveStatus("saving")
			autoSave(
				{ id: templateId, context: editContext, updates, items: payloadItems, eventMeals: payloadEventMeals },
				{
					onSuccess: (result) => {
						savedSignatureRef.current = contentSignature
						setSaveStatus("saved")
						persistSnackClassification({ id: result?.template?.id ?? templateId, contentSignature, snackSignature, snackPayload, itemsSignature })
					},
					onError: () => setSaveStatus("error"),
				}
			)
		}, 1500)
		return () => {
			if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
		}
	}, [
		name,
		initialized,
		willFork,
		outOfContext,
		editContext,
		autoSave,
		templateId,
		contentSignature,
		updates,
		payloadItems,
		payloadEventMeals,
		persistSnackClassification,
		hasSnackIssues,
		mealWithoutSlot,
		snackSignature,
		snackPayload,
		itemsSignature,
	])

	// ── Helpers ────────────────────────────────────────────────────────────────

	useEffect(() => {
		if (!highlightedKey) return
		const frame = requestAnimationFrame(() => {
			document.getElementById(highlightedKey)?.scrollIntoView({ block: "center", behavior: "smooth" })
		})
		const timer = setTimeout(() => setHighlightedKey(null), 2500)
		return () => {
			cancelAnimationFrame(frame)
			clearTimeout(timer)
		}
	}, [highlightedKey])

	/** Altera campos de UMA preparação de uma refeição (pax, porcentagem). */
	const patchItem = (mealTypeId: string, recipeId: string, patch: Partial<TemplateItemDraft>) => {
		dispatch({
			type: "SET_ITEMS",
			value: items.map((i) => (i.meal_type_id === mealTypeId && i.recipe_id === recipeId ? { ...i, ...patch } : i)),
		})
	}

	/** Atualiza o headcount de uma preparação específica dentro de um grupo. */
	const handleItemHeadcountChange = (mealTypeId: string, recipeId: string, value: number | null) =>
		patchItem(mealTypeId, recipeId, { headcount_override: value })

	const handleOpenSelector = (mealTypeId: string, group: string | null = null) => {
		dispatch({ type: "SET_SELECTED_MEAL_TYPE_ID", value: mealTypeId, group })
		dispatch({ type: "SET_SELECTOR_OPEN", value: true })
	}

	const handleSelectRecipes = (recipeIds: string[]) => {
		if (!selectedMealTypeId) return
		// Mesma regra do cardápio semanal: o seletor define o conteúdo da refeição, e a
		// preparação nova entra no fim do grupo escolhido (ou da lista, na refeição sem grupos).
		const next = applyRecipeSelection(items, { day: OCCASION_DAY, mealTypeId: selectedMealTypeId, group: selectedGroup }, recipeIds, [], (draft) => draft)
		dispatch({ type: "SET_ITEMS", value: next })
		dispatch({ type: "SET_SELECTED_MEAL_TYPE_ID", value: null })
	}

	const handleUpdateVersions = (replacements: Map<string, string>) => {
		dispatch({ type: "SET_ITEMS", value: replaceRecipeVersions(items, replacements) })
	}

	const toggleSelection = (key: string, checked: boolean) => {
		setSelectedKeys((prev) => {
			const next = new Set(prev)
			if (checked) next.add(key)
			else next.delete(key)
			return next
		})
	}

	/** Soma à seleção, sem desfazer o que já estava marcado. */
	const addToSelection = (keys: Iterable<string>) => setSelectedKeys((prev) => new Set([...prev, ...keys]))

	const clearSelection = () => setSelectedKeys(new Set())

	const exitSelectionMode = () => {
		setSelectionMode(false)
		clearSelection()
	}

	/**
	 * O quantitativo vai para o EFETIVO de cada refeição (kits, no apoio), como no cardápio
	 * semanal — a proporção das preparações incide sobre ele.
	 */
	const handleApplyHeadcountPlan = (plan: HeadcountPlan, overwrite: boolean) => {
		dispatch({ type: "SET_EVENT_CONTENT", meals: applyHeadcountToEventMeals(eventMeals, plan, { overwrite }), items })
	}

	/** Proporção de uma preparação: % do efetivo da refeição, ou porções por kit × 100 no apoio. */
	const handleItemProportionChange = (mealId: string, recipeId: string, value: number | null) => patchItem(mealId, recipeId, { recommended_proportion: value })

	const handleBulkHeadcount = (headcount: number | null) => {
		dispatch({ type: "SET_ITEMS", value: setItemHeadcount(items, selectedKeys, headcount) })
	}

	const handleBulkRemove = () => {
		dispatch({ type: "SET_ITEMS", value: removeMenuItems(items, selectedKeys) })
		clearSelection()
	}

	const handleBulkReplace = (recipeId: string) => {
		dispatch({ type: "SET_ITEMS", value: replaceMenuRecipe(items, selectedKeys, recipeId) })
		clearSelection()
	}

	const handleRemoveRecipe = (mealTypeId: string, recipeId: string) => {
		dispatch({ type: "SET_ITEMS", value: items.filter((i) => !(i.meal_type_id === mealTypeId && i.recipe_id === recipeId)) })
	}

	// ── Refeições do evento ou do apoio ────────────────────────────────────────

	/** Preparações de uma refeição no formato do quadro de grupos. */
	const getEventMealBoardItems = (mealId: string): BoardItem[] =>
		items.flatMap((item) => {
			if (item.meal_type_id !== mealId) return []
			const recipe = recipeById.get(item.recipe_id)
			if (!recipe) return []
			return [
				{
					id: item.recipe_id,
					title: recipe.name ?? item.recipe_id,
					recipeId: item.recipe_id,
					subtitle: recipe.rational_id ?? null,
					badge: <RecipeVersionBadge outdated={outdatedById.get(item.recipe_id)} />,
					anchorId: menuItemKey(item),
					highlighted: highlightedKey === menuItemKey(item),
					headcount: item.headcount_override ?? null,
					group: item.item_group ?? null,
					sortOrder: item.sort_order ?? 0,
					proportion: item.recommended_proportion ?? null,
				},
			]
		})

	/** Rearranjo (arrastar entre grupos ou reordenar) de uma refeição do evento. */
	const handleEventArrange = (mealId: string, arrangement: BoardArrangement) => {
		const byRecipe = new Map(arrangement.map((a) => [a.id, a]))
		dispatch({
			type: "SET_ITEMS",
			value: items.map((i) => {
				if (i.meal_type_id !== mealId) return i
				const next = byRecipe.get(i.recipe_id)
				return next ? { ...i, item_group: next.group, sort_order: next.sortOrder } : i
			}),
		})
	}

	const handleSubmitEventMeal = (meal: EventMealDraft) => {
		dispatch({ type: "SET_EVENT_CONTENT", ...upsertEventMeal(eventMeals, items, meal) })
	}

	const handleRemoveEventMeal = (meal: EventMealDraft) => {
		const count = items.filter((i) => i.meal_type_id === meal.id).length
		// Tirar a refeição leva as preparações dela — com preparação dentro, pergunta antes.
		if (
			count > 0 &&
			!window.confirm(`Remover "${meal.name}" d${copy.article} ${copy.noun}? ${count} ${count === 1 ? "preparação sai" : "preparações saem"} junto.`)
		)
			return
		dispatch({ type: "SET_EVENT_CONTENT", ...removeEventMeal(eventMeals, items, meal.id) })
		setSelectedKeys((prev) => new Set([...prev].filter((key) => !items.some((i) => i.meal_type_id === meal.id && menuItemKey(i) === key))))
	}

	const handleAddFromModel = (model: Parameters<typeof mealsFromModel>[0]) => {
		const added = mealsFromModel(model, "event")
		if (added.meals.length === 0) {
			toast.info("Esse modelo ainda não tem refeição.")
			return
		}
		if (eventMeals.length + added.meals.length > MAX_EVENT_MEALS) {
			toast.error(`Um evento tem no máximo ${MAX_EVENT_MEALS} refeições.`)
			return
		}
		dispatch({ type: "SET_EVENT_CONTENT", meals: [...eventMeals, ...added.meals], items: [...items, ...added.items] })
		toast.success(`${added.meals.length === 1 ? "Refeição acrescentada" : `${added.meals.length} refeições acrescentadas`}. Informe o efetivo desta cozinha.`)
	}

	/** `afterSave`: o que fazer com o id gravado (o do fork, se houve) — no lugar de trocar a rota para o editor dele. */
	const handleSave = (afterSave?: (savedId: string) => void) => {
		const blockReason = saveBlockReason({ name, hasSnackIssues, mealWithoutSlot, copy })
		if (blockReason) {
			toast.error(blockReason)
			return
		}
		if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
		// O mesmo indicador do autosave: é também o "Tentar de novo" dele.
		setSaveStatus("saving")
		saveTemplate(
			{ id: templateId, context: editContext, updates, items: payloadItems, eventMeals: payloadEventMeals },
			{
				// Salvar mantém o editor aberto — a tela já auto-salva em rascunho local, então
				// voltar para a listagem no salvamento explícito era o único ponto em que o
				// usuário perdia o lugar. O ÚNICO deslocamento é o fork: o save de um template
				// global na cozinha cria a cópia local (id novo) e a URL precisa passar a apontar
				// para ela, senão a tela continuaria editando — e forkando de novo — o global.
				onSuccess: (result) => {
					setSaveStatus("saved")
					savedSignatureRef.current = contentSignature
					const savedId = result?.template?.id
					persistSnackClassification(
						{ id: savedId ?? templateId, contentSignature, snackSignature, snackPayload, itemsSignature },
						afterSave ? () => afterSave(savedId ?? templateId) : undefined
					)
					if (!afterSave && savedId && savedId !== templateId) {
						navigate({ ...editorLink(savedId), replace: true })
					}
				},
				onError: () => setSaveStatus("error"),
			}
		)
	}

	// ── Derived state ──────────────────────────────────────────────────────────

	/** Refeições do cardápio — é por elas que o localizar, a seleção e o quantitativo agrupam. */
	const hasItemsUnder = (mealId: string) => items.some((i) => i.meal_type_id === mealId)
	const sectionMealTypes: MealTypeInfo[] = eventMeals.map((m) => ({ id: m.id, name: m.name }))
	/** Horários que a refeição pode escolher (os da cozinha e, se preciso, o de sistema dos lanches). */
	const slotOptions: MealTypeInfo[] = buildSlotOptions(mealTypes, snackMealType, eventMeals)
	const slotName = (mealTypeId: string) => resolveSlotName(mealTypes, snackMealType, mealTypeId)

	const totalRecipes = items.length
	const groupsWithContent = sectionMealTypes.filter((mt) => hasItemsUnder(mt.id)).length

	const currentSelectorRecipeIds = collectRecipeIdsInMeal(items, selectedMealTypeId)

	// ── Render ─────────────────────────────────────────────────────────────────

	if (templateLoading) {
		return (
			<div className="flex justify-center p-12">
				<Loader2 className="size-8 animate-spin text-muted-foreground" />
			</div>
		)
	}

	if (!template || outOfContext) {
		return <OccasionNotFound copy={copy} onBack={() => navigate(listLink)} />
	}

	const namePlaceholder = copy.namePlaceholder.split(",")[0]
	const mealDialogView = getMealDialogView(mealDialog)
	// Mesmo critério do "Duplicar como variante": o que está na tela ainda não foi gravado.
	const hasPendingChanges = contentSignature !== savedSignatureRef.current
	/**
	 * Com edição pendente, salva e só então abre a folha. No fork, a rota do editor passa antes para
	 * a cópia (como no Salvar): voltar da folha reabriria o modelo global, e salvar ali gravaria o
	 * conteúdo do global por cima da cópia.
	 */
	const printAfterSave = (savedId: string) => {
		if (savedId === templateId) return void navigate(printLink(savedId))
		void navigate({ ...editorLink(savedId), replace: true }).then(() => navigate(printLink(savedId)))
	}
	// Padrão de lanche: a refeição nova nasce no horário de sistema (o diálogo trava o horário e não oferece outro).
	const openNewMeal = () => setMealDialog({ meal: newEventMeal("", isSnackStandard ? (snackMealType?.id ?? "") : "", templateType), isNew: true, open: true })
	/** Ligar o padrão de lanche leva as refeições para o horário de sistema, como o servidor fará. */
	const handleSnackChange = (value: SnackStandardDraft) => {
		dispatch({ type: "SET_SNACK", value })
		if (value.enabled && !snack.enabled && snackMealType && eventMeals.some((m) => m.meal_type_id !== snackMealType.id)) {
			dispatch({ type: "SET_EVENT_CONTENT", meals: eventMeals.map((m) => ({ ...m, meal_type_id: snackMealType.id })), items })
		}
	}

	return (
		<div className="space-y-6">
			<PageHeader title={`Editar ${copy.singular}`} onBack={() => navigate(listLink)}>
				<OccasionHeaderActions
					saveStatus={saveStatus}
					onRetry={() => handleSave()}
					outdated={outdated}
					onApplyVersions={handleUpdateVersions}
					printLinkOptions={printLink(templateId)}
					onPrintClick={(e) => {
						if (!hasPendingChanges) return
						e.preventDefault()
						handleSave(printAfterSave)
					}}
					printTooltip={getPrintTooltipLabel(hasPendingChanges, willFork, copy)}
					canApplyToCalendar={canApplyToCalendar}
					totalRecipes={totalRecipes}
					onOpenApply={() => setApplyOpen(true)}
					isGlobalScope={editContext.scope === "global"}
					isDuplicating={isDuplicating}
					hasPendingChanges={contentSignature !== savedSignatureRef.current}
					onDuplicate={() => duplicateVariant(templateId, { onSuccess: (created) => navigate(editorLink(created.id)) })}
					onCancel={() => navigate(listLink)}
					isSaving={isSaving}
					name={name}
					onSave={() => handleSave()}
				/>
			</PageHeader>

			{willFork && <ForkNotice copy={copy} />}

			<div className="space-y-6">
				{/* Metadata */}
				<OccasionMetadataCard
					name={name}
					description={description}
					occurrences={occurrences}
					namePlaceholder={namePlaceholder}
					showOccurrences={showOccurrences}
					isSnackStandard={isSnackStandard}
					onNameChange={(value) => dispatch({ type: "SET_NAME", value })}
					onDescriptionChange={(value) => dispatch({ type: "SET_DESCRIPTION", value })}
					onOccurrencesChange={(value) => dispatch({ type: "SET_OCCURRENCES", value })}
				/>

				{/* Sumário */}
				{isSupportMenu && (
					<SnackStandardPanel
						draft={snack}
						onChange={handleSnackChange}
						isKitchenTemplate={isKitchenTemplate}
						// O kcal é do template gravado. Global aberto na cozinha ainda não tem a cópia:
						// o número é o do molde até salvar.
						energyTemplateId={templateId}
						itemsDirty={itemsSignature !== savedItemsSignatureRef.current}
					/>
				)}

				<OccasionSlotAlerts isSnackStandard={isSnackStandard} snackMealTypeError={snackMealTypeError} mealWithoutSlot={mealWithoutSlot} />

				<OccasionContentSummary totalRecipes={totalRecipes} mealCount={sectionMealTypes.length} groupsWithContent={groupsWithContent} copy={copy} />

				{/* Preenchimento: localizar, quantitativo por refeição e seleção em massa */}
				<OccasionFillToolbar
					items={items}
					nameOf={(recipeId) => recipeById.get(recipeId)?.name}
					sectionMealTypes={sectionMealTypes}
					kitchenId={kitchenId}
					onGoTo={(match) => setHighlightedKey(match.key)}
					onReplaceAll={(keys, recipeId) => dispatch({ type: "SET_ITEMS", value: replaceMenuRecipe(items, keys, recipeId) })}
					onSelectMatches={(keys) => {
						setSelectionMode(true)
						addToSelection(keys)
					}}
					showHeadcount={allowMealAbsolutes}
					onOpenHeadcount={() => setHeadcountOpen(true)}
					selectionMode={selectionMode}
					onEnterSelection={() => setSelectionMode(true)}
					onExitSelection={exitSelectionMode}
					canAddModelMeal={canAddModelMeal}
					isGlobalEvent={isGlobalEvent}
					mealCount={eventMeals.length}
					onOpenModelMeal={() => setModelMealOpen(true)}
					onNewMeal={openNewMeal}
				/>
				<GlobalEventMealsAlert isGlobalEvent={isGlobalEvent} mealCount={eventMeals.length} />

				{/* Refeições do cardápio: cada uma com a própria composição */}
				{eventMeals.length > 0 ? (
					<RecipeLinkScope scope={editContext}>
						<div className="space-y-3">
							{eventMeals.map((meal, index) => {
								const boardItems = getEventMealBoardItems(meal.id)
								const keyOf = (recipeId: string) => menuItemKey({ day_of_week: OCCASION_DAY, meal_type_id: meal.id, recipe_id: recipeId })
								return (
									<EventMealCard
										key={meal.id}
										meal={meal}
										mealTypeName={slotName(meal.meal_type_id)}
										originLabel={kitchenId !== null ? originLabel(meal.source_template_id) : null}
										items={boardItems}
										isFirst={index === 0}
										isLast={index === eventMeals.length - 1}
										onEdit={() => setMealDialog({ meal, isNew: false, open: true })}
										onRemove={() => handleRemoveEventMeal(meal)}
										onMove={(delta) => dispatch({ type: "SET_EVENT_CONTENT", meals: moveEventMeal(eventMeals, meal.id, delta), items })}
										onAdd={(group) => handleOpenSelector(meal.id, group)}
										onArrange={(arrangement) => handleEventArrange(meal.id, arrangement)}
										onHeadcountChange={(recipeId, value) => handleItemHeadcountChange(meal.id, recipeId, value)}
										onProportionChange={(recipeId, value) => handleItemProportionChange(meal.id, recipeId, value)}
										onBaseHeadcountChange={(value) => dispatch({ type: "SET_EVENT_CONTENT", meals: setEventMealBase(eventMeals, meal.id, value), items })}
										onRemoveItem={(recipeId) => handleRemoveRecipe(meal.id, recipeId)}
										selectionMode={selectionMode}
										selectedIds={new Set(boardItems.map((b) => b.id).filter((recipeId) => selectedKeys.has(keyOf(recipeId))))}
										onSelectChange={(recipeId, checked) => toggleSelection(keyOf(recipeId), checked)}
										proportionMode={proportionMode}
										allowAbsolutes={allowMealAbsolutes}
									/>
								)
							})}
						</div>
					</RecipeLinkScope>
				) : (
					<OccasionMealsEmpty copy={copy} isSupportMenu={isSupportMenu} onNewMeal={openNewMeal} />
				)}
			</div>

			<EventMealDialog
				open={mealDialogView.open}
				onOpenChange={(open) => {
					if (!open) setMealDialog((current) => (current ? { ...current, open: false } : null))
				}}
				meal={mealDialogView.meal}
				isNew={mealDialogView.isNew}
				mealTypes={slotOptions}
				countLeaving={(mealId, groups) => countItemsLeavingComposition(items, mealId, groups)}
				onSubmit={handleSubmitEventMeal}
				templateType={templateType}
				allowBase={allowMealAbsolutes}
				// Padrão de lanche: o horário é o de sistema, fixado pelo servidor ao salvar.
				lockedSlotName={getLockedSlotName(isSnackStandard, snackMealType)}
				// No modelo global o horário é sugestão: a cozinha escolhe ao aplicar ou montar.
				isSuggestedSlot={isSuggestedSlot}
			/>

			<MenuHeadcountDialog
				open={headcountOpen}
				onOpenChange={setHeadcountOpen}
				mealTypes={sectionMealTypes}
				scope={headcountScope}
				countTargets={(plan, overwrite) => countEventMealHeadcountTargets(eventMeals, plan, { overwrite })}
				onApply={handleApplyHeadcountPlan}
			/>

			{selectionMode && selectedKeys.size > 0 && (
				<MenuSelectionBar
					count={selectedKeys.size}
					kitchenId={kitchenId}
					allowHeadcount={allowMealAbsolutes}
					onSetHeadcount={handleBulkHeadcount}
					onReplace={handleBulkReplace}
					onRemove={handleBulkRemove}
					onClear={clearSelection}
				/>
			)}

			<UnsavedChangesGuard isDirty={() => savedSignatureRef.current !== null && contentSignatureRef.current !== savedSignatureRef.current} />

			<RecipeSelector
				open={selectorOpen}
				onClose={() => {
					dispatch({ type: "SET_SELECTOR_OPEN", value: false })
					dispatch({ type: "SET_SELECTED_MEAL_TYPE_ID", value: null })
				}}
				kitchenId={kitchenId}
				selectedRecipeIds={currentSelectorRecipeIds}
				onSelect={handleSelectRecipes}
				multiSelect
			/>

			{canAddModelMeal && kitchenId !== null && (
				<AddModelMealDialog
					open={modelMealOpen}
					onOpenChange={setModelMealOpen}
					kitchenId={kitchenId}
					currentTemplateId={templateId}
					onPick={handleAddFromModel}
				/>
			)}

			{kitchenId !== null && (
				<ApplyEventDialog
					open={applyOpen}
					onClose={() => setApplyOpen(false)}
					templateId={templateId}
					templateName={name || copy.singular}
					templateType={templateType}
					kitchenId={kitchenId}
				/>
			)}
		</div>
	)
}
