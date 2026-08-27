import type { WorkforceSurvey } from "@iefa/database/sisub"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Lock, Plus } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"
import { formatReferenceDate } from "@/components/features/workforce/labels"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { closeWorkforceSurveyFn, createWorkforceSurveyFn, listWorkforceSurveysFn } from "@/server/workforce.fn"

interface WorkforceSurveyControlsProps {
	current: WorkforceSurvey | null
	onSelect: (surveyId: string | null) => void
	/** `admin:2` — abrir e encerrar competência é governança de plataforma, não preenchimento. */
	canManage: boolean
	/** Chaves a invalidar quando a competência muda. */
	invalidate: readonly (readonly unknown[])[]
}

/**
 * Seletor de competência + governança da coleta.
 *
 * O seletor não é enfeite: guardar competência como linha nova só vale se houver como ler
 * a anterior, e é dela que sai o "o que mudou desde a última coleta" que a matriz em
 * planilha nunca conseguiu responder.
 */
export function WorkforceSurveyControls({ current, onSelect, canManage, invalidate }: WorkforceSurveyControlsProps) {
	const queryClient = useQueryClient()
	const [open, setOpen] = React.useState(false)
	const [referenceMonth, setReferenceMonth] = React.useState("")
	const [title, setTitle] = React.useState("")

	const { data: surveys = [] } = useQuery({
		queryKey: ["sisub", "workforce", "surveys"],
		queryFn: () => listWorkforceSurveysFn({ data: { limit: 24 } }),
	})

	const refresh = () => {
		queryClient.invalidateQueries({ queryKey: ["sisub", "workforce", "surveys"] })
		for (const key of invalidate) queryClient.invalidateQueries({ queryKey: key })
	}

	const create = useMutation({
		mutationFn: () => createWorkforceSurveyFn({ data: { referenceDate: `${referenceMonth}-01`, title: title.trim(), source: "Preenchimento no sistema" } }),
		onSuccess: (survey) => {
			refresh()
			onSelect(survey.id)
			setOpen(false)
			setReferenceMonth("")
			setTitle("")
			toast.success("Competência aberta", { description: "Os gestores já podem preencher o efetivo dos seus ranchos." })
		},
		onError: (e: Error) => toast.error("Erro ao abrir competência", { description: e.message }),
	})

	const close = useMutation({
		mutationFn: (surveyId: string) => closeWorkforceSurveyFn({ data: { surveyId } }),
		onSuccess: () => {
			refresh()
			toast.success("Competência encerrada", { description: "Vira registro histórico: não aceita mais alteração." })
		},
		onError: (e: Error) => toast.error("Erro ao encerrar", { description: e.message }),
	})

	function submit() {
		if (!/^\d{4}-\d{2}$/.test(referenceMonth)) {
			toast.error("Informe o mês de referência")
			return
		}
		if (title.trim() === "") {
			toast.error("Informe o título da competência")
			return
		}
		create.mutate()
	}

	return (
		<div className="flex flex-wrap items-center gap-2">
			{surveys.length > 0 && (
				<Select value={current?.id ?? null} onValueChange={(v) => onSelect(v as string | null)}>
					<SelectTrigger className="w-56" aria-label="Competência">
						<SelectValue>{current ? formatReferenceDate(current.reference_date) : "Selecionar"}</SelectValue>
					</SelectTrigger>
					<SelectContent>
						{surveys.map((survey) => (
							<SelectItem key={survey.id} value={survey.id}>
								{formatReferenceDate(survey.reference_date)}
								{survey.status === "closed" ? " · encerrada" : ""}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			)}

			{current?.status === "closed" && <Badge variant="secondary">Encerrada</Badge>}

			{canManage && (
				<>
					{current?.status === "open" && (
						<Button size="sm" variant="outline" className="gap-1.5" disabled={close.isPending} onClick={() => close.mutate(current.id)}>
							<Lock className="size-3.5" aria-hidden="true" />
							Encerrar
						</Button>
					)}
					<Button size="sm" variant="outline" className="gap-1.5" onClick={() => setOpen(true)}>
						<Plus className="size-3.5" aria-hidden="true" />
						Nova competência
					</Button>
				</>
			)}

			<Dialog open={open} onOpenChange={setOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Nova competência</DialogTitle>
						<DialogDescription>
							Abre uma coleta nova sem tocar nas anteriores — é o que preserva a comparação entre meses. Os gestores passam a preencher o efetivo dos seus
							ranchos.
						</DialogDescription>
					</DialogHeader>

					<FieldGroup>
						<Field>
							<FieldLabel htmlFor="survey-month">Mês de referência</FieldLabel>
							<Input id="survey-month" type="month" value={referenceMonth} onChange={(e) => setReferenceMonth(e.target.value)} />
							<FieldDescription>Uma competência por mês; o sistema recusa data de referência repetida.</FieldDescription>
						</Field>
						<Field>
							<FieldLabel htmlFor="survey-title">Título</FieldLabel>
							<Input
								id="survey-title"
								value={title}
								onChange={(e) => setTitle(e.target.value)}
								placeholder="Ex.: Matriz de efetivo dos ranchos — setembro/2026"
							/>
						</Field>
					</FieldGroup>

					<DialogFooter>
						<Button variant="outline" onClick={() => setOpen(false)}>
							Cancelar
						</Button>
						<Button disabled={create.isPending} onClick={submit}>
							Abrir competência
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	)
}
