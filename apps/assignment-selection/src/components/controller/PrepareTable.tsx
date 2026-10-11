import type { Person } from "@iefa/database/assignment-selection"
import { CheckCircle2, Eye, Megaphone, TriangleAlert } from "lucide-react"
import { useState } from "react"
import { OmCombobox } from "@/components/controller/OmCombobox"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { byClassification, type PersonStatus, personStatus } from "@/lib/conduct"
import type { OmOption } from "@/lib/om-options"

interface PrepareTableProps {
	persons: Person[]
	omOptions: OmOption[]
	onChangeOm: (personId: number, om: string) => void
}

const STATUS: Record<PersonStatus, { label: string; variant: "neutral" | "info" | "success" | "warning"; icon?: typeof Eye }> = {
	"missing-om": { label: "Sem OM", variant: "warning", icon: TriangleAlert },
	ready: { label: "Aguardando", variant: "neutral" },
	called: { label: "No telão", variant: "info", icon: Megaphone },
	revealed: { label: "OM revelada", variant: "info", icon: Eye },
	confirmed: { label: "Confirmado", variant: "success", icon: CheckCircle2 },
}

/**
 * Preparo antes do evento: a lista por classificação com a OM de cada um, editável em
 * sequência. O combobox grava ao escolher; Tab leva ao campo da linha de baixo.
 */
export function PrepareTable({ persons, omOptions, onChangeOm }: PrepareTableProps) {
	const [onlyMissing, setOnlyMissing] = useState(false)
	const ordered = byClassification(persons)
	const missing = ordered.filter((p) => personStatus(p) === "missing-om").length
	const rows = onlyMissing ? ordered.filter((p) => personStatus(p) === "missing-om") : ordered

	return (
		<section aria-labelledby="prepare-heading" className="flex flex-col gap-3">
			<div className="flex flex-wrap items-end justify-between gap-3">
				<div>
					<h2 id="prepare-heading" className="text-lg font-semibold text-foreground">
						Lista por classificação
					</h2>
					<p className="text-sm text-muted-foreground" aria-live="polite">
						{ordered.length} militares ·{" "}
						{missing === 0 ? (
							<span className="text-success">todos com OM</span>
						) : (
							<span className="font-medium text-warning">{missing === 1 ? "1 sem OM" : `${missing} sem OM`}</span>
						)}
					</p>
				</div>
				<Button variant="outline" aria-pressed={onlyMissing} onClick={() => setOnlyMissing((v) => !v)} disabled={!onlyMissing && missing === 0}>
					{onlyMissing ? "Mostrar todos" : "Mostrar só sem OM"}
				</Button>
			</div>

			<div className="overflow-hidden rounded-xl border border-border bg-card">
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead className="w-20 pl-4 text-right">Class.</TableHead>
							<TableHead>Nome</TableHead>
							<TableHead className="w-80">OM</TableHead>
							<TableHead className="w-36 pr-4">Situação</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{rows.length === 0 ? (
							<TableRow>
								<TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
									{ordered.length === 0 ? "Nenhum militar nesta edição." : "Todos já têm OM."}
								</TableCell>
							</TableRow>
						) : (
							rows.map((p) => {
								const status = STATUS[personStatus(p)]
								const Icon = status.icon
								return (
									<TableRow key={p.id}>
										<TableCell className="pl-4 text-right font-medium tabular-nums text-muted-foreground">{p.classificacao}º</TableCell>
										<TableCell className="font-medium text-foreground">{p.nome}</TableCell>
										<TableCell className="py-1.5">
											<OmCombobox
												value={p.localidade}
												options={omOptions}
												onChange={(om) => onChangeOm(p.id, om)}
												aria-label={`OM de ${p.classificacao}º ${p.nome}`}
											/>
										</TableCell>
										<TableCell className="pr-4">
											{status.variant === "neutral" ? (
												<span className="text-sm text-muted-foreground">{status.label}</span>
											) : (
												<Badge variant={status.variant}>
													{Icon && <Icon aria-hidden="true" />}
													{status.label}
												</Badge>
											)}
										</TableCell>
									</TableRow>
								)
							})
						)}
					</TableBody>
				</Table>
			</div>
		</section>
	)
}
