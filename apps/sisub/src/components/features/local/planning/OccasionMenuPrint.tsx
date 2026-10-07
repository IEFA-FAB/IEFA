import { useQuery } from "@tanstack/react-query"
import { Link, type LinkOptions } from "@tanstack/react-router"
import { format, parseISO } from "date-fns"
import { ptBR } from "date-fns/locale"
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
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { useTemplateRecipeVersions } from "@/hooks/business/useTemplateRecipeVersions"
import { mealTypesQueryOptions } from "@/hooks/data/useMealTypes"
import { useRecipes } from "@/hooks/data/useRecipes"
import { useSnackMealType } from "@/hooks/data/useSnackRequests"
import { useTemplate } from "@/hooks/data/useTemplates"
import { buildPreparationEntries, type CardapioPrintOptions, describeAllergens, type PreparationEntry, type PreparationSource } from "@/lib/cardapio-print"
import { OCCASION_MENU_COPY, type OccasionMenuType, SNACK_MEAL_TYPE_NAME } from "@/lib/occasion-menu"
import { buildOccasionPrintMeals, OCCASION_PRINT_TITLE, type OccasionPrintMeal, occasionPrintSubtitle } from "@/lib/occasion-print"
import { describeRecipeVersion } from "@/lib/recipe-versions"

/**
 * OccasionMenuPrint — visão imprimível / "baixar PDF" de um evento ou cardápio de apoio, irmã de
 * `WeeklyMenuPrint`: mesmo cabeçalho com assinaturas, mesma lista de preparações, mesmas opções de
 * modo de preparo e ingredientes, e o mesmo par impressão (`window.print()`) + DOCX.
 *
 * O corpo muda: evento e apoio não têm dia, e cada refeição tem a própria composição. A folha sai
 * em retrato, um bloco por refeição (nome, horário, efetivo ou kits) com os grupos em linhas.
 *
 * O cabeçalho (OM, seção, assinaturas) é o mesmo guardado pelo semanal no armazenamento local —
 * mesma chave, por cozinha —, e o título não é gravado: o guardado é o do semanal, e a folha do
 * evento abre com o título dela. Data opcional na URL (`?date=`), para datar o evento.
 */

interface OccasionMenuPrintProps {
	templateId: string
	templateType: OccasionMenuType
	scope: PrintScope
	/** Data do evento (YYYY-MM-DD), opcional. */
	date?: string
	onDateChange: (date: string | undefined) => void
	editorLink: LinkOptions
	listLink: LinkOptions
}

type OccasionPrintOptions = Pick<CardapioPrintOptions, "showMethod" | "ingredients">

export function OccasionMenuPrint({ templateId, templateType, scope, date, onDateChange, editorLink, listLink }: OccasionMenuPrintProps) {
	const copy = OCCASION_MENU_COPY[templateType]
	const isSupportMenu = templateType === "apoio"
	const kitchenId = scope.kind === "kitchen" ? scope.kitchenId : null
	const { data: template, isLoading } = useTemplate(templateId)

	// Versão das fichas na lista de preparações, como no semanal.
	const { data: catalog } = useRecipes({ kitchen_id: kitchenId })
	const recipeRefs = useMemo(() => (template?.items ?? []).flatMap((i) => (i.recipe_id ? [{ recipe_id: i.recipe_id }] : [])), [template])
	const { outdatedById } = useTemplateRecipeVersions(template?.items, catalog, recipeRefs)

	// Horários: os da cozinha (no catálogo global, só os genéricos — o nulo é intencional) e o de
	// sistema dos lanches, que `fetchMealTypes` não devolve.
	const { data: mealTypes } = useQuery({ ...mealTypesQueryOptions(kitchenId), enabled: true })
	const { data: snackMealType } = useSnackMealType(isSupportMenu)

	const storageScope = printStorageScope(scope)
	const organizationName = useMenuPrintOrganization(scope)
	const [header, setHeader] = useState<PrintHeader>(DEFAULT_HEADER)
	const [title, setTitle] = useState(OCCASION_PRINT_TITLE[templateType])
	const { isExporting, exportDocx } = useDocxExport()
	const [options, setOptions] = useState<OccasionPrintOptions>({ showMethod: true, ingredients: "none" })

	// Cabeçalho só no cliente (localStorage) — evita divergência de hidratação no SSR.
	useEffect(() => {
		setHeader(loadHeader(storageScope, organizationName))
	}, [storageScope, organizationName])

	const meals = useMemo(() => {
		if (!template) return []
		const slotNameOf = (mealTypeId: string) =>
			mealTypes?.find((mt) => mt.id === mealTypeId)?.name ?? (snackMealType?.id === mealTypeId ? (snackMealType.name ?? SNACK_MEAL_TYPE_NAME) : null)
		return buildOccasionPrintMeals(template, templateType, slotNameOf, snackMealType?.id ?? null)
	}, [template, templateType, mealTypes, snackMealType])

	// Só as fichas que saem na folha: as das preparações colocadas numa refeição.
	const printedRecipeIds = useMemo(() => new Set(meals.flatMap((m) => m.groups.flatMap((g) => g.entries.map((e) => e.recipeId)))), [meals])
	const originIds = useMemo(
		() => [
			...new Set((template?.items ?? []).flatMap((i) => (i.recipe_id && printedRecipeIds.has(i.recipe_id) && i.recipe_origin?.id ? [i.recipe_origin.id] : []))),
		],
		[template, printedRecipeIds]
	)
	const { digestsById, pending: ingredientsPending, isError: digestsError, retry: retryDigests } = usePreparationDigests(originIds, options.ingredients)

	// A cópia de impressão só existe no cliente — createPortal exige `document`.
	const [mounted, setMounted] = useState(false)
	useEffect(() => setMounted(true), [])

	if (isLoading) {
		return (
			<div className="flex justify-center p-12">
				<Loader2 className="size-8 animate-spin text-muted-foreground" />
			</div>
		)
	}

	// Outro tipo de cardápio, ou de outra cozinha, não se imprime por esta rota: a folha sairia
	// com o cabeçalho de uma OM que não é a dele.
	const outOfContext =
		template != null &&
		(template.template_type !== templateType ||
			(scope.kind === "global" && template.kitchen_id != null) ||
			(scope.kind === "kitchen" && template.kitchen_id != null && template.kitchen_id !== scope.kitchenId))
	if (!template || outOfContext) {
		return (
			<div className="p-8 text-center bg-destructive/10 text-destructive rounded-md">
				<p className="text-subheading">
					{copy.singular} não {copy.article === "o" ? "encontrado" : "encontrada"}.
				</p>
				<Link {...listLink} className="text-sm text-primary mt-2 flex items-center justify-center hover:underline">
					← Voltar para {copy.plural.toLowerCase()}
				</Link>
			</div>
		)
	}

	const shownHeader: PrintHeader = { ...header, title }
	// O título não vai para o armazenamento: o guardado (em `header`) é o do semanal.
	const persistHeader = (next: PrintHeader) => {
		setTitle(next.title)
		const stored = { ...next, title: header.title }
		setHeader(stored)
		saveHeader(storageScope, stored)
	}
	const setSignature = (idx: number, patch: Partial<SignatureBlock>) => {
		const signatures = header.signatures.map((s, i) => (i === idx ? { ...s, ...patch } : s)) as PrintHeader["signatures"]
		persistHeader({ ...shownHeader, signatures })
	}

	// Lista de preparações: fichas distintas da folha, com preparo e/ou ingredientes conforme as opções.
	const prepMap = new Map<string, PreparationSource>()
	for (const item of template.items) {
		const r = item.recipe_origin
		if (!r || !item.recipe_id || !printedRecipeIds.has(item.recipe_id) || prepMap.has(r.id)) continue
		prepMap.set(r.id, {
			id: r.id,
			name: r.name?.trim() || "Preparação sem nome",
			version: describeRecipeVersion(r.version ?? 1, outdatedById.get(r.id)),
			prePreparation: r.pre_preparation_method?.trim() || null,
			method: r.preparation_method?.trim() || null,
		})
	}
	const preparations = buildPreparationEntries([...prepMap.values()], digestsById, options)

	const subtitle = occasionPrintSubtitle(template)
	const parsedDate = date ? parseISO(date) : null
	const dateLabel = parsedDate && !Number.isNaN(parsedDate.getTime()) ? format(parsedDate, "dd 'de' MMMM 'de' yyyy", { locale: ptBR }).toUpperCase() : ""

	const handleDownloadDocx = () =>
		exportDocx((docx) =>
			docx.downloadOccasionDocx(
				{
					organization: header.organization,
					section: header.section,
					title,
					subtitle,
					dateLabel,
					signatures: header.signatures,
					meals: meals.map((m) => ({ name: m.name, slotName: m.slotName, base: m.base, groups: m.groups })),
					preparations: preparations.map((p) => ({
						name: p.name,
						version: p.version,
						prePreparation: p.prePreparation,
						method: p.method,
						ingredients: p.ingredients,
						allergens: describeAllergens(p),
					})),
				},
				`${title} - ${template.name ?? copy.noun}`
			)
		)

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
						<Link {...editorLink}>
							<ArrowLeft className="size-4 mr-2" />
							Voltar ao editor
						</Link>
					}
				/>
				<div className="flex items-center gap-2 ml-auto">
					<label htmlFor="occasion-date" className="text-xs text-muted-foreground">
						Data:
					</label>
					<Input id="occasion-date" type="date" className="w-40" value={date ?? ""} onChange={(e) => onDateChange(e.target.value || undefined)} />
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
				<label htmlFor="occasion-show-method" className="flex items-center gap-2">
					<Checkbox
						id="occasion-show-method"
						checked={options.showMethod}
						onCheckedChange={(checked) => setOptions((prev) => ({ ...prev, showMethod: checked === true }))}
					/>
					Mostrar modo de preparo
				</label>
				<IngredientsModeSelect value={options.ingredients} onChange={(ingredients) => setOptions((prev) => ({ ...prev, ingredients }))} />
				{digestsError && <DigestsErrorNotice onRetry={retryDigests} />}
			</div>

			{/* Documento — cópia editável, na tela */}
			<OccasionDocument
				editable
				header={shownHeader}
				subtitle={subtitle}
				dateLabel={dateLabel}
				meals={meals}
				preparations={preparations}
				onSignatureChange={setSignature}
				onHeaderChange={persistHeader}
			/>

			{/* Cópia de impressão num portal no <body> — o porquê está em WeeklyMenuPrint. */}
			{mounted &&
				createPortal(
					<div className="cardapio-print-portal">
						<OccasionDocument header={shownHeader} subtitle={subtitle} dateLabel={dateLabel} meals={meals} preparations={preparations} />
					</div>,
					document.body
				)}
		</div>
	)
}

// ─── Documento ─────────────────────────────────────────────────────────────

interface OccasionDocumentProps {
	header: PrintHeader
	subtitle: string
	dateLabel: string
	meals: OccasionPrintMeal[]
	preparations: PreparationEntry[]
	editable?: boolean
	onSignatureChange?: (idx: number, patch: Partial<SignatureBlock>) => void
	onHeaderChange?: (next: PrintHeader) => void
}

function OccasionDocument({ header, subtitle, dateLabel, meals, preparations, editable = false, onSignatureChange, onHeaderChange }: OccasionDocumentProps) {
	return (
		<div className="cardapio-doc cardapio-occasion">
			<MenuPrintHeader header={header} editable={editable} onSignatureChange={onSignatureChange} onHeaderChange={onHeaderChange}>
				{subtitle && <div className="cardapio-week">{subtitle}</div>}
				{dateLabel && <div className="cardapio-week">{dateLabel}</div>}
			</MenuPrintHeader>

			{meals.length === 0 ? (
				<p className="cardapio-empty">Nenhuma refeição cadastrada.</p>
			) : (
				meals.map((meal) => (
					<table key={meal.id} className="cardapio-grid cardapio-occasion-meal">
						{/* Com `table-layout: fixed`, quem define as larguras é a 1ª linha — o título, em `colSpan`. */}
						<colgroup>
							<col className="cardapio-occasion-group-col" />
							<col />
						</colgroup>
						<thead>
							<tr>
								<th colSpan={2}>
									{meal.name}
									{meal.slotName && <span className="cardapio-occasion-meta"> ({meal.slotName})</span>}
									{meal.base && <span className="cardapio-occasion-meta"> · {meal.base}</span>}
								</th>
							</tr>
						</thead>
						<tbody>
							{meal.groups.length === 0 ? (
								<tr>
									<td colSpan={2} className="cardapio-empty">
										Sem preparações
									</td>
								</tr>
							) : (
								meal.groups.map((group) => {
									const entries = group.entries.map((entry) => (
										<div key={entry.recipeId} className={entry.main ? "cardapio-dish cardapio-dish-main" : "cardapio-dish"}>
											{entry.name}
											{entry.demand && <span className="cardapio-dish-prop"> {entry.demand}</span>}
										</div>
									))
									return group.label == null ? (
										<tr key="kit">
											<td colSpan={2}>{entries}</td>
										</tr>
									) : (
										<tr key={group.key ?? "sem-grupo"}>
											<th className="cardapio-meal-col">{group.label}</th>
											<td>{entries}</td>
										</tr>
									)
								})
							)}
						</tbody>
					</table>
				))
			)}

			<MenuPrintFooter header={header} editable={editable} onSignatureChange={onSignatureChange} />
			<PreparationList preparations={preparations} />
		</div>
	)
}

// ─── CSS de impressão ──────────────────────────────────────────────────────

/** Retrato e letra maior que a do semanal: sem a grade de sete dias, a folha tem espaço. */
const PRINT_CSS = `${MENU_PRINT_DOCUMENT_CSS}
.cardapio-occasion { max-width: 820px; font-size: 10px; }
.cardapio-occasion .cardapio-occasion-meal { margin-bottom: 8px; break-inside: avoid; page-break-inside: avoid; }
.cardapio-occasion .cardapio-occasion-meal thead th { text-align: left; font-size: 10px; padding: 3px 4px; }
.cardapio-occasion-meta { font-weight: 400; }
.cardapio-occasion .cardapio-occasion-group-col { width: 140px; }
.cardapio-occasion .cardapio-meal-col { width: auto; font-size: 9px; }
.cardapio-occasion .cardapio-empty { padding: 4px; font-size: 9px; }
.cardapio-occasion .cardapio-dish { font-size: 10px; }
.cardapio-occasion .cardapio-sign { font-size: 9px; }
.cardapio-occasion .cardapio-preps li { font-size: 9px; }
@media print {
	@page { size: A4 portrait; margin: 10mm; }
	.cardapio-occasion { max-width: none; }
}
`
