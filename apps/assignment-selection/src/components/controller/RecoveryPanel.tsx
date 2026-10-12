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

/** `onError`: a gravação falhou; o campo volta ao valor do servidor. */
export type UpdatePerson = (person: Person, changes: PersonChanges, options?: { onError?: () => void }) => void

interface RecoveryPanelProps {
	persons: Person[]
	editionName: string
	busy?: boolean
	onUpdate: UpdatePerson
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

function FlagsTable({ persons, onUpdate }: { persons: Person[]; onUpdate: UpdatePerson }) {
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
								<BlurField
									// A chave muda com o valor do servidor: o campo remonta com o dado novo.
									key={`c:${p.classificacao}`}
									type="number"
									value={String(p.classificacao)}
									label={`Classificação de ${p.nome}`}
									className="w-20"
									parse={(raw) => {
										const n = Number(raw)
										return Number.isInteger(n) ? n : null
									}}
									onCommit={(value, onError) => onUpdate(p, { classificacao: value }, { onError })}
								/>
							</TableCell>
							<TableCell>
								<BlurField
									key={`n:${p.nome}`}
									type="text"
									value={p.nome}
									label={`Nome do ${p.classificacao}º`}
									className="min-w-40"
									parse={(raw) => raw.trim() || null}
									onCommit={(value, onError) => onUpdate(p, { nome: value }, { onError })}
								/>
							</TableCell>
							{/* A marca vai com o valor que a tela mostrava: se outro controle mudou, o servidor recusa. */}
							<FlagCell label={`${p.nome} no telão`} checked={p.show_card} onChange={(v) => onUpdate(p, { show_card: v })} />
							<FlagCell label={`OM de ${p.nome} revelada`} checked={p.show_om} onChange={(v) => onUpdate(p, { show_om: v })} />
							<FlagCell label={`${p.nome} confirmado`} checked={p.hide_card} onChange={(v) => onUpdate(p, { hide_card: v })} />
						</TableRow>
					))}
				</TableBody>
			</Table>
		</div>
	)
}

/**
 * Campo que grava ao sair, e só se o valor mudou desde que ganhou o foco: passar com Tab
 * por um campo não regrava nada, nem desfaz o que outro controle gravou enquanto isso.
 * Se a gravação falhar, volta ao valor do servidor.
 */
function BlurField<T>({
	type,
	value,
	label,
	className,
	parse,
	onCommit,
}: {
	type: "text" | "number"
	value: string
	label: string
	className?: string
	parse: (raw: string) => T | null
	onCommit: (value: T, onError: () => void) => void
}) {
	return (
		<Input
			type={type}
			defaultValue={value}
			aria-label={label}
			className={className}
			onFocus={(e) => {
				e.currentTarget.dataset.initial = e.currentTarget.value
			}}
			onBlur={(e) => {
				const input = e.currentTarget
				const raw = input.value
				if (raw === (input.dataset.initial ?? value)) return
				const parsed = parse(raw)
				if (parsed === null) {
					input.value = value
					return
				}
				onCommit(parsed, () => {
					input.value = value
				})
			}}
		/>
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
