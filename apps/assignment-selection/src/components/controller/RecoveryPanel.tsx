import type { Person } from "@iefa/database/assignment-selection"
import { ChevronRight, MonitorX, Trash2, TriangleAlert } from "lucide-react"
import type * as React from "react"
import { useState } from "react"
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { byClassification } from "@/lib/conduct"

export type PersonChanges = Partial<Pick<Person, "classificacao" | "nome" | "show_card" | "show_om" | "hide_card">>

interface RecoveryPanelProps {
	persons: Person[]
	editionName: string
	busy?: boolean
	onUpdate: (id: number, changes: PersonChanges) => void
	onResetScreen: () => void
	onClearChoices: () => void
	/** Já aberto (captura de tela). */
	defaultOpen?: boolean
}

/**
 * Recuperação e correção avançada, recolhidas por padrão. As flags de telão são
 * consequência do fluxo de condução; editá-las à mão é o último recurso, não o caminho.
 */
export function RecoveryPanel({ persons, editionName, busy, onUpdate, onResetScreen, onClearChoices, defaultOpen }: RecoveryPanelProps) {
	const withOm = persons.filter((p) => p.localidade).length

	return (
		<details className="group rounded-xl border border-border" open={defaultOpen}>
			<summary className="flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium text-muted-foreground outline-none select-none hover:bg-muted/60 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
				<ChevronRight className="size-4 transition-transform duration-150 group-open:rotate-90" aria-hidden="true" />
				Reiniciar e correção manual
			</summary>

			<div className="grid gap-6 border-t border-border p-4">
				<div className="grid gap-3 sm:grid-cols-2">
					<ResetEditionDialog
						kind="screen"
						editionName={editionName}
						count={persons.length}
						busy={busy}
						onConfirm={onResetScreen}
						trigger={
							<Button variant="outline" className="justify-start">
								<MonitorX /> Tirar todos do telão…
							</Button>
						}
					/>
					<ResetEditionDialog
						kind="choices"
						editionName={editionName}
						count={withOm}
						busy={busy}
						onConfirm={onClearChoices}
						trigger={
							<Button variant="destructive" className="justify-start" disabled={withOm === 0}>
								<Trash2 /> Apagar todas as OMs…
							</Button>
						}
					/>
				</div>

				<div className="grid gap-2">
					<div className="flex items-start gap-2 text-sm text-warning">
						<TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
						<p>
							Correção manual: cada marca muda o telão na hora. Use só o que o botão de desfazer da condução não resolve, como reabrir a confirmação de alguém
							já passado.
						</p>
					</div>
					<FlagsTable persons={persons} onUpdate={onUpdate} />
				</div>
			</div>
		</details>
	)
}

const RESET_COPY = {
	screen: {
		title: "Tirar todos do telão?",
		body: (count: number) =>
			`Os ${count} militares voltam a aguardar chamada: cards, OMs reveladas e confirmações saem do telão e do mapa. As OMs preenchidas continuam.`,
		action: "Tirar todos do telão",
		variant: "default" as const,
	},
	choices: {
		title: "Apagar todas as OMs?",
		body: (count: number) =>
			`As OMs de ${count} ${count === 1 ? "militar" : "militares"} são apagadas e o telão volta ao início. Não há como desfazer: o que foi preenchido antes do evento teria de ser digitado de novo.`,
		action: "Apagar as OMs",
		variant: "destructive" as const,
	},
}

export function ResetEditionDialog({
	kind,
	editionName,
	count,
	busy,
	onConfirm,
	trigger,
	defaultOpen,
	container,
}: {
	kind: keyof typeof RESET_COPY
	editionName: string
	count: number
	busy?: boolean
	onConfirm: () => void
	trigger: React.ReactElement
	/** Só para captura de tela. */
	defaultOpen?: boolean
	container?: HTMLElement | null
}) {
	const copy = RESET_COPY[kind]
	const [open, setOpen] = useState(defaultOpen ?? false)
	return (
		<AlertDialog open={open} onOpenChange={setOpen}>
			<AlertDialogTrigger render={trigger} />
			<AlertDialogContent container={container}>
				<AlertDialogHeader>
					<AlertDialogTitle>{copy.title}</AlertDialogTitle>
					<AlertDialogDescription>
						Edição {editionName}. {copy.body(count)}
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					{/* Foco inicial no Cancelar: Enter por reflexo não apaga nada. */}
					<AlertDialogCancel autoFocus>Cancelar</AlertDialogCancel>
					<AlertDialogAction
						variant={copy.variant}
						onClick={() => {
							onConfirm()
							setOpen(false)
						}}
						disabled={busy}
					>
						{copy.action}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	)
}

function FlagsTable({ persons, onUpdate }: { persons: Person[]; onUpdate: (id: number, changes: PersonChanges) => void }) {
	if (persons.length === 0) return null
	return (
		<div className="max-h-96 overflow-auto rounded-lg border border-border">
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead className="w-24">Class.</TableHead>
						<TableHead>Nome</TableHead>
						<TableHead className="w-24 text-center">No telão</TableHead>
						<TableHead className="w-28 text-center">OM revelada</TableHead>
						<TableHead className="w-28 text-center">Confirmado</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{byClassification(persons).map((p) => (
						<TableRow key={p.id}>
							<TableCell>
								<Input
									type="number"
									defaultValue={p.classificacao}
									aria-label={`Classificação de ${p.nome}`}
									onBlur={(e) => {
										const value = e.target.valueAsNumber
										if (Number.isInteger(value) && value !== p.classificacao) onUpdate(p.id, { classificacao: value })
									}}
									className="w-20"
								/>
							</TableCell>
							<TableCell>
								<Input
									type="text"
									defaultValue={p.nome}
									aria-label={`Nome do ${p.classificacao}º`}
									onBlur={(e) => {
										const value = e.target.value.trim()
										if (value && value !== p.nome) onUpdate(p.id, { nome: value })
									}}
									className="min-w-40"
								/>
							</TableCell>
							<FlagCell label={`${p.nome} no telão`} checked={p.show_card} onChange={(v) => onUpdate(p.id, { show_card: v })} />
							<FlagCell label={`OM de ${p.nome} revelada`} checked={p.show_om} onChange={(v) => onUpdate(p.id, { show_om: v })} />
							<FlagCell label={`${p.nome} confirmado`} checked={p.hide_card} onChange={(v) => onUpdate(p.id, { hide_card: v })} />
						</TableRow>
					))}
				</TableBody>
			</Table>
		</div>
	)
}

function FlagCell({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
	return (
		<TableCell className="text-center">
			<div className="flex justify-center">
				<Checkbox checked={checked} onCheckedChange={(v) => onChange(v === true)} aria-label={label} />
			</div>
		</TableCell>
	)
}
