import type { SnackLabelData } from "@iefa/sisub-domain"
import { DEFAULT_SHELF_LIFE_HOURS, labelExpiresAt } from "@iefa/sisub-domain/utils"
import { useQueries } from "@tanstack/react-query"
import { Printer } from "lucide-react"
import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { snackLabelQueryOptions } from "@/hooks/data/useSnackRequests"
import { AUDIENCE_LABELS, FAMILY_LABELS, formatDateTime, lineKits, VARIANT_LABELS } from "./format"
import { SnackLoadError } from "./SnackBadges"

/**
 * Etiquetas do lanche — uma por kit, com os campos de "Recomendações — etiquetagem" do
 * Módulo 7: OM produtora, padrão e preparações, fabricação, validade, valor energético e
 * "Próprio para consumo imediato".
 *
 * Impressão como em `WeeklyMenuPrint`: `window.print()` e uma cópia estática num portal
 * direto no <body> — o app-shell recorta o que passa da primeira dobra, e o diálogo (também
 * em portal) some da folha pelo `@media print`.
 */

type LabelEntry = {
	key: string
	standardName: string
	classTitle: string
	recipes: string
	producer: string
	kitchen: string | null
	fabricatedAt: string
	expiresAt: string
	energy: string
	mission: string
	audience: string
	index: number
	total: number
}

function buildLabels(data: SnackLabelData): LabelEntry[] {
	const { request, producer } = data
	const fabricated = new Date(data.fabricated_at)
	const entries: LabelEntry[] = []
	for (const line of request.lines) {
		const kits = lineKits(line)
		if (kits <= 0) continue
		const s = line.standard_snapshot
		const expires = labelExpiresAt(fabricated, s.shelfLifeHours ?? DEFAULT_SHELF_LIFE_HOURS)
		const energy =
			s.kcalPerKit != null && s.kcalComplete ? `${Math.round(s.kcalPerKit).toLocaleString("pt-BR")} kcal por kit` : "valor nutricional parcial — conferir ficha"
		const recipes = s.items.map((i) => (i.portions === 1 ? i.recipeName : `${i.recipeName} (${i.portions.toLocaleString("pt-BR")} porções)`)).join(" · ")
		for (let i = 1; i <= kits; i++) {
			entries.push({
				key: `${line.id}:${i}`,
				standardName: s.name,
				classTitle: `${FAMILY_LABELS[s.family] ?? s.family} — Classe ${s.snackClass} · ${VARIANT_LABELS[s.variant] ?? s.variant}`,
				recipes,
				producer: producer.unit ?? "OM não informada",
				kitchen: producer.kitchen,
				fabricatedAt: formatDateTime(fabricated.toISOString()),
				expiresAt: formatDateTime(expires.toISOString()),
				energy,
				mission: request.mission_description,
				audience: AUDIENCE_LABELS[line.audience] ?? line.audience,
				index: i,
				total: kits,
			})
		}
	}
	return entries
}

export function SnackLabelSheet({ labels }: { labels: SnackLabelData[] }) {
	const entries = labels.flatMap(buildLabels)
	if (entries.length === 0) return <p className="snack-label-empty">Nenhum kit a etiquetar.</p>
	return (
		<div className="snack-label-sheet">
			{entries.map((e) => (
				<article key={e.key} className="snack-label">
					<div className="snack-label-class">{e.classTitle}</div>
					<div className="snack-label-name">{e.standardName}</div>
					<div className="snack-label-recipes">{e.recipes}</div>
					<dl className="snack-label-fields">
						<dt>OM produtora</dt>
						<dd>
							{e.producer}
							{e.kitchen ? ` — ${e.kitchen}` : ""}
						</dd>
						<dt>Fabricação</dt>
						<dd>{e.fabricatedAt}</dd>
						<dt>Validade</dt>
						<dd className="snack-label-strong">{e.expiresAt}</dd>
						<dt>Valor energético</dt>
						<dd>{e.energy}</dd>
					</dl>
					<div className="snack-label-imediato">Próprio para consumo imediato</div>
					<div className="snack-label-foot">
						<span>{e.mission}</span>
						<span>
							{e.audience} · kit {e.index}/{e.total}
						</span>
					</div>
				</article>
			))}
		</div>
	)
}

interface SnackLabelsDialogProps {
	open: boolean
	onOpenChange: (open: boolean) => void
	requestIds: string[]
	title: string
}

export function SnackLabelsDialog({ open, onOpenChange, requestIds, title }: SnackLabelsDialogProps) {
	const results = useQueries({ queries: requestIds.map((id) => ({ ...snackLabelQueryOptions(id), enabled: open })) })
	const error = results.find((r) => r.error)?.error ?? null
	const loading = results.some((r) => r.isPending)
	const labels = results.flatMap((r) => (r.data ? [r.data] : []))
	const totalKits = labels.reduce((sum, l) => sum + l.request.lines.reduce((s, line) => s + Math.max(0, lineKits(line)), 0), 0)
	const withoutSample = labels.filter((l) => !l.request.sample_collected_at).length

	// A cópia de impressão só existe no cliente — createPortal exige `document`.
	const [mounted, setMounted] = useState(false)
	useEffect(() => setMounted(true), [])

	const ready = !loading && !error

	return (
		<>
			<Dialog open={open} onOpenChange={onOpenChange}>
				<DialogContent className="sm:max-w-3xl">
					<DialogHeader>
						<DialogTitle>{title}</DialogTitle>
						<DialogDescription>
							Uma etiqueta por kit. Validade = fabricação + validade do padrão (padrão de {DEFAULT_SHELF_LIFE_HOURS} h quando o padrão não define).
						</DialogDescription>
					</DialogHeader>

					{error ? (
						<SnackLoadError what="os dados das etiquetas" error={error} onRetry={() => results.forEach((r) => void r.refetch())} />
					) : loading ? (
						<div className="h-48 animate-pulse rounded-lg bg-muted" aria-hidden="true" />
					) : (
						<div className="space-y-3">
							<p className="text-caption text-muted-foreground">
								<span className="font-mono tabular-nums text-foreground">{totalKits}</span> {totalKits === 1 ? "etiqueta" : "etiquetas"}
								{withoutSample > 0 &&
									" · A fabricação é a hora da coleta da amostra; pedido sem amostra registrada sai com a hora desta impressão — marque o pedido como pronto antes, se possível."}
							</p>
							<div className="max-h-[60vh] overflow-auto rounded-lg border bg-muted/30 p-3">
								<style>{LABEL_CSS}</style>
								<SnackLabelSheet labels={labels} />
							</div>
						</div>
					)}

					<DialogFooter>
						<Button variant="outline" onClick={() => onOpenChange(false)}>
							Fechar
						</Button>
						<Button onClick={() => window.print()} disabled={!ready || totalKits === 0}>
							<Printer className="size-4 mr-2" aria-hidden="true" />
							Imprimir etiquetas
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Cópia de impressão — só enquanto o diálogo está aberto, para não sequestrar outra impressão da página. */}
			{mounted &&
				open &&
				ready &&
				createPortal(
					<div className="snack-labels-print-portal">
						<style>{LABEL_CSS}</style>
						<SnackLabelSheet labels={labels} />
					</div>,
					document.body
				)}
		</>
	)
}

const LABEL_CSS = `
.snack-label-sheet {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 6px;
	color: #000;
	font-family: Arial, Helvetica, sans-serif;
}
.snack-label {
	background: #fff;
	border: 1px dashed #000;
	padding: 6px 8px;
	font-size: 10px;
	line-height: 1.3;
	break-inside: avoid;
	page-break-inside: avoid;
	display: flex;
	flex-direction: column;
	gap: 3px;
}
.snack-label-class { font-size: 9px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; }
.snack-label-name { font-size: 12px; font-weight: 700; }
.snack-label-recipes { font-size: 9px; }
.snack-label-fields { display: grid; grid-template-columns: auto 1fr; gap: 1px 6px; margin: 2px 0 0; }
.snack-label-fields dt { font-weight: 700; }
.snack-label-fields dd { margin: 0; }
.snack-label-strong { font-weight: 700; }
.snack-label-imediato { font-weight: 700; text-align: center; border: 1px solid #000; padding: 2px; text-transform: uppercase; font-size: 9px; }
.snack-label-foot { display: flex; justify-content: space-between; gap: 6px; font-size: 8px; color: #333; }
.snack-label-foot span:first-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.snack-label-empty { font-style: italic; text-align: center; padding: 12px; }

/* Cópia de impressão (portal no <body>): existe só para o @media print. */
.snack-labels-print-portal { display: none; }

@media print {
	@page { size: A4 portrait; margin: 8mm; }
	body { background: #fff !important; }
	body > *:not(.snack-labels-print-portal) { display: none !important; }
	.snack-labels-print-portal { display: block !important; }
}
`
