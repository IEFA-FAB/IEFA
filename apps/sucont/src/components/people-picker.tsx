import { Check, ChevronDown, Users } from "lucide-react"
import { useId, useState } from "react"
import { Badge } from "#/components/ui/badge"
import { Button } from "#/components/ui/button"
import { Checkbox } from "#/components/ui/checkbox"
import { Popover, PopoverContent, PopoverTrigger } from "#/components/ui/popover"
import { cn } from "#/lib/utils"
import type { SectionPerson } from "#/server/people.fn"

/**
 * Seletores de pessoa do cronograma e das UGs.
 *
 * Os dois substituem campo de texto livre. O do cronograma escolhe VÁRIAS pessoas
 * porque uma linha do seed empacotava três num campo só
 * ("SGT KLEBSON, 3S VANESSA, SGT IARA"); o da UG escolhe uma, ou nenhuma.
 *
 * Popover com caixas de seleção, e não um `Select` múltiplo: o Base UI não expõe
 * seleção múltipla, e um `<select multiple>` nativo está fora do contrato de
 * estilo do repositório.
 */

/** "Cada responsável" não é pessoa — é "vale para todo mundo". */
export type AssigneeValue = { personIds: string[]; assignToAll: boolean }

export function AssigneePicker({
	people,
	value,
	onChange,
	disabled,
}: {
	people: SectionPerson[]
	value: AssigneeValue
	onChange: (next: AssigneeValue) => void
	disabled?: boolean
}) {
	const [open, setOpen] = useState(false)
	const allId = useId()
	const chosen = new Set(value.personIds)
	const selected = people.filter((p) => chosen.has(p.id))

	function toggle(id: string) {
		const next = chosen.has(id) ? value.personIds.filter((p) => p !== id) : [...value.personIds, id]
		onChange({ ...value, personIds: next })
	}

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger
				render={
					<Button
						type="button"
						variant="ghost"
						disabled={disabled}
						className="h-auto w-full justify-end gap-2 p-0 text-right hover:bg-transparent disabled:opacity-100"
						aria-label="Escolher responsáveis"
					>
						<AssigneeSummary value={value} selected={selected} />
						{!disabled && <ChevronDown className="size-3 shrink-0 text-muted-foreground" />}
					</Button>
				}
			/>
			<PopoverContent align="end" className="w-72 gap-0 p-0">
				<div className="border-b border-border px-3 py-2">
					<h3 className="text-label text-muted-foreground">Responsáveis</h3>
				</div>
				{/*
				 * `htmlFor` apontando para o id da caixa, e não `<label>` envolvendo:
				 * o Checkbox do Base UI renderiza um `<button role="checkbox">`, e
				 * label envolvendo um botão NÃO associa — clicar no texto não marcaria
				 * nada, e o leitor de tela anunciaria a caixa sem nome.
				 */}
				<label htmlFor={allId} className="flex cursor-pointer items-center gap-2 border-b border-border px-3 py-2.5 transition-colors hover:bg-muted/50">
					<Checkbox id={allId} checked={value.assignToAll} onCheckedChange={(checked) => onChange({ ...value, assignToAll: Boolean(checked) })} />
					<span className="text-caption text-foreground">Cada responsável</span>
					<span className="ml-auto text-hint text-muted-foreground">vale para a seção</span>
				</label>
				<ul className="max-h-64 overflow-y-auto">
					{people.length === 0 ? (
						<li className="px-3 py-6 text-center text-caption text-muted-foreground">Nenhuma pessoa cadastrada na seção.</li>
					) : (
						people.map((person) => (
							<li key={person.id}>
								<label htmlFor={`${allId}-${person.id}`} className="flex cursor-pointer items-center gap-2 px-3 py-2.5 transition-colors hover:bg-muted/50">
									<Checkbox id={`${allId}-${person.id}`} checked={chosen.has(person.id)} onCheckedChange={() => toggle(person.id)} />
									<span className="min-w-0 truncate text-caption text-foreground">{person.label}</span>
									{/* Sem conta a pessoa recebe a tarefa, mas não recebe o sino.
									    Dizer isso aqui evita a suposição de que ela foi avisada. */}
									{!person.hasAccount && <span className="ml-auto shrink-0 text-hint text-muted-foreground">sem conta</span>}
								</label>
							</li>
						))
					)}
				</ul>
			</PopoverContent>
		</Popover>
	)
}

function AssigneeSummary({ value, selected }: { value: AssigneeValue; selected: SectionPerson[] }) {
	if (value.assignToAll && selected.length === 0) {
		return (
			<span className="flex items-center gap-1.5 text-subheading text-tech-cyan">
				<Users className="size-3.5" /> Cada responsável
			</span>
		)
	}
	if (selected.length === 0) return <span className="text-subheading text-muted-foreground">Sem responsável</span>
	return (
		<span className="flex flex-wrap justify-end gap-1">
			{value.assignToAll && (
				<Badge variant="muted" className="gap-1">
					<Users className="size-3" /> todos
				</Badge>
			)}
			{selected.map((person) => (
				<Badge key={person.id} variant="action">
					{person.label}
				</Badge>
			))}
		</span>
	)
}

/** Operador de uma Unidade Gestora — uma pessoa, ou nenhuma. */
export function OperatorPicker({
	people,
	value,
	onChange,
	label,
}: {
	people: SectionPerson[]
	value: string | null
	onChange: (personId: string | null) => void
	label: string
}) {
	const [open, setOpen] = useState(false)

	function pick(personId: string | null) {
		setOpen(false)
		onChange(personId)
	}

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger
				render={
					<Button
						type="button"
						variant="ghost"
						size="icon-xs"
						aria-label={`Mudar o operador da UG ${label}`}
						className="text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover/ug:opacity-100"
					>
						<ChevronDown className="size-3" />
					</Button>
				}
			/>
			<PopoverContent align="end" className="w-64 gap-0 p-0">
				<div className="border-b border-border px-3 py-2">
					<h3 className="text-label text-muted-foreground">Operador da UG {label}</h3>
				</div>
				<ul className="max-h-64 overflow-y-auto">
					{people.map((person) => (
						<li key={person.id}>
							<button
								type="button"
								onClick={() => pick(person.id)}
								className={cn(
									"flex w-full items-center gap-2 px-3 py-2.5 text-left text-caption transition-colors hover:bg-muted/50",
									person.id === value ? "text-tech-cyan" : "text-foreground"
								)}
							>
								<Check className={cn("size-3.5 shrink-0", person.id === value ? "opacity-100" : "opacity-0")} />
								<span className="min-w-0 truncate">{person.label}</span>
							</button>
						</li>
					))}
					<li className="border-t border-border">
						<button
							type="button"
							onClick={() => pick(null)}
							className={cn(
								"flex w-full items-center gap-2 px-3 py-2.5 text-left text-caption transition-colors hover:bg-muted/50",
								value === null ? "text-tech-cyan" : "text-muted-foreground"
							)}
						>
							<Check className={cn("size-3.5 shrink-0", value === null ? "opacity-100" : "opacity-0")} />
							Sem operador
						</button>
					</li>
				</ul>
			</PopoverContent>
		</Popover>
	)
}
