/**
 * Relato de pane — o formulário que a praça usa.
 *
 * Otimizado para uso de pé, em celular, no meio do serviço: a severidade são dois botões
 * grandes com a pergunta que a pessoa consegue responder ("dá para usar com limitação" /
 * "não dá para usar"), não um select com o vocabulário do banco. Categoria e descrição vêm
 * depois; a descrição é obrigatória porque "quebrou" não deixa nenhum gestor agir.
 *
 * Severidade não é enfeite: `inoperative` tira a unidade do cálculo de atendimento no mesmo
 * instante — é o que impede o planejamento de continuar prometendo assado para 900 pessoas
 * num forno queimado.
 */

import type { EquipmentIssueSeverity } from "@iefa/sisub-domain"
import { AlertTriangle, Loader2 } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldContent, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { useReportEquipmentIssue } from "@/hooks/data/useEquipment"
import { cn } from "@/lib/cn"
import { ISSUE_CATEGORY_LABEL, SEVERITY_LABEL } from "./equipment-labels"

const CATEGORIES = ["mechanical", "electrical", "gas", "hydraulic", "refrigeration", "structural", "other"] as const

export function ReportIssueDialog({ unitId, unitLabel, open, onClose }: { unitId: string | null; unitLabel: string; open: boolean; onClose: () => void }) {
	const report = useReportEquipmentIssue()
	const [severity, setSeverity] = useState<EquipmentIssueSeverity | null>(null)
	const [category, setCategory] = useState<string>("other")
	const [description, setDescription] = useState("")

	const reset = () => {
		setSeverity(null)
		setCategory("other")
		setDescription("")
	}

	const handleSubmit = () => {
		if (unitId == null || severity == null || description.trim() === "") return
		report.mutate(
			{ unitId, severity, category: category as (typeof CATEGORIES)[number], description: description.trim() },
			{
				onSuccess: () => {
					reset()
					onClose()
				},
			}
		)
	}

	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				if (!next) {
					reset()
					onClose()
				}
			}}
		>
			<DialogContent className="sm:max-w-[520px]">
				<DialogHeader>
					<DialogTitle>Relatar pane — {unitLabel}</DialogTitle>
					<DialogDescription>O que está acontecendo com este equipamento?</DialogDescription>
				</DialogHeader>

				<div className="space-y-4 py-2">
					{/* Dois alvos grandes: a decisão é binária e é tomada em pé. */}
					<div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
						{(["degraded", "inoperative"] as const).map((option) => (
							<button
								key={option}
								type="button"
								onClick={() => setSeverity(option)}
								aria-pressed={severity === option}
								className={cn(
									"rounded-lg border border-border p-4 text-left transition-colors",
									severity === option ? "border-foreground bg-muted" : "hover:bg-muted/50",
									option === "inoperative" && severity === option && "bg-destructive/10"
								)}
							>
								<span className="block font-medium">{SEVERITY_LABEL[option]}</span>
								<span className="text-caption text-muted-foreground">
									{option === "degraded" ? "Continua contando no planejamento das preparações" : "Sai do planejamento até alguém resolver"}
								</span>
							</button>
						))}
					</div>

					<Field>
						<FieldLabel htmlFor="issue-category">Tipo</FieldLabel>
						<FieldContent>
							<Select value={category} onValueChange={(value) => setCategory(value as string)}>
								<SelectTrigger id="issue-category" className="w-full">
									<SelectValue>{ISSUE_CATEGORY_LABEL[category]}</SelectValue>
								</SelectTrigger>
								<SelectContent>
									{CATEGORIES.map((option) => (
										<SelectItem key={option} value={option}>
											{ISSUE_CATEGORY_LABEL[option]}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</FieldContent>
					</Field>

					<Field>
						<FieldLabel htmlFor="issue-description">O que houve</FieldLabel>
						<FieldContent>
							<Textarea
								id="issue-description"
								rows={3}
								placeholder="Ex.: a cuba da esquerda não esquenta; o botão de pressão não trava"
								value={description}
								onChange={(e) => setDescription(e.target.value)}
							/>
							<FieldDescription>Quem vai consertar precisa saber o que procurar.</FieldDescription>
						</FieldContent>
					</Field>
				</div>

				<DialogFooter>
					<Button
						variant="outline"
						onClick={() => {
							reset()
							onClose()
						}}
					>
						Cancelar
					</Button>
					<Button onClick={handleSubmit} disabled={severity == null || description.trim() === "" || report.isPending}>
						{report.isPending ? <Loader2 className="size-4 mr-2 animate-spin" /> : <AlertTriangle className="size-4 mr-2" />}
						Relatar
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
