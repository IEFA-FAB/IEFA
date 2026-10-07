import { type ReactNode, useMemo } from "react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useUserKitchens } from "@/hooks/data/useKitchens"
import { describeAllergens, INGREDIENTS_MODE_LABELS, INGREDIENTS_MODES, type IngredientsMode, type PreparationEntry } from "@/lib/cardapio-print"

/**
 * Peças comuns às folhas impressas de cardápio — semanal (`WeeklyMenuPrint`) e evento/apoio
 * (`OccasionMenuPrint`): cabeçalho com assinaturas memorizado por escopo, campos editáveis da
 * cópia da tela, seletor de ingredientes e o CSS do documento.
 */

export type SignatureBlock = { name: string; role: string }

export type PrintHeader = {
	organization: string
	section: string
	title: string
	signatures: [SignatureBlock, SignatureBlock, SignatureBlock, SignatureBlock]
}

/**
 * Escopo de origem do modelo — define de onde vêm os meal types, a chave de
 * persistência do cabeçalho e os destinos de navegação.
 * `kitchen` = cozinha local; `global` = modelo da SDAB (kitchen_id null).
 */
export type PrintScope = { kind: "kitchen"; kitchenId: number; kitchenIdStr: string } | { kind: "global" }

/**
 * Nome da OM/organização impresso no topo. Antes era hardcoded como EEAR; hoje
 * vem dinâmico do escopo (unidade da cozinha, ou SDAB no modelo global).
 */
const GLOBAL_ORGANIZATION = "SUBDIRETORIA DE ADMINISTRAÇÃO DA AERONÁUTICA"
/** Valor hardcoded legado; migrado p/ o nome dinâmico quando reencontrado no localStorage. */
const LEGACY_DEFAULT_ORG = "ESCOLA DE ESPECIALISTAS DE AERONÁUTICA"

export const DEFAULT_HEADER: PrintHeader = {
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

/**
 * Chave do cabeçalho no armazenamento local: uma por cozinha e uma para o modelo global, como
 * declarado no inventário da Política de Cookies. Evento e apoio usam a MESMA chave do semanal
 * (mesma OM, mesmos signatários): chave nova exigiria versão nova da política.
 */
function headerStorageKey(scope: string) {
	return `sisub:cardapio-print-header:${scope}`
}

/** Chave de armazenamento do escopo. */
export function printStorageScope(scope: PrintScope): string {
	return scope.kind === "kitchen" ? String(scope.kitchenId) : "global"
}

/**
 * Carrega o cabeçalho persistido (localStorage), usando `defaultOrg` como nome
 * de organização quando nada foi salvo — ou quando o que ficou salvo é o valor
 * hardcoded legado (EEAR), que migramos para o nome correto da OM/SDAB.
 */
export function loadHeader(scope: string, defaultOrg: string): PrintHeader {
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

/** Grava o cabeçalho do escopo; sem armazenamento local, fica só em memória. */
export function saveHeader(scope: string, header: PrintHeader) {
	try {
		window.localStorage.setItem(headerStorageKey(scope), JSON.stringify(header))
	} catch {
		// localStorage indisponível — mantém apenas em memória.
	}
}

/**
 * Nome da OM impresso no topo: unidade da cozinha (padrão canônico do app), ou a SDAB no modelo
 * global. Serve de default do cabeçalho; o usuário ainda pode sobrescrever inline.
 */
export function useCardapioOrganization(scope: PrintScope): string {
	const { data: kitchens } = useUserKitchens()
	return useMemo(() => {
		if (scope.kind === "global") return GLOBAL_ORGANIZATION
		const kitchen = kitchens?.find((k) => k.id === scope.kitchenId)
		const om = kitchen?.unit?.display_name?.trim() || kitchen?.unit?.code?.trim() || kitchen?.display_name?.trim()
		return om ? om.toUpperCase() : ""
	}, [kitchens, scope])
}

// ─── Opções de impressão ───────────────────────────────────────────────────

export function IngredientsModeSelect({ value, onChange }: { value: IngredientsMode; onChange: (next: IngredientsMode) => void }) {
	return (
		<div className="flex items-center gap-2">
			<span className="text-muted-foreground">Ingredientes:</span>
			<Select
				value={value}
				onValueChange={(next) => {
					if (next && (INGREDIENTS_MODES as readonly string[]).includes(next)) onChange(next as IngredientsMode)
				}}
			>
				<SelectTrigger className="w-72" aria-label="Ingredientes na lista de preparações">
					<SelectValue>{INGREDIENTS_MODE_LABELS[value]}</SelectValue>
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
	)
}

// ─── Blocos do documento ───────────────────────────────────────────────────

/** Edição do cabeçalho: só a cópia da tela edita; a de impressão renderiza texto estático. */
type HeaderEditing = {
	editable?: boolean
	onSignatureChange?: (idx: number, patch: Partial<SignatureBlock>) => void
	onHeaderChange?: (next: PrintHeader) => void
}

function SignatureSlot({ idx, header, editable, onSignatureChange }: HeaderEditing & { idx: 0 | 1 | 2 | 3; header: PrintHeader }) {
	return editable ? (
		<SignatureField block={header.signatures[idx]} onChange={(p) => onSignatureChange?.(idx, p)} />
	) : (
		<StaticSignature block={header.signatures[idx]} />
	)
}

/** Topo da folha: duas assinaturas nas pontas e OM/seção/título no meio; `children` vem sob o título. */
export function CardapioHeader({
	header,
	editable = false,
	onSignatureChange,
	onHeaderChange,
	children,
}: HeaderEditing & { header: PrintHeader; children?: ReactNode }) {
	const line = (value: string, className: string, onChange: (v: string) => void) =>
		editable ? <EditableLine value={value} onChange={onChange} className={className} /> : <div className={className}>{value}</div>
	return (
		<header className="cardapio-header">
			<div className="cardapio-sign cardapio-sign-top">
				<SignatureSlot idx={0} header={header} editable={editable} onSignatureChange={onSignatureChange} />
			</div>
			<div className="cardapio-title-block">
				{line(header.organization, "cardapio-org", (v) => onHeaderChange?.({ ...header, organization: v }))}
				{line(header.section, "cardapio-section", (v) => onHeaderChange?.({ ...header, section: v }))}
				{line(header.title, "cardapio-doctitle", (v) => onHeaderChange?.({ ...header, title: v }))}
				{children}
			</div>
			<div className="cardapio-sign cardapio-sign-top cardapio-sign-right">
				<SignatureSlot idx={1} header={header} editable={editable} onSignatureChange={onSignatureChange} />
			</div>
		</header>
	)
}

/** Assinaturas de baixo — antes da lista de preparações, para saírem na mesma folha do cardápio. */
export function CardapioFooter({ header, editable = false, onSignatureChange }: Omit<HeaderEditing, "onHeaderChange"> & { header: PrintHeader }) {
	return (
		<footer className="cardapio-footer">
			<div className="cardapio-sign">
				<SignatureSlot idx={2} header={header} editable={editable} onSignatureChange={onSignatureChange} />
			</div>
			<div className="cardapio-sign cardapio-sign-right">
				<SignatureSlot idx={3} header={header} editable={editable} onSignatureChange={onSignatureChange} />
			</div>
		</footer>
	)
}

/** Lista de preparações — começa em folha nova na impressão. */
export function PreparationList({ preparations }: { preparations: PreparationEntry[] }) {
	if (preparations.length === 0) return null
	return (
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
	)
}

// ─── Campos editáveis ──────────────────────────────────────────────────────

export function EditableLine({ value, onChange, className }: { value: string; onChange: (v: string) => void; className?: string }) {
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
export function StaticSignature({ block }: { block: SignatureBlock }) {
	return (
		<>
			<div className="cardapio-sign-line" />
			<div className="cardapio-sign-name">{block.name}</div>
			<div className="cardapio-sign-role">{block.role}</div>
		</>
	)
}

export function SignatureField({ block, onChange }: { block: SignatureBlock; onChange: (patch: Partial<SignatureBlock>) => void }) {
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

/** CSS do documento, sem o `@page`: o semanal sai em paisagem, evento e apoio em retrato. */
export const CARDAPIO_DOCUMENT_CSS = `
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
/* Sem isto o navegador descarta o fundo na impressão e as cores somem do PDF. */
.cardapio-dish, .cardapio-legend-swatch { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.cardapio-dish[style] { padding: 0 2px; }
.cardapio-legend {
	display: flex;
	flex-wrap: wrap;
	gap: 2px 10px;
	margin-top: 4px;
	font-size: 8px;
}
.cardapio-legend-item { display: inline-flex; align-items: center; gap: 3px; }
.cardapio-legend-swatch { display: inline-block; width: 10px; height: 8px; border: 1px solid #999; }
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
