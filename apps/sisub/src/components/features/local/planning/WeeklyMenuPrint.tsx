import { useQuery } from "@tanstack/react-query"
import { Link, useNavigate } from "@tanstack/react-router"
import { addDays, format, parseISO, startOfWeek } from "date-fns"
import { ptBR } from "date-fns/locale"
import { ArrowLeft, FileText, Loader2, Printer } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { useUserKitchens } from "@/hooks/data/useKitchens"
import { useTemplate } from "@/hooks/data/useTemplates"
import { menuItemGroupOrder } from "@/lib/menu-item-groups"
import { queryKeys } from "@/lib/query-keys"
import { fetchMealTypesFn } from "@/server/meal-types.fn"
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
 *    (localStorage), evitando redigitar a cada semana.
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
		const storedOrg = parsed.organization?.trim()
		const organization = !storedOrg || storedOrg === LEGACY_DEFAULT_ORG ? defaultOrg : storedOrg
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

	// Meal types: cozinha → genéricos + da cozinha; global → apenas genéricos
	// (kitchen_id null). fetchMealTypesFn aceita null; o hook useMealTypes não.
	const mealTypeKitchenId = scope.kind === "kitchen" ? scope.kitchenId : null
	const { data: mealTypes } = useQuery({
		queryKey: queryKeys.mealTypes.byKitchen(mealTypeKitchenId),
		queryFn: () => fetchMealTypesFn({ data: { kitchenId: mealTypeKitchenId } }),
		staleTime: 5 * 60 * 1000,
	})

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

	// Índice (dia → refeição → preparações), ordenadas por grupo canônico e depois posição.
	type CellEntry = { name: string; group: string | null; sortOrder: number; proportion: number | null }
	const cellIndex = new Map<string, CellEntry[]>()
	for (const item of template.items) {
		if (item.day_of_week == null || !item.meal_type_id) continue
		const key = `${item.day_of_week}:${item.meal_type_id}`
		const list = cellIndex.get(key) ?? []
		list.push({
			name: itemRecipeName(item),
			group: item.item_group ?? null,
			sortOrder: item.sort_order ?? 0,
			proportion: item.recommended_proportion ?? null,
		})
		cellIndex.set(key, list)
	}
	for (const list of cellIndex.values()) {
		list.sort((a, b) => menuItemGroupOrder(a.group) - menuItemGroupOrder(b.group) || a.sortOrder - b.sortOrder)
	}

	// Lista de preparações: receitas distintas com modo de preparo, ordenadas.
	const prepMap = new Map<string, { id: string; name: string; method: string }>()
	for (const item of template.items) {
		const r = item.recipe_origin
		const method = r?.preparation_method?.trim()
		if (!r || !method) continue
		if (!prepMap.has(r.id)) prepMap.set(r.id, { id: r.id, name: r.name?.trim() || "Preparação sem nome", method })
	}
	const preparations = Array.from(prepMap.values()).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))

	const dayDate = (dow: number): Date | null => (weekStart ? addDays(weekStart, dow - 1) : null)

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
		try {
			const { downloadCardapioDocx } = await import("@/lib/cardapio-docx")
			const columns = WEEKDAYS.map((d) => {
				const date = dayDate(d.num)
				return { label: d.label, date: date ? format(date, "dd/MM") : null }
			})
			const rows = orderedMealTypes.map((mt) => ({
				meal: mt.name ?? "",
				cells: WEEKDAYS.map((d) => (cellIndex.get(`${d.num}:${mt.id}`) ?? []).map((e) => ({ name: e.name, proportion: e.proportion }))),
			}))
			await downloadCardapioDocx(
				{
					organization: header.organization,
					section: header.section,
					title: header.title,
					weekLabel,
					signatures: header.signatures,
					columns,
					rows,
					preparations: preparations.map((p) => ({ name: p.name, method: p.method })),
				},
				`${header.title} - ${template.name ?? "cardapio"}`
			)
		} finally {
			setIsExporting(false)
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
					<Button variant="outline" size="sm" onClick={handleDownloadDocx} disabled={isExporting}>
						{isExporting ? <Loader2 className="size-4 mr-2 animate-spin" /> : <FileText className="size-4 mr-2" />}
						Baixar DOCX
					</Button>
					<Button size="sm" onClick={() => window.print()}>
						<Printer className="size-4 mr-2" />
						Imprimir / Baixar PDF
					</Button>
				</div>
			</div>

			{/* Documento */}
			<div id="cardapio-print" className="cardapio-doc">
				{/* Cabeçalho */}
				<header className="cardapio-header">
					<div className="cardapio-sign cardapio-sign-top">
						<SignatureField block={header.signatures[0]} onChange={(p) => setSignature(0, p)} />
					</div>
					<div className="cardapio-title-block">
						<EditableLine value={header.organization} onChange={(v) => persistHeader({ ...header, organization: v })} className="cardapio-org" />
						<EditableLine value={header.section} onChange={(v) => persistHeader({ ...header, section: v })} className="cardapio-section" />
						<EditableLine value={header.title} onChange={(v) => persistHeader({ ...header, title: v })} className="cardapio-doctitle" />
						<div className="cardapio-week">{weekLabel}</div>
					</div>
					<div className="cardapio-sign cardapio-sign-top cardapio-sign-right">
						<SignatureField block={header.signatures[1]} onChange={(p) => setSignature(1, p)} />
					</div>
				</header>

				{/* Grade refeição × dia */}
				<table className="cardapio-grid">
					<thead>
						<tr>
							<th className="cardapio-meal-col">REFEIÇÃO / DIA</th>
							{WEEKDAYS.map((d) => {
								const date = dayDate(d.num)
								const weekend = d.num >= 6
								return (
									<th key={d.num} className={weekend ? "cardapio-weekend" : undefined}>
										<div>{d.label.toUpperCase()}</div>
										{date && <div className="cardapio-daynum">{format(date, "dd/MM")}</div>}
									</th>
								)
							})}
						</tr>
					</thead>
					<tbody>
						{orderedMealTypes.length === 0 ? (
							<tr>
								<td colSpan={8} className="cardapio-empty">
									{scope.kind === "kitchen" ? "Nenhum tipo de refeição configurado para esta cozinha." : "Nenhum tipo de refeição genérico configurado."}
								</td>
							</tr>
						) : (
							orderedMealTypes.map((mt) => (
								<tr key={mt.id}>
									<th className="cardapio-meal-col">{(mt.name ?? "").toUpperCase()}</th>
									{WEEKDAYS.map((d) => {
										const entries = cellIndex.get(`${d.num}:${mt.id}`) ?? []
										const weekend = d.num >= 6
										return (
											<td key={d.num} className={weekend ? "cardapio-weekend" : undefined}>
												{entries.map((entry, i) => (
													<div key={`${entry.name}-${i}`} className="cardapio-dish">
														{entry.name.toUpperCase()}
														{entry.proportion != null && <span className="cardapio-dish-prop"> {entry.proportion}%</span>}
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

				{/* Lista de preparações */}
				{preparations.length > 0 && (
					<section className="cardapio-preps">
						<div className="cardapio-preps-title">LISTA DE PREPARAÇÕES</div>
						<ul>
							{preparations.map((p) => (
								<li key={p.id}>
									<span className="cardapio-prep-name">{p.name.toUpperCase()}</span>
									{" — "}
									<span className="cardapio-prep-method">{p.method}</span>
								</li>
							))}
						</ul>
					</section>
				)}

				{/* Assinaturas do rodapé */}
				<footer className="cardapio-footer">
					<div className="cardapio-sign">
						<SignatureField block={header.signatures[2]} onChange={(p) => setSignature(2, p)} />
					</div>
					<div className="cardapio-sign cardapio-sign-right">
						<SignatureField block={header.signatures[3]} onChange={(p) => setSignature(3, p)} />
					</div>
				</footer>
			</div>
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
.cardapio-dish-prop { font-weight: 700; color: #333; }
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
.cardapio-footer {
	display: grid;
	grid-template-columns: 1fr 1fr;
	gap: 24px;
	margin-top: 16px;
}

@media print {
	@page { size: A4 landscape; margin: 6mm; }
	body { background: #fff !important; }
	body * { visibility: hidden !important; }
	#cardapio-print, #cardapio-print * { visibility: visible !important; }
	#cardapio-print {
		position: absolute;
		left: 0;
		top: 0;
		width: 100%;
	}
	.cardapio-no-print { display: none !important; }
	.cardapio-doc { border: none; padding: 0; max-width: none; }
	.cardapio-editable:hover, .cardapio-editable:focus { background: transparent !important; }
}
`
