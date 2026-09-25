import { useQuery } from "@tanstack/react-query"
import { Link, useNavigate } from "@tanstack/react-router"
import { addDays, format, parseISO, startOfWeek } from "date-fns"
import { ptBR } from "date-fns/locale"
import { ArrowLeft, FileText, Loader2, Printer } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { createPortal } from "react-dom"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "@/components/ui/toast"
import { useTemplateRecipeVersions } from "@/hooks/business/useTemplateRecipeVersions"
import { useUserKitchens } from "@/hooks/data/useKitchens"
import { useMealTypeGroups } from "@/hooks/data/useMenuGroups"
import { useRecipes } from "@/hooks/data/useRecipes"
import { useTemplate } from "@/hooks/data/useTemplates"
import {
	buildPreparationEntries,
	type CardapioPrintOptions,
	DEFAULT_COMMAND_TABLE_MAX_PROPORTION,
	DEFAULT_PRINT_OPTIONS,
	describeAllergens,
	INGREDIENTS_MODE_LABELS,
	INGREDIENTS_MODES,
	type IngredientsMode,
	isCommandTableItem,
	isMainDish,
	type PreparationEntry,
	type PreparationSource,
} from "@/lib/cardapio-print"
import { formatItemDemand } from "@/lib/menu-fill"
import { menuItemGroupOrder } from "@/lib/menu-item-groups"
import { queryKeys } from "@/lib/query-keys"
import { describeRecipeVersion } from "@/lib/recipe-versions"
import { importChunkOrNull, recoverIfStaleChunk } from "@/lib/recover-stale-chunk"
import { fetchMealTypesFn } from "@/server/meal-types.fn"
import { fetchRecipeIngredientDigestsFn } from "@/server/recipes.fn"
import type { MenuTemplateWithItems } from "@/types/domain/planning"

/**
 * WeeklyMenuPrint — visão imprimível / "baixar PDF" de um Cardápio Semanal.
 *
 * Reproduz o formato oficial do cardápio semanal da Seção de Subsistência:
 * grade refeição × dia da semana + lista de preparações (modo de preparo).
 *
 * Impressão via `window.print()` (o próprio diálogo do navegador oferece
 * "Salvar como PDF"), sem dependência extra. A folha sai em paisagem A4.
 *
 * Melhorias sobre o modelo em papel:
 *  - seletor opcional de data-início da semana → colunas ganham a data real
 *    (ex.: "Segunda-feira 15"), como no cardápio distribuído;
 *  - lista de preparações gerada automaticamente a partir de
 *    `recipe_origin.preparation_method`, deduplicada e ordenada;
 *  - cabeçalho e blocos de assinatura editáveis e memorizados por cozinha
 *    (localStorage), evitando redigitar a cada semana;
 *  - opções de impressão (modo de preparo; ingredientes: nenhum, só alergênicos ou todos,
 *    sempre sem quantidade). Ficam só na página, sem armazenamento local: chave nova de
 *    armazenamento exigiria versão nova da Política de Cookies, e preferência de leitura
 *    não justifica pedir ciência de novo a todo usuário;
 *  - preparações da mesa de comando (porcentagem pequena do efetivo) ficam fora da folha,
 *    por padrão: ela é afixada para o comensal, e esse prato não está à disposição dele.
 *
 * Nomes de preparação e de refeição saem como estão no banco — sem caixa alta forçada — e o
 * prato principal sai em negrito.
 */

const WEEKDAYS = [
	{ num: 1, label: "Segunda-feira" },
	{ num: 2, label: "Terça-feira" },
	{ num: 3, label: "Quarta-feira" },
	{ num: 4, label: "Quinta-feira" },
	{ num: 5, label: "Sexta-feira" },
	{ num: 6, label: "Sábado" },
	{ num: 7, label: "Domingo" },
] as const

type SignatureBlock = { name: string; role: string }

/**
 * Uma preparação dentro de uma célula (refeição × dia) da grade. `demand` é a medida do item já
 * formatada — "120 pax" ou "30%". Só a porcentagem saía, e o item medido em pessoas ficava em branco.
 */
type CellEntry = { name: string; group: string | null; main: boolean; sortOrder: number; demand: string | null }

type PrintHeader = {
	organization: string
	section: string
	title: string
	signatures: [SignatureBlock, SignatureBlock, SignatureBlock, SignatureBlock]
}

/**
 * Nome da OM/organização impresso no topo. Antes era hardcoded como EEAR; hoje
 * vem dinâmico do escopo (unidade da cozinha, ou SDAB no plano modelo global).
 */
const GLOBAL_ORGANIZATION = "SUBDIRETORIA DE ADMINISTRAÇÃO DA AERONÁUTICA"
/** Valor hardcoded legado; migrado p/ o nome dinâmico quando reencontrado no localStorage. */
const LEGACY_DEFAULT_ORG = "ESCOLA DE ESPECIALISTAS DE AERONÁUTICA"

const DEFAULT_HEADER: PrintHeader = {
	organization: "",
	section: "SEÇÃO DE SUBSISTÊNCIA",
	title: "CARDÁPIO SEMANAL",
	signatures: [
		{ name: "", role: "Agente de Controle Interno" },
		{ name: "", role: "Agente Diretor" },
		{ name: "", role: "Chefe do Setor de Nutrição da Seção de Subsistência" },
		{ name: "", role: "Chefe da Seção de Subsistência" },
	],
}

function headerStorageKey(scope: string) {
	return `sisub:cardapio-print-header:${scope}`
}

/**
 * Carrega o cabeçalho persistido (localStorage), usando `defaultOrg` como nome
 * de organização quando nada foi salvo — ou quando o que ficou salvo é o valor
 * hardcoded legado (EEAR), que migramos para o nome correto da OM/SDAB.
 */
function loadHeader(scope: string, defaultOrg: string): PrintHeader {
	const fallback: PrintHeader = { ...DEFAULT_HEADER, organization: defaultOrg }
	if (typeof window === "undefined") return fallback
	try {
		const raw = window.localStorage.getItem(headerStorageKey(scope))
		if (!raw) return fallback
		const parsed = JSON.parse(raw) as Partial<PrintHeader>
		// `== null` (não `!storedOrg`) preserva string vazia intencional — o usuário
		// pode limpar a OM de propósito para gerar um documento sem cabeçalho de OM.
		const storedOrg = parsed.organization
		const organization = storedOrg == null || storedOrg.trim() === LEGACY_DEFAULT_ORG ? defaultOrg : storedOrg
		return {
			organization,
			section: parsed.section ?? DEFAULT_HEADER.section,
			title: parsed.title ?? DEFAULT_HEADER.title,
			signatures: (parsed.signatures ?? DEFAULT_HEADER.signatures) as PrintHeader["signatures"],
		}
	} catch {
		return fallback
	}
}

/** Extrai o nome exibível de um item do template (snapshot → origem → fallback). */
function itemRecipeName(item: MenuTemplateWithItems["items"][number]): string {
	return item.recipe_origin?.name?.trim() || "Preparação sem nome"
}

/**
 * Escopo de origem do modelo — define de onde vêm os meal types, a chave de
 * persistência do cabeçalho e os destinos de navegação (voltar + ?week=).
 * `kitchen` = cozinha local; `global` = plano modelo da SDAB (kitchen_id null).
 */
export type PrintScope = { kind: "kitchen"; kitchenId: number; kitchenIdStr: string } | { kind: "global" }

interface WeeklyMenuPrintProps {
	templateId: string
	scope: PrintScope
	/** Data-início da semana (YYYY-MM-DD) para datar as colunas. Opcional. */
	initialWeek?: string
}

export function WeeklyMenuPrint({ templateId, scope, initialWeek }: WeeklyMenuPrintProps) {
	const navigate = useNavigate()
	const { data: template, isLoading } = useTemplate(templateId)

	// Versão das fichas na lista de preparações: a cozinha produz pela folha, e uma ficha antiga
	// saía idêntica a uma atual. O catálogo diz qual é a vencedora de cada linhagem.
	const { data: catalog } = useRecipes({ kitchen_id: scope.kind === "kitchen" ? scope.kitchenId : null })
	const recipeRefs = useMemo(() => (template?.items ?? []).flatMap((i) => (i.recipe_id ? [{ recipe_id: i.recipe_id }] : [])), [template])
	const { outdatedById } = useTemplateRecipeVersions(template?.items, catalog, recipeRefs)

	// Meal types: cozinha → genéricos + da cozinha; global → apenas genéricos
	// (kitchen_id null). fetchMealTypesFn aceita null; o hook useMealTypes não.
	const mealTypeKitchenId = scope.kind === "kitchen" ? scope.kitchenId : null
	const { data: mealTypes } = useQuery({
		queryKey: queryKeys.mealTypes.byKitchen(mealTypeKitchenId),
		queryFn: () => fetchMealTypesFn({ data: { kitchenId: mealTypeKitchenId } }),
		staleTime: 5 * 60 * 1000,
	})

	// Ordem de leitura das colunas impressas: a do conjunto de cada refeição.
	const { groupsFor } = useMealTypeGroups(mealTypeKitchenId, mealTypes)

	const storageScope = scope.kind === "kitchen" ? String(scope.kitchenId) : "global"

	// Nome da OM impresso no topo: unidade da cozinha (padrão canônico do app),
	// ou a SDAB no plano modelo global. Serve de default do cabeçalho; o usuário
	// ainda pode sobrescrever inline (persistido por escopo no localStorage).
	const { data: kitchens } = useUserKitchens()
	const organizationName = useMemo(() => {
		if (scope.kind === "global") return GLOBAL_ORGANIZATION
		const kitchen = kitchens?.find((k) => k.id === scope.kitchenId)
		const om = kitchen?.unit?.display_name?.trim() || kitchen?.unit?.code?.trim() || kitchen?.display_name?.trim()
		return om ? om.toUpperCase() : ""
	}, [kitchens, scope])

	// Datas só são resolvidas no cliente (evita divergência de hidratação no SSR).
	const [weekStart, setWeekStart] = useState<Date | null>(null)
	const [header, setHeader] = useState<PrintHeader>(DEFAULT_HEADER)
	const [isExporting, setIsExporting] = useState(false)
	const [options, setOptions] = useState<CardapioPrintOptions>(DEFAULT_PRINT_OPTIONS)
	const updateOptions = (patch: Partial<CardapioPrintOptions>) => setOptions((prev) => ({ ...prev, ...patch }))

	// Ingredientes das fichas do cardápio: só buscados quando a opção pede.
	// Mesa de comando sai da grade E da lista de preparações: uma ficha que só ela usa, listada
	// sem prato correspondente na grade, anunciaria o que a folha acabou de esconder.
	const { hideCommandTable, commandTableMaxProportion } = options
	const printedItems = useMemo(
		() => (template?.items ?? []).filter((item) => !isCommandTableItem(item, { hideCommandTable, commandTableMaxProportion })),
		[template, hideCommandTable, commandTableMaxProportion]
	)
	// Conta o que sumiria da grade: item sem dia ou refeição nunca apareceu nela.
	const hiddenCount = (template?.items ?? []).filter(
		(item) => item.day_of_week != null && item.meal_type_id && isCommandTableItem(item, { hideCommandTable, commandTableMaxProportion })
	).length

	// Só as fichas que saem na folha: ingrediente de ficha oculta seria busca (e espera) à toa.
	const originIds = useMemo(() => [...new Set(printedItems.flatMap((i) => (i.recipe_origin?.id ? [i.recipe_origin.id] : [])))], [printedItems])
	const wantsIngredients = options.ingredients !== "none"
	const digestsQuery = useQuery({
		queryKey: queryKeys.recipes.ingredientDigests(originIds),
		queryFn: () => fetchRecipeIngredientDigestsFn({ data: { recipeIds: originIds } }),
		enabled: wantsIngredients && originIds.length > 0,
		staleTime: 5 * 60 * 1000,
	})
	const digestsById = useMemo(() => (digestsQuery.data ? new Map(digestsQuery.data.map((d) => [d.recipe_id, d])) : undefined), [digestsQuery.data])
	// Sem os ingredientes, a folha sairia sem a informação pedida — segura a impressão até chegar.
	// Só enquanto CARREGA: em erro a impressão volta (sem ingredientes) e a barra oferece de novo.
	const ingredientsPending = wantsIngredients && originIds.length > 0 && digestsQuery.isPending
	// A cópia de impressão só existe no cliente — createPortal exige `document`.
	const [mounted, setMounted] = useState(false)
	useEffect(() => setMounted(true), [])

	useEffect(() => {
		setHeader(loadHeader(storageScope, organizationName))
	}, [storageScope, organizationName])

	useEffect(() => {
		const parsed = initialWeek ? parseISO(initialWeek) : new Date()
		// Defesa extra: parseISO de valor inválido devolve Invalid Date (truthy).
		const base = Number.isNaN(parsed.getTime()) ? new Date() : parsed
		setWeekStart(startOfWeek(base, { weekStartsOn: 1 }))
	}, [initialWeek])

	// Atualiza estado local + query param (?week=) para tornar a semana compartilhável.
	const handleWeekChange = (value: string) => {
		setWeekStart(value ? startOfWeek(parseISO(value), { weekStartsOn: 1 }) : null)
		const search = value ? { week: value } : {}
		if (scope.kind === "kitchen") {
			void navigate({
				to: "/kitchen/$kitchenId/weekly-menus/print/$weeklyMenuId",
				params: { kitchenId: scope.kitchenIdStr, weeklyMenuId: templateId },
				search,
				replace: true,
			})
		} else {
			void navigate({ to: "/global/weekly-plans/print/$planId", params: { planId: templateId }, search, replace: true })
		}
	}

	const persistHeader = (next: PrintHeader) => {
		setHeader(next)
		try {
			window.localStorage.setItem(headerStorageKey(storageScope), JSON.stringify(next))
		} catch {
			// localStorage indisponível — mantém apenas em memória.
		}
	}

	const setSignature = (idx: number, patch: Partial<SignatureBlock>) => {
		const signatures = header.signatures.map((s, i) => (i === idx ? { ...s, ...patch } : s)) as PrintHeader["signatures"]
		persistHeader({ ...header, signatures })
	}

	if (isLoading) {
		return (
			<div className="flex justify-center p-12">
				<Loader2 className="size-8 animate-spin text-muted-foreground" />
			</div>
		)
	}

	if (!template) {
		return (
			<div className="p-8 text-center bg-destructive/10 text-destructive rounded-md">
				<p className="text-subheading">{scope.kind === "kitchen" ? "Cardápio semanal não encontrado." : "Plano semanal não encontrado."}</p>
				{scope.kind === "kitchen" ? (
					<Link
						to="/kitchen/$kitchenId/weekly-menus"
						params={{ kitchenId: scope.kitchenIdStr }}
						className="text-sm text-primary mt-2 flex items-center justify-center hover:underline"
					>
						← Voltar para listagem
					</Link>
				) : (
					<Link to="/global/weekly-plans" className="text-sm text-primary mt-2 flex items-center justify-center hover:underline">
						← Voltar para listagem
					</Link>
				)}
			</div>
		)
	}

	// Ordena os tipos de refeição (linhas da grade) por sort_order → nome.
	const orderedMealTypes = (mealTypes ?? []).slice().sort((a, b) => (a.sort_order ?? 999) - (b.sort_order ?? 999) || (a.name ?? "").localeCompare(b.name ?? ""))

	// Índice (dia → refeição → preparações), ordenadas pela ordem de leitura do
	// CONJUNTO daquela refeição e depois pela posição dentro do grupo.
	const cellIndex = new Map<string, CellEntry[]>()
	for (const item of printedItems) {
		if (item.day_of_week == null || !item.meal_type_id) continue
		const key = `${item.day_of_week}:${item.meal_type_id}`
		const list = cellIndex.get(key) ?? []
		list.push({
			name: itemRecipeName(item),
			group: item.item_group ?? null,
			main: isMainDish(item.item_group),
			sortOrder: item.sort_order ?? 0,
			demand: formatItemDemand(item),
		})
		cellIndex.set(key, list)
	}
	for (const [key, list] of cellIndex) {
		const groups = groupsFor(key.split(":")[1])
		list.sort((a, b) => menuItemGroupOrder(a.group, groups) - menuItemGroupOrder(b.group, groups) || a.sortOrder - b.sortOrder)
	}

	// Efetivo base por (dia + refeição): sai no topo da célula, para "30%" ter do que ser 30%.
	const baseByCell = new Map((template.meals ?? []).map((m) => [`${m.day_of_week}:${m.meal_type_id}`, m.base_headcount]))

	// Lista de preparações: fichas distintas do cardápio; `buildPreparationEntries` decide,
	// pelas opções, quais têm algo a mostrar (preparo e/ou ingredientes).
	//
	// Preparo conta com QUALQUER um dos dois campos. Filtrar só por `preparation_method`
	// derrubava da lista impressa a ficha cujo texto foi todo para o pré-preparo — a
	// preparação continuaria no cardápio e sumiria da folha que a cozinha lê.
	const prepMap = new Map<string, PreparationSource>()
	for (const item of printedItems) {
		const r = item.recipe_origin
		if (!r || prepMap.has(r.id)) continue
		prepMap.set(r.id, {
			id: r.id,
			name: r.name?.trim() || "Preparação sem nome",
			version: describeRecipeVersion(r.version ?? 1, outdatedById.get(r.id)),
			prePreparation: r.pre_preparation_method?.trim() || null,
			method: r.preparation_method?.trim() || null,
		})
	}
	const preparations = buildPreparationEntries([...prepMap.values()], digestsById, options)

	const dayDate = (dow: number): Date | null => (weekStart ? addDays(weekStart, dow - 1) : null)

	// Dados derivados compartilhados pelas duas cópias do documento (tela + impressão).
	const dayColumns = WEEKDAYS.map((d) => {
		const date = dayDate(d.num)
		return { num: d.num, label: d.label, dateLabel: date ? format(date, "dd/MM") : null }
	})
	const mealRows = orderedMealTypes.map((mt) => ({ id: mt.id, name: mt.name ?? "" }))
	const emptyMessage = scope.kind === "kitchen" ? "Nenhum tipo de refeição configurado para esta cozinha." : "Nenhum tipo de refeição genérico configurado."

	const weekLabel = (() => {
		if (!weekStart) return template.name ?? ""
		const end = addDays(weekStart, 6)
		return `SEMANA DE ${format(weekStart, "dd 'de' MMMM", { locale: ptBR })} A ${format(end, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}`.toUpperCase()
	})()

	const weekInputValue = weekStart ? format(weekStart, "yyyy-MM-dd") : ""

	// Export .docx (Word): reaproveita os mesmos dados/ordem da grade do print.
	// Import dinâmico — a lib `docx` é pesada e só carrega ao exportar.
	const handleDownloadDocx = async () => {
		if (isExporting) return
		setIsExporting(true)
		// Sinaliza que a página está indo embora — o `finally` usa isso para NÃO
		// reabilitar o botão. Reabilitar convidaria um segundo clique, e é ele que
		// queimaria o último slot de MAX_RELOADS antes do reload chegar.
		let reloading = false
		try {
			// `null` = chunk obsoleto e o recovery já agendou o hard-reload (ver
			// importChunkOrNull). Alertar de falha numa página que está saindo só
			// confunde o usuário e polui o Faro — então sai quieto.
			const docx = await importChunkOrNull(() => import("@/lib/cardapio-docx"))
			if (!docx) {
				reloading = true
				return
			}
			const columns = WEEKDAYS.map((d) => {
				const date = dayDate(d.num)
				return { label: d.label, date: date ? format(date, "dd/MM") : null }
			})
			const rows = orderedMealTypes.map((mt) => ({
				meal: mt.name ?? "",
				cells: WEEKDAYS.map((d) => (cellIndex.get(`${d.num}:${mt.id}`) ?? []).map((e) => ({ name: e.name, main: e.main, demand: e.demand }))),
				bases: WEEKDAYS.map((d) => baseByCell.get(`${d.num}:${mt.id}`) ?? null),
			}))
			await docx.downloadCardapioDocx(
				{
					organization: header.organization,
					section: header.section,
					title: header.title,
					weekLabel,
					signatures: header.signatures,
					columns,
					rows,
					preparations: preparations.map((p) => ({
						name: p.name,
						version: p.version,
						prePreparation: p.prePreparation,
						method: p.method,
						ingredients: p.ingredients,
						allergens: describeAllergens(p),
					})),
				},
				`${header.title} - ${template.name ?? "cardapio"}`
			)
		} catch (err) {
			// Outro feitio do chunk obsoleto: o import REJEITA (nenhum listener deu
			// preventDefault) e o erro é capturado aqui, sem chegar em window. Tenta
			// o hard-reload antes de tratar como falha de feature.
			if (recoverIfStaleChunk(err, "docx-export")) {
				reloading = true
				return
			}
			// biome-ignore lint/suspicious/noConsole: intentional — surface DOCX export failure
			console.error("Falha ao gerar DOCX:", err)
			toast.error("Não foi possível gerar o DOCX. Tente novamente.")
		} finally {
			if (!reloading) setIsExporting(false)
		}
	}

	return (
		<div>
			<style>{PRINT_CSS}</style>

			{/* Barra de ações — oculta na impressão */}
			<div className="cardapio-no-print flex flex-wrap items-center gap-2 mb-4">
				<Button
					variant="outline"
					size="sm"
					nativeButton={false}
					render={
						scope.kind === "kitchen" ? (
							<Link to="/kitchen/$kitchenId/weekly-menus/$weeklyMenuId" params={{ kitchenId: scope.kitchenIdStr, weeklyMenuId: templateId }}>
								<ArrowLeft className="size-4 mr-2" />
								Voltar ao editor
							</Link>
						) : (
							<Link to="/global/weekly-plans/$planId" params={{ planId: templateId }}>
								<ArrowLeft className="size-4 mr-2" />
								Voltar ao editor
							</Link>
						)
					}
				/>
				<div className="flex items-center gap-2 ml-auto">
					<label htmlFor="week-start" className="text-xs text-muted-foreground">
						Semana de:
					</label>
					<input
						id="week-start"
						type="date"
						value={weekInputValue}
						onChange={(e) => handleWeekChange(e.target.value)}
						className="h-9 rounded-none border border-input bg-background px-2 text-sm"
					/>
					<Button variant="outline" size="sm" onClick={handleDownloadDocx} disabled={isExporting || ingredientsPending}>
						{isExporting ? <Loader2 className="size-4 mr-2 animate-spin" /> : <FileText className="size-4 mr-2" />}
						Baixar DOCX
					</Button>
					<Button size="sm" onClick={() => window.print()} disabled={ingredientsPending}>
						{ingredientsPending ? <Loader2 className="size-4 mr-2 animate-spin" /> : <Printer className="size-4 mr-2" />}
						Imprimir / Baixar PDF
					</Button>
				</div>
			</div>

			{/* Opções de impressão — ocultas na impressão; valem só nesta página */}
			<div className="cardapio-no-print flex flex-wrap items-center gap-x-6 gap-y-2 mb-4 text-sm">
				<label htmlFor="print-show-method" className="flex items-center gap-2">
					<Checkbox id="print-show-method" checked={options.showMethod} onCheckedChange={(checked) => updateOptions({ showMethod: checked === true })} />
					Mostrar modo de preparo
				</label>
				<div className="flex items-center gap-2">
					<span className="text-muted-foreground">Ingredientes:</span>
					<Select
						value={options.ingredients}
						onValueChange={(next) => {
							if (next && (INGREDIENTS_MODES as readonly string[]).includes(next)) updateOptions({ ingredients: next as IngredientsMode })
						}}
					>
						<SelectTrigger className="w-72" aria-label="Ingredientes na lista de preparações">
							<SelectValue>{INGREDIENTS_MODE_LABELS[options.ingredients]}</SelectValue>
						</SelectTrigger>
						<SelectContent>
							{INGREDIENTS_MODES.map((mode) => (
								<SelectItem key={mode} value={mode}>
									{INGREDIENTS_MODE_LABELS[mode]}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
				<div className="flex items-center gap-2">
					<label htmlFor="print-hide-command-table" className="flex items-center gap-2">
						<Checkbox
							id="print-hide-command-table"
							checked={options.hideCommandTable}
							onCheckedChange={(checked) => updateOptions({ hideCommandTable: checked === true })}
						/>
						Ocultar mesa de comando: até
					</label>
					<Input
						type="number"
						min={0}
						max={100}
						step={0.5}
						inputMode="decimal"
						aria-label="Porcentagem máxima da mesa de comando"
						className="w-20"
						disabled={!options.hideCommandTable}
						// Não controlado: controlado, apagar o campo para redigitar era desfeito na hora
						// (valor vazio não vira número) e "3" virava "53".
						defaultValue={DEFAULT_COMMAND_TABLE_MAX_PROPORTION}
						onChange={(e) => {
							const next = e.target.valueAsNumber
							// Até 100%: acima disso a porcentagem é do per capita, e esconderia o prato principal.
							if (Number.isFinite(next) && next >= 0 && next <= 100) updateOptions({ commandTableMaxProportion: next })
						}}
					/>
					<span>% do efetivo</span>
					{hiddenCount > 0 && (
						<span className="text-muted-foreground">
							({hiddenCount} {hiddenCount === 1 ? "item oculto na grade" : "itens ocultos na grade"})
						</span>
					)}
				</div>
				{digestsQuery.isError && (
					<span className="flex items-center gap-2 text-destructive">
						Não foi possível carregar os ingredientes — a folha sai sem eles.
						<Button variant="outline" size="sm" onClick={() => void digestsQuery.refetch()}>
							Tentar de novo
						</Button>
					</span>
				)}
			</div>

			{/* Documento — cópia editável, na tela */}
			<CardapioDocument
				editable
				header={header}
				weekLabel={weekLabel}
				dayColumns={dayColumns}
				mealRows={mealRows}
				cellIndex={cellIndex}
				baseByCell={baseByCell}
				preparations={preparations}
				emptyMessage={emptyMessage}
				onSignatureChange={setSignature}
				onHeaderChange={persistHeader}
			/>

			{/*
			 * Cópia de impressão, montada num portal direto no <body>. A cópia da tela
			 * vive dentro do app-shell (`h-screen overflow-hidden` em _protected/route,
			 * `overflow-y-auto` no <main>), que recorta tudo além da primeira dobra ao
			 * imprimir. O `position: absolute` que contornava isso tinha o defeito
			 * oposto: caixa posicionada não fragmenta entre páginas, então a lista de
			 * preparações simplesmente sumia. No <body>, em fluxo normal, o conteúdo
			 * pagina e o `break-before: page` é respeitado.
			 *
			 * Sem `editable`: a cópia impressa é estática, então não duplica os
			 * <input> do formulário nem seus rótulos.
			 */}
			{mounted &&
				createPortal(
					<div className="cardapio-print-portal">
						<CardapioDocument
							header={header}
							weekLabel={weekLabel}
							dayColumns={dayColumns}
							mealRows={mealRows}
							cellIndex={cellIndex}
							baseByCell={baseByCell}
							preparations={preparations}
							emptyMessage={emptyMessage}
						/>
					</div>,
					document.body
				)}
		</div>
	)
}

// ─── Documento ─────────────────────────────────────────────────────────────

interface CardapioDocumentProps {
	header: PrintHeader
	weekLabel: string
	dayColumns: { num: number; label: string; dateLabel: string | null }[]
	mealRows: { id: string; name: string }[]
	cellIndex: Map<string, CellEntry[]>
	/** Efetivo base por `dia:refeição`. */
	baseByCell: Map<string, number | null>
	preparations: PreparationEntry[]
	emptyMessage: string
	/** Só a cópia da tela edita; a de impressão renderiza texto estático. */
	editable?: boolean
	onSignatureChange?: (idx: number, patch: Partial<SignatureBlock>) => void
	onHeaderChange?: (next: PrintHeader) => void
}

function CardapioDocument({
	header,
	weekLabel,
	dayColumns,
	mealRows,
	cellIndex,
	baseByCell,
	preparations,
	emptyMessage,
	editable = false,
	onSignatureChange,
	onHeaderChange,
}: CardapioDocumentProps) {
	const line = (value: string, className: string, onChange: (v: string) => void) =>
		editable ? <EditableLine value={value} onChange={onChange} className={className} /> : <div className={className}>{value}</div>

	const signature = (idx: 0 | 1 | 2 | 3) =>
		editable ? (
			<SignatureField block={header.signatures[idx]} onChange={(p) => onSignatureChange?.(idx, p)} />
		) : (
			<StaticSignature block={header.signatures[idx]} />
		)

	return (
		<div className="cardapio-doc">
			{/* Cabeçalho */}
			<header className="cardapio-header">
				<div className="cardapio-sign cardapio-sign-top">{signature(0)}</div>
				<div className="cardapio-title-block">
					{line(header.organization, "cardapio-org", (v) => onHeaderChange?.({ ...header, organization: v }))}
					{line(header.section, "cardapio-section", (v) => onHeaderChange?.({ ...header, section: v }))}
					{line(header.title, "cardapio-doctitle", (v) => onHeaderChange?.({ ...header, title: v }))}
					<div className="cardapio-week">{weekLabel}</div>
				</div>
				<div className="cardapio-sign cardapio-sign-top cardapio-sign-right">{signature(1)}</div>
			</header>

			{/* Grade refeição × dia */}
			<table className="cardapio-grid">
				<thead>
					<tr>
						<th className="cardapio-meal-col">REFEIÇÃO / DIA</th>
						{dayColumns.map((d) => (
							<th key={d.num} className={d.num >= 6 ? "cardapio-weekend" : undefined}>
								<div>{d.label.toUpperCase()}</div>
								{d.dateLabel && <div className="cardapio-daynum">{d.dateLabel}</div>}
							</th>
						))}
					</tr>
				</thead>
				<tbody>
					{mealRows.length === 0 ? (
						<tr>
							<td colSpan={8} className="cardapio-empty">
								{emptyMessage}
							</td>
						</tr>
					) : (
						mealRows.map((mt) => (
							<tr key={mt.id}>
								<th className="cardapio-meal-col">{mt.name}</th>
								{dayColumns.map((d) => {
									const entries = cellIndex.get(`${d.num}:${mt.id}`) ?? []
									const base = baseByCell.get(`${d.num}:${mt.id}`) ?? null
									return (
										<td key={d.num} className={d.num >= 6 ? "cardapio-weekend" : undefined}>
											{base != null && entries.length > 0 && <div className="cardapio-base">{base} pessoas</div>}
											{entries.map((entry, i) => (
												<div key={`${entry.name}-${i}`} className={entry.main ? "cardapio-dish cardapio-dish-main" : "cardapio-dish"}>
													{entry.name}
													{entry.demand && <span className="cardapio-dish-prop"> {entry.demand}</span>}
												</div>
											))}
										</td>
									)
								})}
							</tr>
						))
					)}
				</tbody>
			</table>

			{/* Assinaturas — antes da quebra, para saírem na mesma folha do cardápio */}
			<footer className="cardapio-footer">
				<div className="cardapio-sign">{signature(2)}</div>
				<div className="cardapio-sign cardapio-sign-right">{signature(3)}</div>
			</footer>

			{/* Lista de preparações — começa em folha nova na impressão */}
			{preparations.length > 0 && (
				<section className="cardapio-preps">
					<div className="cardapio-preps-title">LISTA DE PREPARAÇÕES</div>
					<ul>
						{preparations.map((p) => (
							<li key={p.id}>
								<span className="cardapio-prep-name">
									{p.name} ({p.version})
								</span>
								{(p.prePreparation || p.method) && " — "}
								{p.prePreparation && (
									<span className="cardapio-prep-method">
										<em>Pré-preparo:</em> {p.prePreparation}
										{p.method ? " " : ""}
									</span>
								)}
								{p.method && <span className="cardapio-prep-method">{p.method}</span>}
								{p.ingredients && (
									<div className="cardapio-prep-extra">
										<em>Ingredientes:</em> {p.ingredients.join(", ")}
									</div>
								)}
								{p.allergens && (
									<div className="cardapio-prep-extra">
										<em>Alergênicos:</em> {describeAllergens(p)}
									</div>
								)}
							</li>
						))}
					</ul>
				</section>
			)}
		</div>
	)
}

// ─── Campos editáveis ──────────────────────────────────────────────────────

function EditableLine({ value, onChange, className }: { value: string; onChange: (v: string) => void; className?: string }) {
	return (
		<input
			value={value}
			onChange={(e) => onChange(e.target.value)}
			className={`cardapio-editable ${className ?? ""}`}
			aria-label="Campo editável do cardápio"
		/>
	)
}

/** Mesmo bloco de assinatura, sem <input> — usado na cópia de impressão. */
function StaticSignature({ block }: { block: SignatureBlock }) {
	return (
		<>
			<div className="cardapio-sign-line" />
			<div className="cardapio-sign-name">{block.name}</div>
			<div className="cardapio-sign-role">{block.role}</div>
		</>
	)
}

function SignatureField({ block, onChange }: { block: SignatureBlock; onChange: (patch: Partial<SignatureBlock>) => void }) {
	return (
		<>
			<span className="cardapio-sign-hint cardapio-no-print">(assinado eletronicamente)</span>
			<div className="cardapio-sign-line" />
			<input
				value={block.name}
				onChange={(e) => onChange({ name: e.target.value })}
				placeholder="Nome / Posto"
				className="cardapio-editable cardapio-sign-name"
				aria-label="Nome do signatário"
			/>
			<input
				value={block.role}
				onChange={(e) => onChange({ role: e.target.value })}
				placeholder="Cargo"
				className="cardapio-editable cardapio-sign-role"
				aria-label="Cargo do signatário"
			/>
		</>
	)
}

// ─── CSS do documento + impressão ──────────────────────────────────────────

const PRINT_CSS = `
.cardapio-doc {
	background: #fff;
	color: #000;
	font-family: Arial, Helvetica, sans-serif;
	font-size: 9px;
	line-height: 1.25;
	padding: 8px;
	border: 1px solid #000;
	max-width: 1200px;
	margin: 0 auto;
}
.cardapio-header {
	display: grid;
	grid-template-columns: 1fr 2.2fr 1fr;
	align-items: end;
	gap: 8px;
	margin-bottom: 8px;
}
.cardapio-title-block { text-align: center; }
.cardapio-editable {
	border: none;
	background: transparent;
	text-align: inherit;
	width: 100%;
	font: inherit;
	color: inherit;
	padding: 1px 2px;
	outline: none;
}
.cardapio-no-print .cardapio-editable,
.cardapio-doc .cardapio-editable:hover,
.cardapio-doc .cardapio-editable:focus {
	background: rgba(0,0,0,0.05);
}
.cardapio-org { font-weight: 700; font-size: 11px; text-align: center; }
.cardapio-section { font-size: 10px; text-align: center; }
.cardapio-doctitle { font-weight: 700; font-size: 12px; text-align: center; letter-spacing: 0.5px; }
.cardapio-week { font-size: 9px; margin-top: 2px; font-weight: 600; }
.cardapio-sign { text-align: center; font-size: 8px; }
.cardapio-sign-hint { display: block; font-style: italic; font-size: 7px; color: #555; }
.cardapio-sign-line { border-top: 1px solid #000; margin: 14px 6px 2px; }
.cardapio-sign-name { text-align: center; font-weight: 700; }
.cardapio-sign-role { text-align: center; }
.cardapio-grid {
	width: 100%;
	border-collapse: collapse;
	table-layout: fixed;
}
.cardapio-grid th, .cardapio-grid td {
	border: 1px solid #000;
	padding: 2px 3px;
	vertical-align: top;
	word-break: break-word;
}
.cardapio-grid thead th {
	text-align: center;
	font-weight: 700;
	font-size: 8px;
	background: #eee;
	vertical-align: middle;
}
.cardapio-meal-col {
	width: 90px;
	font-weight: 700;
	font-size: 8px;
	background: #f4f4f4;
	text-align: left;
	vertical-align: middle;
}
.cardapio-daynum { font-weight: 400; font-size: 8px; }
.cardapio-weekend { background: #f4f4f4; }
.cardapio-dish { font-size: 8px; }
.cardapio-dish-main { font-weight: 700; }
.cardapio-dish-prop { font-weight: 700; color: #333; }
.cardapio-base { font-size: 7px; font-style: italic; color: #555; }
.cardapio-dish + .cardapio-dish { border-top: 1px dotted #bbb; margin-top: 1px; padding-top: 1px; }
.cardapio-empty { text-align: center; font-style: italic; padding: 12px; }
.cardapio-preps { margin-top: 8px; }
.cardapio-preps-title {
	font-weight: 700;
	font-size: 9px;
	text-align: center;
	background: #eee;
	border: 1px solid #000;
	padding: 2px;
}
.cardapio-preps ul {
	list-style: none;
	margin: 0;
	padding: 4px 2px;
	columns: 2;
	column-gap: 16px;
}
.cardapio-preps li { font-size: 8px; margin-bottom: 2px; break-inside: avoid; }
.cardapio-prep-name { font-weight: 700; }
.cardapio-prep-extra { margin-top: 1px; }
.cardapio-footer {
	display: grid;
	grid-template-columns: 1fr 1fr;
	gap: 24px;
	margin-top: 16px;
}

/* Cópia de impressão (portal no <body>): existe só para o @media print. */
.cardapio-print-portal { display: none; }

@media print {
	@page { size: A4 landscape; margin: 6mm; }
	body { background: #fff !important; }
	/*
	 * Imprime só a cópia do portal, que é filha direta do <body> e portanto está em
	 * fluxo normal — nenhum ancestral com overflow para recortá-la, e nenhuma caixa
	 * posicionada para impedir a fragmentação entre páginas.
	 */
	body > *:not(.cardapio-print-portal) { display: none !important; }
	.cardapio-print-portal { display: block !important; }
	.cardapio-no-print { display: none !important; }
	.cardapio-doc { border: none; padding: 0; max-width: none; }
	.cardapio-editable:hover, .cardapio-editable:focus { background: transparent !important; }
	/* Cardápio + assinaturas na 1ª folha; modos de preparo começam na seguinte. */
	.cardapio-preps {
		break-before: page;
		page-break-before: always;
		margin-top: 0;
	}
	.cardapio-preps-title { break-after: avoid; page-break-after: avoid; }
}
`
