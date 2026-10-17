import { useQuery } from "@tanstack/react-query"
import { Link, useHydrated, useNavigate } from "@tanstack/react-router"
import { format, parseISO, startOfWeek } from "date-fns"
import { ArrowLeft, FileText, Loader2, Printer } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { createPortal } from "react-dom"
import {
	DEFAULT_HEADER,
	DigestsErrorNotice,
	IngredientsModeSelect,
	loadHeader,
	MENU_PRINT_DOCUMENT_CSS,
	MenuPrintFooter,
	MenuPrintHeader,
	PreparationList,
	type PrintHeader,
	type PrintScope,
	printStorageScope,
	type SignatureBlock,
	saveHeader,
	useDocxExport,
	useMenuPrintOrganization,
	usePreparationDigests,
} from "@/components/features/local/planning/MenuPrintParts"
import { collectPreparationSources, getScopeKitchenId } from "@/components/features/local/planning/menu-print-data"
import {
	buildBaseByCell,
	buildCellIndex,
	buildDayColumns,
	buildGroupLegend,
	type CellEntry,
	countHiddenGridItems,
	describeEmptyMealTypes,
	formatWeekInputValue,
	formatWeekLabel,
	type GroupLegendEntry,
	getWeekdayDate,
	sortMealTypes,
} from "@/components/features/local/planning/weekly-menu-print"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { useTemplateRecipeVersions } from "@/hooks/business/useTemplateRecipeVersions"
import { useMealTypeGroups } from "@/hooks/data/useMenuGroups"
import { useRecipes } from "@/hooks/data/useRecipes"
import { useTemplate } from "@/hooks/data/useTemplates"
import {
	buildPreparationEntries,
	type CardapioPrintOptions,
	DEFAULT_COMMAND_TABLE_MAX_PROPORTION,
	DEFAULT_PRINT_OPTIONS,
	describeAllergens,
	isCommandTableItem,
	type PreparationEntry,
} from "@/lib/cardapio-print"
import { queryKeys } from "@/lib/query-keys"
import { WEEKDAYS } from "@/lib/weekdays"
import { fetchMealTypesFn } from "@/server/meal-types.fn"

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
 *    sempre sem quantidade; cores por grupo, com legenda). Ficam só na página, sem
 *    armazenamento local: chave nova de armazenamento exigiria versão nova da Política de
 *    Cookies, e preferência de leitura
 *    não justifica pedir ciência de novo a todo usuário;
 *  - preparações da mesa de comando (porcentagem pequena do efetivo) ficam fora da folha,
 *    por padrão: ela é afixada para o comensal, e esse prato não está à disposição dele.
 *
 * Nomes de preparação e de refeição saem como estão no banco — sem caixa alta forçada — e o
 * prato principal sai em negrito.
 */

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
	const { data: catalog } = useRecipes({ kitchen_id: getScopeKitchenId(scope) })
	const recipeRefs = useMemo(() => (template?.items ?? []).flatMap((i) => (i.recipe_id ? [{ recipe_id: i.recipe_id }] : [])), [template])
	const { outdatedById } = useTemplateRecipeVersions(template?.items, catalog, recipeRefs)

	// Meal types: cozinha → genéricos + da cozinha; global → apenas genéricos
	// (kitchen_id null). fetchMealTypesFn aceita null; o hook useMealTypes não.
	const mealTypeKitchenId = getScopeKitchenId(scope)
	const { data: mealTypes } = useQuery({
		queryKey: queryKeys.mealTypes.byKitchen(mealTypeKitchenId),
		queryFn: () => fetchMealTypesFn({ data: { kitchenId: mealTypeKitchenId } }),
		staleTime: 5 * 60 * 1000,
	})

	// Ordem de leitura das colunas impressas: a do conjunto de cada refeição.
	const { groupsFor, allGroups } = useMealTypeGroups(mealTypeKitchenId, mealTypes)

	const storageScope = printStorageScope(scope)
	// Nome da OM impresso no topo: default do cabeçalho; o usuário ainda pode sobrescrever inline
	// (persistido por escopo no localStorage).
	const organizationName = useMenuPrintOrganization(scope)

	// Datas só são resolvidas no cliente (evita divergência de hidratação no SSR).
	const [weekStart, setWeekStart] = useState<Date | null>(null)
	const [header, setHeader] = useState<PrintHeader>(DEFAULT_HEADER)
	const { isExporting, exportDocx } = useDocxExport()
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
	const hiddenCount = countHiddenGridItems(template?.items, { hideCommandTable, commandTableMaxProportion })

	// Só as fichas que saem na folha: ingrediente de ficha oculta seria busca (e espera) à toa.
	const originIds = useMemo(() => [...new Set(printedItems.flatMap((i) => (i.recipe_origin?.id ? [i.recipe_origin.id] : [])))], [printedItems])
	const { digestsById, pending: ingredientsPending, isError: digestsError, retry: retryDigests } = usePreparationDigests(originIds, options.ingredients)
	// A cópia de impressão só existe no cliente — createPortal exige `document`.
	const mounted = useHydrated()

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
			void navigate({ to: "/global/weekly-menus/print/$weeklyMenuId", params: { weeklyMenuId: templateId }, search, replace: true })
		}
	}

	const persistHeader = (next: PrintHeader) => {
		setHeader(next)
		saveHeader(storageScope, next)
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
		return <WeeklyMenuNotFound scope={scope} />
	}

	// Ordena os tipos de refeição (linhas da grade) por sort_order → nome.
	const orderedMealTypes = sortMealTypes(mealTypes)

	// Índice (dia → refeição → preparações), ordenadas pela ordem de leitura do
	// CONJUNTO daquela refeição e depois pela posição dentro do grupo.
	const cellIndex = buildCellIndex(printedItems, groupsFor)

	// Efetivo base por (dia + refeição): sai no topo da célula.
	const baseByCell = buildBaseByCell(template.meals)

	// Lista de preparações: fichas distintas do cardápio; `buildPreparationEntries` decide,
	// pelas opções, quais têm algo a mostrar (preparo e/ou ingredientes).
	//
	// Preparo conta com QUALQUER um dos dois campos. Filtrar só por `preparation_method`
	// derrubava da lista impressa a ficha cujo texto foi todo para o pré-preparo — a
	// preparação continuaria no cardápio e sumiria da folha que a cozinha lê.
	const preparations = buildPreparationEntries(collectPreparationSources(printedItems, outdatedById), digestsById, options)

	// Legenda das cores: vazia sem `groupColors` (ver `buildGroupLegend`).
	const groupLegend = buildGroupLegend(options.groupColors, orderedMealTypes, cellIndex, groupsFor, allGroups)

	const dayDate = (dow: number): Date | null => getWeekdayDate(weekStart, dow)

	// Dados derivados compartilhados pelas duas cópias do documento (tela + impressão).
	const dayColumns = buildDayColumns(weekStart)
	const mealRows = orderedMealTypes.map((mt) => ({ id: mt.id, name: mt.name ?? "" }))
	const emptyMessage = describeEmptyMealTypes(scope)

	const weekLabel = formatWeekLabel(weekStart, template.name)

	const weekInputValue = formatWeekInputValue(weekStart)

	// Export .docx (Word): reaproveita os mesmos dados/ordem da grade do print.
	const handleDownloadDocx = () =>
		exportDocx(async (docx) => {
			const columns = WEEKDAYS.map((d) => {
				const date = dayDate(d.num)
				return { label: d.label, date: date ? format(date, "dd/MM") : null }
			})
			const rows = orderedMealTypes.map((mt) => ({
				meal: mt.name ?? "",
				cells: WEEKDAYS.map((d) =>
					(cellIndex.get(`${d.num}:${mt.id}`) ?? []).map((e) => ({
						name: e.name,
						main: e.main,
						demand: e.demand,
						color: options.groupColors ? e.color : null,
					}))
				),
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
					groupLegend,
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
		})

	return (
		<div>
			<style>{PRINT_CSS}</style>

			{/* Barra de ações — oculta na impressão */}
			<WeeklyActionBar
				scope={scope}
				templateId={templateId}
				weekInputValue={weekInputValue}
				onWeekChange={handleWeekChange}
				onDownloadDocx={handleDownloadDocx}
				isExporting={isExporting}
				ingredientsPending={ingredientsPending}
			/>

			{/* Opções de impressão — ocultas na impressão; valem só nesta página */}
			<WeeklyPrintOptionsBar
				options={options}
				onOptionsChange={updateOptions}
				hiddenCount={hiddenCount}
				digestsError={digestsError}
				onRetryDigests={retryDigests}
			/>

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
				groupColors={options.groupColors}
				groupLegend={groupLegend}
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
							groupColors={options.groupColors}
							groupLegend={groupLegend}
							emptyMessage={emptyMessage}
						/>
					</div>,
					document.body
				)}
		</div>
	)
}

// ─── Tela (fora da impressão) ──────────────────────────────────────────────

function WeeklyMenuNotFound({ scope }: { scope: PrintScope }) {
	return (
		<div className="p-8 text-center bg-destructive/10 text-destructive rounded-md">
			<p className="text-subheading">Cardápio semanal não encontrado.</p>
			{scope.kind === "kitchen" ? (
				<Link
					to="/kitchen/$kitchenId/weekly-menus"
					params={{ kitchenId: scope.kitchenIdStr }}
					className="text-sm text-primary mt-2 flex items-center justify-center hover:underline"
				>
					← Voltar para listagem
				</Link>
			) : (
				<Link to="/global/weekly-menus" className="text-sm text-primary mt-2 flex items-center justify-center hover:underline">
					← Voltar para listagem
				</Link>
			)}
		</div>
	)
}

interface WeeklyActionBarProps {
	scope: PrintScope
	templateId: string
	weekInputValue: string
	onWeekChange: (value: string) => void
	onDownloadDocx: () => void
	isExporting: boolean
	ingredientsPending: boolean
}

function WeeklyActionBar({ scope, templateId, weekInputValue, onWeekChange, onDownloadDocx, isExporting, ingredientsPending }: WeeklyActionBarProps) {
	return (
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
						<Link to="/global/weekly-menus/$weeklyMenuId" params={{ weeklyMenuId: templateId }}>
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
					onChange={(e) => onWeekChange(e.target.value)}
					className="h-9 rounded-none border border-input bg-background px-2 text-sm"
				/>
				<Button variant="outline" size="sm" onClick={onDownloadDocx} disabled={isExporting || ingredientsPending}>
					{isExporting ? <Loader2 className="size-4 mr-2 animate-spin" /> : <FileText className="size-4 mr-2" />}
					Baixar DOCX
				</Button>
				<Button size="sm" onClick={() => window.print()} disabled={ingredientsPending}>
					{ingredientsPending ? <Loader2 className="size-4 mr-2 animate-spin" /> : <Printer className="size-4 mr-2" />}
					Imprimir / Baixar PDF
				</Button>
			</div>
		</div>
	)
}

interface WeeklyPrintOptionsBarProps {
	options: CardapioPrintOptions
	onOptionsChange: (patch: Partial<CardapioPrintOptions>) => void
	hiddenCount: number
	digestsError: boolean
	onRetryDigests: () => void
}

function WeeklyPrintOptionsBar({ options, onOptionsChange: updateOptions, hiddenCount, digestsError, onRetryDigests }: WeeklyPrintOptionsBarProps) {
	return (
		<div className="cardapio-no-print flex flex-wrap items-center gap-x-6 gap-y-2 mb-4 text-sm">
			<label htmlFor="print-show-method" className="flex items-center gap-2">
				<Checkbox id="print-show-method" checked={options.showMethod} onCheckedChange={(checked) => updateOptions({ showMethod: checked === true })} />
				Mostrar modo de preparo
			</label>
			<label htmlFor="print-group-colors" className="flex items-center gap-2">
				<Checkbox id="print-group-colors" checked={options.groupColors} onCheckedChange={(checked) => updateOptions({ groupColors: checked === true })} />
				Cores por grupo
			</label>
			<IngredientsModeSelect value={options.ingredients} onChange={(ingredients) => updateOptions({ ingredients })} />
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
			{digestsError && <DigestsErrorNotice onRetry={onRetryDigests} />}
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
	/** Pinta cada preparação com a cor do grupo e mostra a legenda. */
	groupColors: boolean
	groupLegend: GroupLegendEntry[]
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
	groupColors,
	groupLegend,
	emptyMessage,
	editable = false,
	onSignatureChange,
	onHeaderChange,
}: CardapioDocumentProps) {
	return (
		<div className="cardapio-doc">
			<MenuPrintHeader header={header} editable={editable} onSignatureChange={onSignatureChange} onHeaderChange={onHeaderChange}>
				<div className="cardapio-week">{weekLabel}</div>
			</MenuPrintHeader>

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
												<div
													key={`${entry.name}-${i}`}
													className={entry.main ? "cardapio-dish cardapio-dish-main" : "cardapio-dish"}
													style={groupColors && entry.color ? { background: `#${entry.color}` } : undefined}
												>
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

			{groupColors && groupLegend.length > 0 && (
				<div className="cardapio-legend">
					{groupLegend.map((g) => (
						<span key={g.key} className="cardapio-legend-item">
							<span className="cardapio-legend-swatch" style={{ background: `#${g.color}` }} />
							{g.label}
						</span>
					))}
				</div>
			)}

			<MenuPrintFooter header={header} editable={editable} onSignatureChange={onSignatureChange} />
			<PreparationList preparations={preparations} />
		</div>
	)
}

// ─── CSS de impressão ──────────────────────────────────────────────────────

const PRINT_CSS = `${MENU_PRINT_DOCUMENT_CSS}
@media print {
	@page { size: A4 landscape; margin: 6mm; }
}
`
