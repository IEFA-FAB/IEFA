import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { ArrowLeft, Loader2, Printer } from "lucide-react"
import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { Button } from "@/components/ui/button"
import { useRecipe } from "@/hooks/data/useRecipe"
import { useRecipeFolders } from "@/hooks/data/useRecipeFolders"
import { recipeLastReviewQueryOptions } from "@/hooks/data/useRecipes"
import { formatSheetNumber, portionYieldOrOne, technicalSheetLine, technicalSheetTotals } from "@/lib/technical-sheet"
import type { RecipeWithIngredients } from "@/types/domain/recipes"

/**
 * Ficha Técnica de Preparação (FTP) imprimível — reprodução do modelo oficial da SIA
 * (`docs/examples/Modelo_FTP_SIA.pdf`), as cinco partes na ordem do papel.
 *
 * Impressão por `window.print()` (o diálogo do navegador oferece "Salvar como PDF"), em
 * A4 retrato, sem dependência de geração de PDF. Mesma técnica do cardápio semanal
 * (`WeeklyMenuPrint`): a folha vai num portal direto no `<body>`, porque a cópia da tela
 * vive dentro do app-shell (`h-screen overflow-hidden`), que recorta tudo além da
 * primeira dobra na hora de imprimir.
 *
 * Campo que o modelo pede e o SISUB não guarda (pré-preparo, método de cocção,
 * equipamentos, temperatura, observações técnicas, responsável) sai como linha em branco,
 * exatamente como no formulário em papel — a Seção completa à mão. Imprimir "—" ali daria
 * a entender que a informação foi consultada e não existe; a linha diz que é para
 * preencher. Quando esses campos entrarem no cadastro, é aqui que eles aparecem.
 */

interface RecipeTechnicalSheetPrintProps {
	recipeId: string
	/** Rota de volta — a ficha é aberta tanto do catálogo global quanto do de uma cozinha. */
	back:
		| { to: "/global/recipes/$recipeId"; params: { recipeId: string } }
		| { to: "/kitchen/$kitchenId/recipes/$recipeId"; params: { kitchenId: string; recipeId: string } }
}

function formatDate(iso: string | null | undefined): string {
	if (!iso) return ""
	const date = new Date(iso)
	return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })
}

export function RecipeTechnicalSheetPrint({ recipeId, back }: RecipeTechnicalSheetPrintProps) {
	const { data: recipe, isLoading, error } = useRecipe(recipeId)
	const { nameById: folderNameById } = useRecipeFolders()
	const { data: lastReview } = useQuery(recipeLastReviewQueryOptions(recipeId))

	// A cópia de impressão só existe no cliente — createPortal exige `document`.
	const [mounted, setMounted] = useState(false)
	useEffect(() => setMounted(true), [])

	if (isLoading) {
		return (
			<div className="flex items-center justify-center py-24">
				<Loader2 className="size-8 animate-spin text-muted-foreground" />
			</div>
		)
	}

	if (error || !recipe) {
		return <div className="border border-destructive/20 bg-destructive/10 p-8 text-center text-destructive">Não foi possível carregar a preparação.</div>
	}

	const detail = recipe as RecipeWithIngredients
	const sheet = buildSheet(detail, folderNameById, lastReview ?? null)

	return (
		<div>
			<style>{PRINT_CSS}</style>

			<div className="ftp-no-print mb-4 flex flex-wrap items-center gap-2">
				<Button
					variant="outline"
					size="sm"
					nativeButton={false}
					render={
						// biome-ignore lint/suspicious/noExplicitAny: união de rotas (global × cozinha) — os params já vêm casados com o `to`
						<Link {...(back as any)}>
							<ArrowLeft className="size-4 mr-2" />
							Voltar ao editor
						</Link>
					}
				/>
				<Button size="sm" className="ml-auto" onClick={() => window.print()}>
					<Printer className="size-4 mr-2" />
					Imprimir / Baixar PDF
				</Button>
			</div>

			<TechnicalSheetDocument sheet={sheet} />

			{mounted && createPortal(<div className="ftp-print-portal">{<TechnicalSheetDocument sheet={sheet} />}</div>, document.body)}
		</div>
	)
}

// ─── Modelo de dados da folha ──────────────────────────────────────────────

interface SheetLine {
	name: string
	unit: string
	grossWeight: number
	correctionFactor: number
	netWeight: number
	rehydrationIndex: number
	rehydratedWeight: number
	isOptional: boolean
}

interface Sheet {
	name: string
	category: string
	portionYield: number
	/** Peso de UMA porção — a soma dos pesos líquidos per capita. */
	portionWeight: number
	/** Rendimento final — o peso líquido total da preparação. */
	finalYield: number
	cookingIndex: number | null
	lines: SheetLine[]
	totals: { grossWeight: number; netWeight: number; rehydratedWeight: number }
	mixedUnits: string[]
	preparationMethod: string
	totalTimeMinutes: number | null
	elaboratedAt: string
	reviewedAt: string
	reviewedBy: string
	version: number | null
}

function buildSheet(
	recipe: RecipeWithIngredients,
	folderNameById: Map<string, string>,
	lastReview: { reviewed_at: string; reviewed_by_name: string | null } | null
): Sheet {
	const portionYield = portionYieldOrOne(recipe.portion_yield)
	const ingredients = (recipe.ingredients ?? []).filter((ri) => !ri.deleted_at)
	const lines: SheetLine[] = ingredients
		.slice()
		.sort((a, b) => Number(a.is_optional ?? false) - Number(b.is_optional ?? false) || (a.priority_order ?? 999) - (b.priority_order ?? 999))
		.map((ri) => {
			const computed = technicalSheetLine(
				{ netQuantity: ri.net_quantity, correctionFactor: ri.correction_factor, rehydrationIndex: ri.rehydration_index },
				recipe.portion_yield
			)
			return {
				name: ri.ingredient?.description ?? ri.frozen_preparation?.description ?? "Ingrediente",
				unit: ri.ingredient?.measure_unit ?? ri.frozen_preparation?.measure_unit ?? "",
				isOptional: ri.is_optional ?? false,
				...computed,
			}
		})

	const totals = technicalSheetTotals(lines.map((l) => ({ ...l, measureUnit: l.unit })))

	return {
		name: recipe.name,
		category: recipe.folder_id ? (folderNameById.get(recipe.folder_id) ?? "") : "",
		portionYield,
		portionWeight: totals.netWeight,
		finalYield: totals.netWeight * portionYield,
		cookingIndex: recipe.cooking_factor ?? null,
		lines,
		totals,
		mixedUnits: totals.units.length > 1 ? totals.units : [],
		preparationMethod: recipe.preparation_method ?? "",
		totalTimeMinutes: recipe.preparation_time_minutes ?? null,
		elaboratedAt: formatDate(recipe.created_at),
		reviewedAt: formatDate(lastReview?.reviewed_at),
		reviewedBy: lastReview?.reviewed_by_name ?? "",
		version: recipe.version ?? null,
	}
}

// ─── Documento ─────────────────────────────────────────────────────────────

/** Célula de valor: o dado quando existe, uma linha para preencher à mão quando não. */
function Value({ children }: { children?: string | number | null }) {
	const text = children == null || children === "" ? null : String(children)
	return <td className="ftp-value">{text ?? <span className="ftp-blank" />}</td>
}

function Label({ children }: { children: React.ReactNode }) {
	return <th className="ftp-label">{children}</th>
}

/** Bloco de texto livre; sem conteúdo, imprime pautas para escrever à mão. */
function FreeText({ value, lines }: { value: string; lines: number }) {
	if (value.trim()) return <p className="ftp-freetext">{value}</p>
	return (
		<div className="ftp-rules">
			{/* Pautas em branco: só posição, sem identidade própria — a chave é o índice. */}
			{Array.from({ length: lines }, (_, i) => (
				<span key={`rule-${i}`} className="ftp-rule" />
			))}
		</div>
	)
}

function TechnicalSheetDocument({ sheet }: { sheet: Sheet }) {
	return (
		<div className="ftp-doc">
			<h1 className="ftp-title">FICHA TÉCNICA DE PREPARAÇÃO – FTP</h1>

			<h2 className="ftp-part">PARTE 01 – INFORMAÇÕES DA RECEITA</h2>
			<table className="ftp-table ftp-info">
				<tbody>
					<tr>
						<Label>Preparação:</Label>
						<Value>{sheet.name}</Value>
						<Label>Categoria:</Label>
						<Value>{sheet.category}</Value>
					</tr>
					<tr>
						<Label>Nº de porções:</Label>
						<Value>{`${formatSheetNumber(sheet.portionYield, 0)} porções`}</Value>
						<Label>Peso da porção:</Label>
						<Value>{sheet.portionWeight > 0 ? `${formatSheetNumber(sheet.portionWeight)}${unitSuffix(sheet)}` : ""}</Value>
					</tr>
					<tr>
						<Label>Rendimento final:</Label>
						<Value>{sheet.finalYield > 0 ? `${formatSheetNumber(sheet.finalYield, 2)}${unitSuffix(sheet)}` : ""}</Value>
						<Label>Índice de Cocção (IC):</Label>
						<Value>{sheet.cookingIndex != null ? formatSheetNumber(sheet.cookingIndex, 2) : ""}</Value>
					</tr>
				</tbody>
			</table>

			<h2 className="ftp-part">PARTE 02 – INGREDIENTES E PRÉ-PREPARO</h2>
			<table className="ftp-table ftp-ingredients">
				<thead>
					<tr>
						<th rowSpan={2}>Ingrediente</th>
						<th rowSpan={2}>Unidade</th>
						<th colSpan={5}>PER CAPITA</th>
					</tr>
					<tr>
						<th>PB</th>
						<th>FC</th>
						<th>PL</th>
						<th>IR</th>
						<th>Peso reidratado</th>
					</tr>
				</thead>
				<tbody>
					{sheet.lines.length === 0 ? (
						<tr>
							<td colSpan={7} className="ftp-empty">
								Sem ingredientes cadastrados.
							</td>
						</tr>
					) : (
						sheet.lines.map((line) => (
							<tr key={`${line.name}-${line.netWeight}`}>
								<td>
									{line.name}
									{line.isOptional && <span className="ftp-optional"> (opcional)</span>}
								</td>
								<td>{line.unit}</td>
								<td className="ftp-num">{formatSheetNumber(line.grossWeight)}</td>
								<td className="ftp-num">{formatSheetNumber(line.correctionFactor, 2)}</td>
								<td className="ftp-num">{formatSheetNumber(line.netWeight)}</td>
								<td className="ftp-num">{formatSheetNumber(line.rehydrationIndex, 2)}</td>
								<td className="ftp-num">{formatSheetNumber(line.rehydratedWeight)}</td>
							</tr>
						))
					)}
					<tr className="ftp-total">
						<td colSpan={2}>TOTAL</td>
						<td className="ftp-num">{formatSheetNumber(sheet.totals.grossWeight)}</td>
						<td />
						<td className="ftp-num">{formatSheetNumber(sheet.totals.netWeight)}</td>
						<td />
						<td className="ftp-num">{formatSheetNumber(sheet.totals.rehydratedWeight)}</td>
					</tr>
				</tbody>
			</table>
			<p className="ftp-legend">PB = Peso Bruto | PL = Peso Líquido | FC = PB ÷ PL | IR = Peso reidratado ÷ Peso seco</p>
			{sheet.mixedUnits.length > 0 && <p className="ftp-legend">TOTAL soma unidades diferentes ({sheet.mixedUnits.join(", ")}) — use como referência.</p>}

			<h2 className="ftp-part">PARTE 03 – TÉCNICA DE PREPARO</h2>
			<p className="ftp-field-label">Pré-preparo:</p>
			<FreeText value="" lines={2} />
			<p className="ftp-field-label">Modo de preparo:</p>
			<FreeText value={sheet.preparationMethod} lines={4} />

			<h2 className="ftp-part">PARTE 04 – TEMPO E EQUIPAMENTOS</h2>
			<table className="ftp-table ftp-info">
				<tbody>
					<tr>
						<Label>Tempo de pré-preparo</Label>
						<Value />
						<Label>Tempo de cocção</Label>
						<Value />
					</tr>
					<tr>
						<Label>Tempo total</Label>
						<Value>{sheet.totalTimeMinutes ? `${sheet.totalTimeMinutes} min` : ""}</Value>
						<Label>Método de cocção</Label>
						<Value />
					</tr>
					<tr>
						<Label>Equipamentos</Label>
						<Value />
						<Label>Temperatura</Label>
						<Value />
					</tr>
				</tbody>
			</table>

			<h2 className="ftp-part">PARTE 05 – OBSERVAÇÕES TÉCNICAS</h2>
			<FreeText value="" lines={3} />

			<table className="ftp-table ftp-info ftp-signoff">
				<tbody>
					<tr>
						<Label>Data de elaboração</Label>
						<Value>{sheet.elaboratedAt}</Value>
						<Label>Data de revisão</Label>
						<Value>{sheet.reviewedAt}</Value>
					</tr>
					<tr>
						<Label>Responsável técnico</Label>
						<Value>{sheet.reviewedBy}</Value>
						<Label>Versão da FTP</Label>
						<Value>{sheet.version != null ? `v${sheet.version}` : ""}</Value>
					</tr>
				</tbody>
			</table>

			<p className="ftp-footer">FTP – Ficha Técnica de Preparação | SIA</p>
		</div>
	)
}

/** Unidade a anexar aos pesos agregados — só quando a ficha inteira usa uma só. */
function unitSuffix(sheet: Sheet): string {
	if (sheet.mixedUnits.length > 0) return ""
	const unit = sheet.lines.find((l) => l.unit)?.unit
	return unit ? ` ${unit}` : ""
}

const PRINT_CSS = `
.ftp-doc {
	background: #fff;
	color: #000;
	max-width: 210mm;
	margin: 0 auto;
	padding: 12mm;
	border: 1px solid #e5e5e5;
	font-family: Arial, Helvetica, sans-serif;
	font-size: 11px;
	line-height: 1.35;
}
.ftp-title { text-align: center; font-size: 15px; font-weight: 700; margin: 0 0 18px; }
.ftp-part { text-align: center; font-size: 12px; font-weight: 700; margin: 18px 0 8px; }
.ftp-table { width: 100%; border-collapse: collapse; }
.ftp-table th, .ftp-table td { border: 1px solid #000; padding: 3px 6px; vertical-align: middle; }
.ftp-info { width: 92%; margin: 0 auto; }
.ftp-label { background: #dce6f1; text-align: right; font-weight: 700; width: 22%; white-space: nowrap; }
.ftp-value { width: 28%; }
.ftp-ingredients { width: 92%; margin: 0 auto; }
.ftp-ingredients thead th { background: #dce6f1; text-align: center; font-weight: 700; }
.ftp-num { text-align: right; font-variant-numeric: tabular-nums; }
.ftp-total td { font-weight: 700; }
.ftp-empty { text-align: center; color: #555; }
.ftp-optional { color: #555; }
.ftp-legend { width: 92%; margin: 4px auto 0; font-size: 10px; }
.ftp-field-label { font-weight: 700; margin: 10px 0 6px; }
.ftp-freetext { white-space: pre-wrap; margin: 0 0 6px; }
/* Pautas para completar à mão — mesmas linhas do formulário em papel. */
.ftp-rules { display: flex; flex-direction: column; gap: 14px; margin: 6px 0 10px; }
.ftp-rule { display: block; border-bottom: 1px solid #000; height: 0; }
.ftp-blank { display: inline-block; min-width: 60%; border-bottom: 1px solid #000; height: 12px; }
.ftp-signoff { margin-top: 22px; }
.ftp-footer { text-align: center; font-size: 10px; margin-top: 18px; }

/* Cópia de impressão (portal no <body>): existe só para o @media print. */
.ftp-print-portal { display: none; }

@media print {
	@page { size: A4 portrait; margin: 10mm; }
	body { background: #fff !important; }
	/*
	 * Só a cópia do portal vai para o papel: ela é filha direta do <body>, em fluxo
	 * normal — sem ancestral com overflow para recortá-la e sem caixa posicionada
	 * impedindo a fragmentação entre páginas.
	 */
	body > *:not(.ftp-print-portal) { display: none !important; }
	.ftp-print-portal { display: block !important; }
	.ftp-no-print { display: none !important; }
	.ftp-doc { border: none; padding: 0; max-width: none; }
	.ftp-part { break-after: avoid; page-break-after: avoid; }
	.ftp-table { break-inside: auto; }
	.ftp-table tr { break-inside: avoid; page-break-inside: avoid; }
}
`
