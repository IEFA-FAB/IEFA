import type { Person } from "@iefa/database/assignment-selection"
import { CheckCircle2, Eye, Megaphone, TriangleAlert } from "lucide-react"
import { useId, useState } from "react"
import { NO_BOARD_MESSAGE, REVEALED_OM_WARNING } from "@/components/controller/copy"
import { OmCombobox } from "@/components/controller/OmCombobox"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type { ComboboxOption } from "@/components/ui/combobox"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { byClassification, type PersonStatus, personStatus } from "@/lib/conduct"
import { cn } from "@/lib/utils"

interface PrepareTableProps {
	persons: Person[]
	/** Itens do combobox de OM, memoizados por quem chama. */
	omItems: ComboboxOption[]
	hasVacancyBoard: boolean
	onChangeOm: (person: Person, om: string) => void
}

/**
 * Quem já aparece no telão com a OM: trocar aqui muda a projeção na hora. A troca segue
 * possível (o militar pode mudar a escolha na hora), mas não sem aviso.
 */
const LIVE_OM_WARNING: Partial<Record<PersonStatus, string>> = {
	revealed: REVEALED_OM_WARNING,
	confirmed: "Já confirmado: trocar a OM muda o mapa do telão na hora.",
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
export function PrepareTable({ persons, omItems, hasVacancyBoard, onChangeOm }: PrepareTableProps) {
	const warningPrefix = useId()
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

			{!hasVacancyBoard && (
				<div role="status" className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-warning">
					<TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
					<p>{NO_BOARD_MESSAGE} Cadastre as vagas da edição antes de preencher a lista.</p>
				</div>
			)}

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
								const statusKey = personStatus(p)
								const status = STATUS[statusKey]
								const Icon = status.icon
								const warning = LIVE_OM_WARNING[statusKey]
								const warningId = `${warningPrefix}-${p.id}`
								return (
									<TableRow key={p.id}>
										<TableCell className="pl-4 text-right font-medium tabular-nums text-muted-foreground">{p.classificacao}º</TableCell>
										<TableCell className="font-medium text-foreground">{p.nome}</TableCell>
										<TableCell className="py-1.5">
											<div className="group/om">
												{hasVacancyBoard ? (
													<OmCombobox
														value={p.localidade}
														items={omItems}
														onChange={(om) => onChangeOm(p, om)}
														aria-label={`OM de ${p.classificacao}º ${p.nome}`}
														aria-describedby={warning ? warningId : undefined}
													/>
												) : (
													<span className="text-sm text-muted-foreground">{p.localidade ?? "—"}</span>
												)}
												{warning && hasVacancyBoard && (
													// Revelado é um militar só e está no telão agora: aviso sempre à vista. Os
													// confirmados são a maioria no dia; o aviso deles aparece ao mexer no campo.
													<p
														id={warningId}
														className={cn("mt-1 text-xs whitespace-normal text-warning", statusKey === "confirmed" && "hidden group-focus-within/om:block")}
													>
														{warning}
													</p>
												)}
											</div>
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
