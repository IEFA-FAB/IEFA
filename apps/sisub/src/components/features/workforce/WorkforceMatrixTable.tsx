"use no memo"

import type { WorkforceMatrixWire, WorkforceNoteKind, WorkforceRanchoWire } from "@iefa/sisub-domain"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { AlertTriangle, Check, Pencil, Trash2, X } from "lucide-react"
import * as React from "react"
import { AddWorkforceNoteDialog } from "@/components/features/workforce/AddWorkforceNoteDialog"
import { formatHeadcount, formatMealLoad, formatRatio, NOTE_KIND_LABELS, NOTE_KIND_VARIANT } from "@/components/features/workforce/labels"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { toast } from "@/components/ui/toast"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/cn"
import { deleteWorkforceNoteFn, saveWorkforceSubmissionFn } from "@/server/workforce.fn"

interface WorkforceMatrixTableProps {
	matrix: WorkforceMatrixWire
	/** Sem permissão de escrita a tabela vira só leitura — nenhum controle de edição aparece. */
	canEdit: boolean
	queryKey: readonly unknown[]
}

type Draft = Record<string, string>

/** "" = campo em branco (apaga a linha); "0" = zero declarado. Os dois são estados válidos. */
function toDraft(rancho: WorkforceRanchoWire, codes: string[]): Draft {
	return Object.fromEntries(codes.map((code) => [code, rancho.headcounts[code] === undefined ? "" : String(rancho.headcounts[code])]))
}

export function WorkforceMatrixTable({ matrix, canEdit, queryKey }: WorkforceMatrixTableProps) {
	const queryClient = useQueryClient()
	const [editingId, setEditingId] = React.useState<number | null>(null)
	const [draft, setDraft] = React.useState<Draft>({})
	const [declaredTotal, setDeclaredTotal] = React.useState("")

	const codes = matrix.categories.map((c) => c.code)
	const surveyId = matrix.survey?.id ?? null
	const editable = canEdit && surveyId !== null && matrix.survey?.status !== "closed"

	const save = useMutation({
		mutationFn: (input: Parameters<typeof saveWorkforceSubmissionFn>[0]["data"]) => saveWorkforceSubmissionFn({ data: input }),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey })
			setEditingId(null)
			toast.success("Efetivo atualizado")
		},
		onError: (e: Error) => toast.error("Erro ao salvar", { description: e.message }),
	})

	const removeNote = useMutation({
		mutationFn: (noteId: string) => deleteWorkforceNoteFn({ data: { noteId } }),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey })
			toast.success("Observação removida")
		},
		onError: (e: Error) => toast.error("Erro ao remover", { description: e.message }),
	})

	function startEdit(rancho: WorkforceRanchoWire) {
		setEditingId(rancho.ranchoId)
		setDraft(toDraft(rancho, codes))
		setDeclaredTotal(rancho.declaredTotal === null ? "" : String(rancho.declaredTotal))
	}

	function commit(rancho: WorkforceRanchoWire) {
		if (!surveyId) return
		const entries = codes.map((code) => {
			const raw = draft[code]?.trim() ?? ""
			return { categoryCode: code, headcount: raw === "" ? null : Number(raw) }
		})
		const invalid = entries.some((e) => e.headcount !== null && (!Number.isInteger(e.headcount) || e.headcount < 0))
		if (invalid) {
			toast.error("Quantitativo inválido", { description: "Use números inteiros não negativos, ou deixe em branco." })
			return
		}
		// O total declarado passa pelo MESMO crivo das parcelas. Sem isso, "2O" (com a letra O)
		// virava NaN e o Zod do servidor reprovava a submissão inteira com um toast opaco,
		// sem apontar qual campo estava errado.
		const total = declaredTotal.trim()
		const parsedTotal = total === "" ? null : Number(total)
		if (parsedTotal !== null && (!Number.isInteger(parsedTotal) || parsedTotal < 0)) {
			toast.error("Total declarado inválido", { description: "Use um número inteiro não negativo, ou deixe em branco." })
			return
		}
		save.mutate({ surveyId, ranchoId: rancho.ranchoId, entries, declaredTotal: parsedTotal })
	}

	if (matrix.ranchos.length === 0) {
		return (
			<Empty>
				<EmptyHeader>
					<EmptyTitle>Nenhum rancho cadastrado</EmptyTitle>
					<EmptyDescription>Esta unidade ainda não tem ranchos no roster da matriz de efetivo.</EmptyDescription>
				</EmptyHeader>
			</Empty>
		)
	}

	return (
		<div className="rounded-md border overflow-x-auto">
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>Rancho</TableHead>
						{matrix.categories.map((c) => (
							<TableHead key={c.code} className="text-right">
								<Tooltip>
									<TooltipTrigger render={<span>{c.name.replace(/\s*\(.*\)$/, "")}</span>} />
									<TooltipContent>{c.description ?? c.name}</TooltipContent>
								</Tooltip>
							</TableHead>
						))}
						<TableHead className="text-right">Total</TableHead>
						<TableHead className="text-right">Disponível</TableHead>
						<TableHead className="text-right">Carreira</TableHead>
						<TableHead className="text-right">
							<Tooltip>
								<TooltipTrigger render={<span>Refeições/militar</span>} />
								<TooltipContent>
									Refeições servidas por dia por militar disponível, no mês da competência. Conta refeições, não comensais distintos: quem almoça e janta conta
									duas vezes.
								</TooltipContent>
							</Tooltip>
						</TableHead>
						{editable && <TableHead className="w-24" />}
					</TableRow>
				</TableHeader>
				<TableBody>
					{matrix.ranchos.map((rancho) => {
						const isEditing = editingId === rancho.ranchoId
						return (
							<React.Fragment key={rancho.ranchoId}>
								<TableRow className={cn(!rancho.answered && "bg-muted/40")}>
									<TableCell>
										<div className="flex flex-col gap-0.5">
											<span className="text-subheading">{rancho.displayName}</span>
											<span className="text-hint text-muted-foreground">
												{rancho.eloCode}
												{rancho.mess_hall_name ? ` · serve ${rancho.mess_hall_name}` : " · sem refeitório vinculado"}
											</span>
										</div>
									</TableCell>

									{matrix.categories.map((c) => (
										<TableCell key={c.code} className="text-right tabular-nums">
											{isEditing ? (
												<Input
													className="h-8 w-16 text-right"
													inputMode="numeric"
													aria-label={`${c.name} em ${rancho.displayName}`}
													value={draft[c.code] ?? ""}
													onChange={(e) => setDraft((prev) => ({ ...prev, [c.code]: e.target.value }))}
												/>
											) : (
												<span className={cn(rancho.headcounts[c.code] === undefined && "text-muted-foreground")}>
													{formatHeadcount(rancho.headcounts[c.code])}
												</span>
											)}
										</TableCell>
									))}

									<TableCell className="text-right tabular-nums">
										{rancho.answered ? (
											<span className="flex items-center justify-end gap-1.5">
												<span className="text-subheading">{rancho.total}</span>
												{rancho.declaredTotalDiverges && (
													<Tooltip>
														<TooltipTrigger
															render={
																<span>
																	<AlertTriangle className="size-3.5 text-warning" aria-hidden="true" />
																</span>
															}
														/>
														<TooltipContent>
															O gestor declarou {rancho.declaredTotal}; as parcelas somam {rancho.total}.
														</TooltipContent>
													</Tooltip>
												)}
											</span>
										) : (
											<Badge variant="outline">Sem resposta</Badge>
										)}
									</TableCell>
									<TableCell className="text-right tabular-nums">
										{rancho.availableTotal === null ? (
											<span className="text-muted-foreground">—</span>
										) : (
											<span className={cn(rancho.unavailable > 0 && "text-warning")}>{rancho.availableTotal}</span>
										)}
									</TableCell>
									<TableCell className="text-right tabular-nums">{formatRatio(rancho.careerRatio)}</TableCell>
									<TableCell className="text-right tabular-nums">{formatMealLoad(rancho.meals_per_worker)}</TableCell>

									{editable && (
										<TableCell className="text-right">
											{isEditing ? (
												<div className="flex justify-end gap-1">
													<Button size="icon" variant="ghost" aria-label="Salvar" disabled={save.isPending} onClick={() => commit(rancho)}>
														<Check className="size-4" aria-hidden="true" />
													</Button>
													<Button size="icon" variant="ghost" aria-label="Cancelar" onClick={() => setEditingId(null)}>
														<X className="size-4" aria-hidden="true" />
													</Button>
												</div>
											) : (
												<Button size="icon" variant="ghost" aria-label={`Editar ${rancho.displayName}`} onClick={() => startEdit(rancho)}>
													<Pencil className="size-4" aria-hidden="true" />
												</Button>
											)}
										</TableCell>
									)}
								</TableRow>

								{isEditing && (
									<TableRow>
										<TableCell colSpan={matrix.categories.length + (editable ? 6 : 5)}>
											<div className="flex flex-wrap items-center gap-2">
												<span className="text-caption text-muted-foreground">Total declarado pelo gestor (opcional):</span>
												<Input
													className="h-8 w-24"
													inputMode="numeric"
													aria-label="Total declarado"
													value={declaredTotal}
													onChange={(e) => setDeclaredTotal(e.target.value)}
												/>
												<span className="text-hint text-muted-foreground">
													Deixe um quadro em branco para "não informado"; escreva 0 para declarar que não há militar daquele quadro.
												</span>
											</div>
										</TableCell>
									</TableRow>
								)}

								{(rancho.notes.length > 0 || (editable && rancho.answered)) && (
									<TableRow>
										<TableCell colSpan={matrix.categories.length + (editable ? 6 : 5)} className="pt-0">
											<div className="flex flex-wrap items-center gap-2">
												{editable && rancho.answered && surveyId && (
													<AddWorkforceNoteDialog surveyId={surveyId} ranchoId={rancho.ranchoId} ranchoName={rancho.displayName} queryKey={queryKey} />
												)}
												{rancho.notes.map((note) => (
													<span key={note.id} className="inline-flex items-center gap-1.5">
														<Badge variant={NOTE_KIND_VARIANT[note.kind as WorkforceNoteKind] ?? "outline"}>
															{NOTE_KIND_LABELS[note.kind as WorkforceNoteKind] ?? note.kind}
															{note.quantity !== null ? ` · ${note.quantity}` : ""}
														</Badge>
														<span className="text-caption text-muted-foreground">{note.detail}</span>
														{editable && (
															<Button
																size="icon"
																variant="ghost"
																aria-label="Remover observação"
																disabled={removeNote.isPending}
																onClick={() => removeNote.mutate(note.id)}
															>
																<Trash2 className="size-3.5" aria-hidden="true" />
															</Button>
														)}
													</span>
												))}
											</div>
										</TableCell>
									</TableRow>
								)}
							</React.Fragment>
						)
					})}
				</TableBody>
			</Table>
		</div>
	)
}
