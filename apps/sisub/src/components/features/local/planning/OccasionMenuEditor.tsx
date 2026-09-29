import type { EditScope, SetSnackClassification } from "@iefa/sisub-domain"
import { MAX_EVENT_MEALS } from "@iefa/sisub-domain/schemas"
import { brasiliaCivilDate } from "@iefa/sisub-domain/utils"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { type LinkOptions, useNavigate } from "@tanstack/react-router"
import { AlertTriangle, CalendarPlus, GitFork, ListChecks, Loader2, Plus, Save, Users } from "lucide-react"
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react"
import { ApplyEventDialog } from "@/components/features/local/planning/ApplyEventDialog"
import { EventMealCard } from "@/components/features/local/planning/EventMealCard"
import { EventMealDialog } from "@/components/features/local/planning/EventMealDialog"
import type { BoardArrangement, BoardItem } from "@/components/features/local/planning/MealGroupBoard"
import type { MealTypeInfo } from "@/components/features/local/planning/MealTypeSection"
import { MenuFindBar } from "@/components/features/local/planning/MenuFindBar"
import { MenuHeadcountDialog } from "@/components/features/local/planning/MenuHeadcountDialog"
import { MenuSelectionBar } from "@/components/features/local/planning/MenuSelectionBar"
import { RecipeSelector } from "@/components/features/local/planning/RecipeSelector"
import { RecipeVersionBadge, RecipeVersionUpdateButton } from "@/components/features/local/planning/RecipeVersionUpdateDialog"
import { SnackStandardPanel } from "@/components/features/local/planning/SnackStandardPanel"
import { type AutoSaveState, AutoSaveStatus } from "@/components/features/shared/AutoSaveStatus"
import { UnsavedChangesGuard } from "@/components/features/shared/UnsavedChangesGuard"
import { PageHeader } from "@/components/layout/PageHeader"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { toast } from "@/components/ui/toast"
import { useTemplateRecipeVersions } from "@/hooks/business/useTemplateRecipeVersions"
import { mealTypesQueryOptions } from "@/hooks/data/useMealTypes"
import { useRecipes } from "@/hooks/data/useRecipes"
import { useSetSnackClassification, useSnackMealType } from "@/hooks/data/useSnackRequests"
import { useSaveTemplateEdit, useTemplate } from "@/hooks/data/useTemplates"
import {
	applyHeadcountToEventMeals,
	countEventMealHeadcountTargets,
	countItemsLeavingComposition,
	type EventMealDraft,
	eventDraftFrom,
	eventItemsPayload,
	eventMealsPayload,
	moveEventMeal,
	newEventMeal,
	newSupportKitMeal,
	removeEventMeal,
	setEventMealBase,
	upsertEventMeal,
} from "@/lib/event-meals"
import { applyRecipeSelection, type HeadcountPlan, menuItemKey, removeMenuItems, replaceMenuRecipe, setItemHeadcount } from "@/lib/menu-fill"
import {
	EMPTY_SNACK_STANDARD_DRAFT,
	isSnackStandard as isSnackStandardTemplate,
	OCCASION_DAY,
	OCCASION_MENU_COPY,
	type OccasionMenuType,
	parseMonthlyOccurrences,
	proportionModeFor,
	SNACK_MEAL_TYPE_NAME,
	type SnackStandardDraft,
	snackClassificationFromDraft,
	snackDraftFromTemplate,
	snackDraftIssues,
	withLegacySnackPortions,
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
}

export function OccasionMenuEditor({ templateId, templateType, editContext, listLink, editorLink }: OccasionMenuEditorProps) {
	const navigate = useNavigate()
	const copy = OCCASION_MENU_COPY[templateType]
	const isSupportMenu = templateType === "apoio"
	const proportionMode = proportionModeFor(templateType)
	const kitchenId = editContext.scope === "kitchen" ? editContext.kitchenId : null

	const { data: template, isLoading: templateLoading } = useTemplate(templateId)
	// No catálogo global só os tipos de refeição genéricos (kitchen_id = null). As query options
	// desligam a busca sem cozinha, pensando na tela de cozinha — aqui o nulo é intencional.
	const { data: mealTypes, isFetched: mealTypesFetched } = useQuery({ ...mealTypesQueryOptions(kitchenId), enabled: true })
	// Catálogo global + as preparações DESTA cozinha. Sem o escopo, a listagem volta só com
	// as globais e a cozinha não enxergava as próprias preparações no cardápio.
	const { data: allRecipes } = useRecipes({ kitchen_id: kitchenId })

	// Template global aberto numa cozinha: salvar vai forkar. `menu_template` não é versionado,
	// então a edição in-place de um global a partir da cozinha sobrescreveria o plano da FAB
	// inteira sem histórico.
	const willFork = editContext.scope === "kitchen" && template != null && template.kitchen_id == null
	// A rota global só edita o catálogo; um template de cozinha aberto por ela seria recusado
	// no salvamento (TEMPLATE_SCOPE_MISMATCH) depois de o usuário já ter editado tudo.
	const outOfContext = template != null && (template.template_type !== templateType || (editContext.scope === "global" && template.kitchen_id != null))

	// Mesmo escopo: auto-save e "Salvar" gravam em fila, na ordem em que foram disparados.
	const { mutate: saveTemplate, isPending: isSaving } = useSaveTemplateEdit({ scopeId: `template-save:${templateId}` })
	const { mutate: autoSave } = useSaveTemplateEdit({ silent: true, scopeId: `template-save:${templateId}` })
	const { mutate: setSnackClassification } = useSetSnackClassification()
	const queryClient = useQueryClient()

	const [editorState, dispatch] = useReducer(occasionEditorReducer, initialOccasionEditorState)
	const { name, description, occurrences, items, initialized, selectorOpen, selectedMealTypeId, selectedGroup, snack, eventMeals } = editorState
	const isSnackStandard = isSupportMenu && snack.enabled
	// Tipo de refeição de sistema dos padrões de lanche — `fetchMealTypes` não o devolve. Buscado
	// em todo apoio: um que DEIXOU de ser padrão ainda pode ter refeição nele.
	const { data: snackMealType, error: snackMealTypeError, isFetched: snackMealTypeFetched } = useSnackMealType(isSupportMenu)
	// Na cozinha tudo termina local (edição in-place ou cópia); no catálogo global é só molde.
	const isKitchenTemplate = editContext.scope === "kitchen"
	// Quantidade ABSOLUTA (pax, efetivo, kits, ocorrências) é da cozinha: o modelo global só guarda
	// a relativa (proporção, preparações por grupo). No padrão de lanche os kits vêm do pedido, e o
	// pax seria lido como porções por kit — por isso ele também não mostra efetivo nem pax.
	const allowAbsolutes = isKitchenTemplate
	const allowMealAbsolutes = allowAbsolutes && !isSnackStandard
	// Data civil de Brasília: o mesmo "hoje" que o painel usa para cobrar a revisão trimestral.
	const snackIssues = useMemo(() => snackDraftIssues(snack, brasiliaCivilDate(new Date().toISOString())), [snack])
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
	/** Refeição do evento no diálogo: nova (ainda fora do rascunho) ou existente. */
	// `open` à parte do conteúdo: fechar mantém refeição e modo até a animação terminar — sem
	// isso o título trocava para "Editar refeição" enquanto o diálogo de uma NOVA saía da tela.
	const [mealDialog, setMealDialog] = useState<{ meal: EventMealDraft; isNew: boolean; open: boolean } | null>(null)
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
		() => ({
			name: name.trim(),
			description: description.trim() || null,
			// Só o apoio tem recorrência — e só na cozinha. No modelo global vai `null`: limpa o número
			// que um modelo antigo tenha (o servidor o recusaria). Mandar `null` num evento local
			// limparia a coluna à toa.
			...(isSupportMenu || !allowAbsolutes ? { expected_monthly_occurrences: allowAbsolutes ? parseMonthlyOccurrences(occurrences) : null } : {}),
		}),
		[name, description, occurrences, isSupportMenu, allowAbsolutes]
	)

	const payloadItems = useMemo(() => eventItemsPayload(items, eventMeals, { allowItemHeadcount: allowMealAbsolutes }), [items, eventMeals, allowMealAbsolutes])
	const payloadEventMeals = useMemo(() => eventMealsPayload(eventMeals, { allowBase: allowMealAbsolutes }), [eventMeals, allowMealAbsolutes])
	// Refeição sem horário (o apoio abriu sem tipo de refeição nenhum para o "Kit") não tem como
	// ser gravada: o salvamento a cobra em vez de o servidor recusar o cardápio inteiro.
	const mealWithoutSlot = eventMeals.find((m) => m.meal_type_id === "")

	// O apoio sem refeição abre com o "Kit", e o horário dele depende dos tipos de refeição: a
	// carga espera por eles (e pelo de sistema dos lanches) para não nascer sem horário.
	const slotsReady = !isSupportMenu || (mealTypesFetched && snackMealTypeFetched)
	useEffect(() => {
		if (!template || initialized || !slotsReady) return
		dispatch({ type: "SET_NAME", value: template.name ?? "" })
		dispatch({ type: "SET_DESCRIPTION", value: template.description ?? "" })
		dispatch({ type: "SET_OCCURRENCES", value: template.expected_monthly_occurrences != null ? String(template.expected_monthly_occurrences) : "" })
		const isSnack = isSupportMenu && isSnackStandardTemplate(template)
		// Padrão gravado antes da proporção única guardava as porções por kit no pax.
		const storedItems = isSnack ? template.items.map(withLegacySnackPortions) : template.items
		const draft = eventDraftFrom(template.event_meals, storedItems, templateType)
		// Apoio sem refeição nenhuma: o kit simples, sem grupos. Padrão de lanche fica no horário de
		// sistema; os demais, no primeiro horário da cozinha (a refeição deixa trocar).
		if (isSupportMenu && draft.meals.length === 0) {
			const slot = (isSnack ? snackMealType?.id : undefined) ?? mealTypes?.[0]?.id ?? snackMealType?.id ?? ""
			draft.meals.push(newSupportKitMeal(slot))
		}
		const meals = isSnack && snackMealType ? draft.meals.map((m) => ({ ...m, meal_type_id: snackMealType.id })) : draft.meals
		dispatch({ type: "SET_EVENT_CONTENT", meals, items: draft.items })
		dispatch({ type: "SET_SNACK", value: snackDraftFromTemplate(template) })
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
	 */
	const persistSnackClassification = useCallback(
		(saved: {
			id: string
			contentSignature: string
			snackSignature: string
			snackPayload: SetSnackClassification["classification"]
			itemsSignature: string
		}) => {
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
				return
			}
			if (!isSupportMenu || saved.snackSignature === savedSnackSignatureRef.current) {
				queryClient.invalidateQueries({ queryKey: queryKeys.snackRequests.standardEnergy(saved.id) })
				return
			}
			setSnackClassification(
				{ templateId: saved.id, classification: saved.snackPayload },
				{
					onSuccess: () => {
						savedSnackSignatureRef.current = saved.snackSignature
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

	const handleSave = () => {
		if (!name.trim()) return
		if (hasSnackIssues) {
			toast.error("Corrija os campos do padrão de lanche antes de salvar.")
			return
		}
		if (mealWithoutSlot) {
			toast.error(`Escolha o horário da refeição "${mealWithoutSlot.name}" antes de salvar.`)
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
					persistSnackClassification({ id: result?.template?.id ?? templateId, contentSignature, snackSignature, snackPayload, itemsSignature })
					const savedId = result?.template?.id
					if (savedId && savedId !== templateId) {
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
	/**
	 * Horários que a refeição pode escolher: os da cozinha e, num apoio com refeição no horário de
	 * sistema dos lanches (padrão, ou padrão que deixou de ser), também ele.
	 */
	const slotOptions: MealTypeInfo[] = [
		...(mealTypes ?? []),
		...(snackMealType && !mealTypes?.some((mt) => mt.id === snackMealType.id) && eventMeals.some((m) => m.meal_type_id === snackMealType.id)
			? [snackMealType]
			: []),
	]
	const slotName = (mealTypeId: string) =>
		mealTypes?.find((mt) => mt.id === mealTypeId)?.name ?? (snackMealType?.id === mealTypeId ? (snackMealType.name ?? SNACK_MEAL_TYPE_NAME) : null)

	const totalRecipes = items.length
	const groupsWithContent = sectionMealTypes.filter((mt) => hasItemsUnder(mt.id)).length

	const currentSelectorRecipeIds = selectedMealTypeId ? items.flatMap((i) => (i.meal_type_id === selectedMealTypeId ? [i.recipe_id] : [])) : []

	// ── Render ─────────────────────────────────────────────────────────────────

	if (templateLoading) {
		return (
			<div className="flex justify-center p-12">
				<Loader2 className="size-8 animate-spin text-muted-foreground" />
			</div>
		)
	}

	if (!template || outOfContext) {
		return (
			<div className="p-8 text-center bg-destructive/10 text-destructive rounded-md">
				<p className="text-subheading">
					{copy.singular} não {copy.article === "o" ? "encontrado" : "encontrada"}.
				</p>
				<Button variant="link" size="sm" className="mt-2" onClick={() => navigate(listLink)}>
					← Voltar para {copy.plural.toLowerCase()}
				</Button>
			</div>
		)
	}

	const namePlaceholder = copy.namePlaceholder.split(",")[0]
	const openNewMeal = () => setMealDialog({ meal: newEventMeal("", "", templateType), isNew: true, open: true })
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
				<div className="flex items-center gap-2">
					<AutoSaveStatus status={saveStatus} onRetry={handleSave} />
					<RecipeVersionUpdateButton outdated={outdated} onApply={handleUpdateVersions} />
					{/* Aplicar é materializar no calendário de UMA cozinha — não existe no catálogo.
						    Padrão de lanche não entra por aqui: a produção dele nasce do aceite do pedido, e
						    nele o número do item é porções por KIT, não efetivo do dia. */}
					{kitchenId !== null && !isSnackStandard && (
						<Button variant="outline" size="sm" disabled={totalRecipes === 0} onClick={() => setApplyOpen(true)}>
							<CalendarPlus className="size-4 mr-2" />
							Aplicar ao Calendário
						</Button>
					)}
					<Button type="button" variant="outline" size="sm" onClick={() => navigate(listLink)}>
						Cancelar
					</Button>
					<Button size="sm" disabled={isSaving || !name.trim()} onClick={handleSave}>
						{isSaving ? <Loader2 className="size-4 mr-2 animate-spin" /> : <Save className="size-4 mr-2" />}
						Salvar
					</Button>
				</div>
			</PageHeader>

			{willFork && (
				<Alert>
					<GitFork className="size-4" />
					<AlertTitle>Modelo global</AlertTitle>
					<AlertDescription>
						{copy.article === "o" ? "Este" : "Esta"} {copy.noun} é do catálogo global da SDAB. Ao salvar, uma cópia local desta cozinha é criada com as suas
						alterações — o modelo global permanece intacto e as demais unidades continuam vendo o original. O salvamento automático fica desligado até lá.
					</AlertDescription>
				</Alert>
			)}

			<div className="space-y-6">
				{/* Metadata */}
				<Card>
					<CardContent>
						<FieldGroup className={isSupportMenu && allowAbsolutes ? "grid grid-cols-1 md:grid-cols-3 gap-4" : "grid grid-cols-1 md:grid-cols-2 gap-4"}>
							<Field>
								<FieldLabel htmlFor="name">
									Nome <span className="text-destructive">*</span>
								</FieldLabel>
								<Input id="name" value={name} onChange={(e) => dispatch({ type: "SET_NAME", value: e.target.value })} placeholder={namePlaceholder} required />
							</Field>
							{/* Ocorrências por mês são da cozinha: o modelo global não as tem. */}
							{isSupportMenu && allowAbsolutes && (
								<Field>
									<FieldLabel htmlFor="occurrences">{isSnackStandard ? "Kits por mês" : "Ocorrências/mês"}</FieldLabel>
									<Input
										id="occurrences"
										type="number"
										min={1}
										inputMode="numeric"
										value={occurrences}
										onChange={(e) => dispatch({ type: "SET_OCCURRENCES", value: e.target.value })}
										placeholder={isSnackStandard ? "Ex.: 40" : "Ex.: 30"}
									/>
									{isSnackStandard && (
										<FieldDescription>
											O anexo quantitativo multiplica igual: porções por kit × kits por mês × vigência. Em branco, conta como 1 kit.
										</FieldDescription>
									)}
								</Field>
							)}
							<Field>
								<FieldLabel htmlFor="description">Descrição (opcional)</FieldLabel>
								<Input
									id="description"
									value={description}
									onChange={(e) => dispatch({ type: "SET_DESCRIPTION", value: e.target.value })}
									placeholder="Contexto ou observações"
								/>
							</Field>
						</FieldGroup>
					</CardContent>
				</Card>

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

				{isSnackStandard && snackMealTypeError && (
					<Alert variant="destructive">
						<AlertTitle>Tipo de refeição dos lanches indisponível</AlertTitle>
						<AlertDescription>
							Não foi possível carregar o horário "Lanches de Bordo/Apoio" ({snackMealTypeError.message}). As refeições do padrão ficam nele de todo modo: o
							servidor as fixa ao salvar.
						</AlertDescription>
					</Alert>
				)}

				{mealWithoutSlot && (
					<Alert variant="destructive">
						<AlertTriangle className="size-4" />
						<AlertTitle>Refeição sem horário</AlertTitle>
						<AlertDescription>
							Escolha em que horário do calendário "{mealWithoutSlot.name}" é servida (lápis da refeição). Sem ele o cardápio não é salvo.
						</AlertDescription>
					</Alert>
				)}

				{(totalRecipes > 0 || sectionMealTypes.length > 0) && (
					<div className="flex items-center gap-4 text-sm text-muted-foreground px-1">
						<span>
							<strong className="text-foreground tabular-nums">{totalRecipes}</strong> {totalRecipes === 1 ? "preparação" : "preparações"}{" "}
							{copy.article === "o" ? "no" : "na"} {copy.noun}
						</span>
						{sectionMealTypes.length > 1 && (
							<>
								<span className="text-muted-foreground/40">·</span>
								<span>
									<strong className="text-foreground tabular-nums">{groupsWithContent}</strong>/{sectionMealTypes.length} refeições com preparação
								</span>
							</>
						)}
					</div>
				)}

				{/* Preenchimento: localizar, quantitativo por refeição e seleção em massa */}
				<div className="flex flex-wrap items-center gap-2">
					<MenuFindBar
						items={items}
						nameOf={(recipeId) => recipeById.get(recipeId)?.name}
						mealTypeOrder={sectionMealTypes.map((m) => m.id)}
						dayLabel={null}
						mealLabel={(mealTypeId) => sectionMealTypes.find((m) => m.id === mealTypeId)?.name ?? "Refeição"}
						kitchenId={kitchenId}
						onGoTo={(match) => setHighlightedKey(match.key)}
						onReplaceAll={(keys, recipeId) => dispatch({ type: "SET_ITEMS", value: replaceMenuRecipe(items, keys, recipeId) })}
						onSelectMatches={(keys) => {
							setSelectionMode(true)
							setSelectedKeys(keys)
						}}
					/>
					{/* O auxiliador preenche o efetivo (kits) de cada refeição — número da cozinha: some no
					    modelo global e no padrão de lanche, cujos kits vêm do pedido. */}
					{allowMealAbsolutes && (
						<Button type="button" variant="outline" size="sm" onClick={() => setHeadcountOpen(true)}>
							<Users className="size-4 sm:mr-2" />
							<span className="hidden sm:inline">Quantitativo</span>
						</Button>
					)}
					<Button
						type="button"
						variant={selectionMode ? "default" : "outline"}
						size="sm"
						onClick={() => (selectionMode ? exitSelectionMode() : setSelectionMode(true))}
					>
						<ListChecks className="size-4 sm:mr-2" />
						<span className="hidden sm:inline">{selectionMode ? "Sair da seleção" : "Selecionar"}</span>
					</Button>
					<Button
						type="button"
						size="sm"
						// Teto do schema: a refeição a mais faria o servidor recusar o cardápio inteiro.
						disabled={eventMeals.length >= MAX_EVENT_MEALS}
						onClick={openNewMeal}
					>
						<Plus />
						Nova refeição
					</Button>
				</div>

				{/* Refeições do cardápio: cada uma com a própria composição */}
				{eventMeals.length > 0 ? (
					<div className="space-y-3">
						{eventMeals.map((meal, index) => {
							const boardItems = getEventMealBoardItems(meal.id)
							const keyOf = (recipeId: string) => menuItemKey({ day_of_week: OCCASION_DAY, meal_type_id: meal.id, recipe_id: recipeId })
							return (
								<EventMealCard
									key={meal.id}
									meal={meal}
									mealTypeName={slotName(meal.meal_type_id)}
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
				) : (
					<div className="rounded-md border border-dashed p-10 text-center">
						<p className="text-sm text-muted-foreground mb-1">
							{copy.article === "o" ? "Este" : "Esta"} {copy.noun} ainda não tem refeições.
						</p>
						<p className="text-xs text-muted-foreground/60 mb-3">
							{isSupportMenu
								? 'Crie a refeição do kit — ou "Refeição" e "Lanche", quando o kit tiver as duas — e ponha as preparações nela.'
								: "Crie as refeições do evento — coquetel, jantar de gala… — e monte a composição de cada uma: entradas, volantes, prato principal."}
						</p>
						<Button type="button" size="sm" variant="outline" onClick={openNewMeal}>
							<Plus />
							Nova refeição
						</Button>
					</div>
				)}
			</div>

			<EventMealDialog
				open={mealDialog?.open ?? false}
				onOpenChange={(open) => {
					if (!open) setMealDialog((current) => (current ? { ...current, open: false } : null))
				}}
				meal={mealDialog?.meal ?? null}
				isNew={mealDialog?.isNew ?? false}
				mealTypes={slotOptions}
				countLeaving={(mealId, groups) => countItemsLeavingComposition(items, mealId, groups)}
				onSubmit={handleSubmitEventMeal}
				templateType={templateType}
				allowBase={allowMealAbsolutes}
				// Padrão de lanche: o horário é o de sistema, fixado pelo servidor ao salvar.
				lockedSlotName={isSnackStandard ? (snackMealType?.name ?? SNACK_MEAL_TYPE_NAME) : null}
			/>

			<MenuHeadcountDialog
				open={headcountOpen}
				onOpenChange={setHeadcountOpen}
				mealTypes={sectionMealTypes}
				scope={isSupportMenu ? "support-meal-kits" : "event-meal-base"}
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
