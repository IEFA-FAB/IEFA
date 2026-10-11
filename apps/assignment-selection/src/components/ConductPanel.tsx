import type { Person } from "@iefa/database/assignment-selection"
import { Check, CheckCircle2, CornerUpLeft, Eye, Megaphone, MonitorOff, MonitorUp, PartyPopper, UserX } from "lucide-react"
import { useEffect, useId, useRef } from "react"
import { NO_BOARD_MESSAGE, REVEALED_OM_WARNING } from "@/components/controller/copy"
import { OmCombobox } from "@/components/controller/OmCombobox"
import { Button } from "@/components/ui/button"
import type { ComboboxOption } from "@/components/ui/combobox"
import { type ConductState, type ConductStep, describeUndo, isShortcutTarget, type UndoAction } from "@/lib/conduct"
import { cn } from "@/lib/utils"

export interface ConductPanelProps {
	state: ConductState<Person>
	/** Itens do combobox de OM, memoizados por quem chama (mesma referência entre renders). */
	omItems: ComboboxOption[]
	/** A edição tem quadro de vagas; sem ele nenhuma OM pode ser escolhida. */
	hasVacancyBoard: boolean
	busy?: boolean
	/** Revelar ou confirmar em andamento: a OM do militar da vez não muda no meio. */
	omLocked?: boolean
	/**
	 * A edição vista não é a do telão: nada daqui apareceria na projeção, então chamar,
	 * revelar, confirmar e o Enter ficam desligados até ativá-la.
	 */
	offAir?: boolean
	onActivate: () => void
	/** Enter avança o passo quando o foco não está num campo. Desligado fora da aba. */
	shortcutEnabled?: boolean
	onCall: (person: Person) => void
	onReveal: (person: Person) => void
	onConfirm: (person: Person) => void
	onChangeOm: (person: Person, om: string) => void
	onUndo: (undo: UndoAction<Person>) => void
	onSkip: (personId: number) => void
	onUnskip: (personId: number) => void
}

const STEPS: { step: Exclude<ConductStep, "done">; label: string }[] = [
	{ step: "call", label: "Chamar ao telão" },
	{ step: "reveal", label: "Revelar OM" },
	{ step: "confirm", label: "Confirmar" },
]

const STEP_INDEX: Record<ConductStep, number> = { call: 0, reveal: 1, confirm: 2, done: 3 }

/**
 * Condução no dia: um militar em foco e uma ação principal por passo. O operador segue o
 * locutor; quem decide o ritmo é o microfone, não a tela. Por isso a ação é uma só, grande,
 * e o erro se desfaz com um clique em vez de exigir a tabela.
 */
export function ConductPanel({
	state,
	omItems,
	hasVacancyBoard,
	busy,
	omLocked,
	offAir,
	onActivate,
	shortcutEnabled,
	onCall,
	onReveal,
	onConfirm,
	onChangeOm,
	onUndo,
	onSkip,
	onUnskip,
}: ConductPanelProps) {
	const { step, current, undo } = state
	const omFieldId = useId()
	const omHintId = useId()
	const primaryRef = useRef<HTMLButtonElement>(null)

	const canReveal = !!current?.localidade
	const primary = current ? primaryAction(step, current, { onCall, onReveal, onConfirm }) : null
	const primaryDisabled = busy || offAir || !primary || (step === "reveal" && !canReveal)
	const isShortcutOn = shortcutEnabled && !offAir
	const canSkip = step === "call" && !!current && !state.isCurrentSkipped

	// Enter avança, Esc não faz nada: desfazer exige o botão, que diz o que vai acontecer.
	useEffect(() => {
		if (!isShortcutOn) return
		const onKeyDown = (e: KeyboardEvent) => {
			if (e.key !== "Enter" || e.repeat || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return
			if (!isShortcutTarget(e.target as HTMLElement | null)) return
			e.preventDefault()
			primaryRef.current?.click()
		}
		window.addEventListener("keydown", onKeyDown)
		return () => window.removeEventListener("keydown", onKeyDown)
	}, [isShortcutOn])

	return (
		<div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
			<section aria-labelledby="conduct-heading" className="flex flex-col gap-6 rounded-xl border border-border bg-card p-5 text-card-foreground sm:p-6">
				<h2 id="conduct-heading" className="sr-only">
					Militar da vez
				</h2>

				{offAir && <OffAirNotice busy={busy} onActivate={onActivate} />}

				<Stepper step={step} />

				{current ? (
					<>
						<div className="flex items-start gap-4">
							<span className="grid h-16 min-w-16 shrink-0 place-items-center rounded-xl bg-muted px-2 text-2xl font-semibold tabular-nums text-foreground">
								{current.classificacao}º
							</span>
							<div className="min-w-0 pt-1">
								<p className="text-sm text-muted-foreground">{stepCaption(step, state.isCurrentSkipped)}</p>
								<p className="truncate text-3xl font-semibold tracking-tight text-foreground">{current.nome}</p>
							</div>
						</div>

						<div className="grid gap-1.5">
							<label htmlFor={omFieldId} className="text-sm font-medium text-foreground">
								OM escolhida
							</label>
							{hasVacancyBoard ? (
								<OmCombobox
									id={omFieldId}
									size="lg"
									value={current.localidade}
									items={omItems}
									onChange={(om) => onChangeOm(current, om)}
									disabled={omLocked}
									aria-describedby={omHintId}
								/>
							) : (
								<p id={omFieldId} className="flex h-11 items-center rounded-lg border border-border bg-muted/50 px-3 text-base text-muted-foreground">
									{current.localidade ?? "Sem OM"}
								</p>
							)}
							<p id={omHintId} className={cn("text-sm", step === "confirm" || !hasVacancyBoard ? "text-warning" : "text-muted-foreground")}>
								{hasVacancyBoard ? omHint(step, canReveal) : NO_BOARD_MESSAGE}
							</p>
						</div>

						<div className="flex flex-col gap-3">
							{primary && (
								<Button ref={primaryRef} size="xl" className="w-full" onClick={primary.run} disabled={primaryDisabled}>
									<primary.icon /> {primary.label}
									{isShortcutOn && (
										<kbd className="ml-auto hidden rounded-md border border-current/25 px-1.5 py-0.5 text-xs font-medium opacity-70 sm:inline">Enter</kbd>
									)}
								</Button>
							)}
							<div className="flex flex-wrap items-center justify-between gap-2">
								<UndoButton undo={undo} busy={busy || offAir} onUndo={onUndo} />
								{canSkip && (
									<Button
										variant="outline"
										className="ml-auto"
										onClick={() => onSkip(current.id)}
										disabled={offAir}
										title="O militar não está presente: sai da fila e fica em 'Ficaram para trás'"
									>
										<UserX /> Pular (ausente)
									</Button>
								)}
							</div>
						</div>
					</>
				) : (
					<DoneState total={state.total} confirmed={state.confirmed} undo={undo} busy={busy || offAir} onUndo={onUndo} />
				)}
			</section>

			<QueueAside state={state} busy={busy || offAir} onCall={onCall} onUnskip={onUnskip} />
		</div>
	)
}

function OffAirNotice({ busy, onActivate }: { busy?: boolean; onActivate: () => void }) {
	return (
		<div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-muted/60 px-4 py-3">
			<MonitorOff className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
			<p className="min-w-0 flex-1 text-sm text-foreground">
				Esta edição não está no telão. Chamar, revelar e confirmar ficam desligados: a plateia não veria nada.
			</p>
			<Button onClick={onActivate} disabled={busy}>
				<MonitorUp /> Levar esta edição ao telão
			</Button>
		</div>
	)
}

function primaryAction(
	step: ConductStep,
	person: Person,
	handlers: Pick<ConductPanelProps, "onCall" | "onReveal" | "onConfirm">
): { label: string; icon: typeof Megaphone; run: () => void } | null {
	switch (step) {
		case "call":
			return { label: "Chamar ao telão", icon: Megaphone, run: () => handlers.onCall(person) }
		case "reveal":
			return { label: "Revelar OM", icon: Eye, run: () => handlers.onReveal(person) }
		case "confirm":
			return { label: "Confirmar escolha", icon: CheckCircle2, run: () => handlers.onConfirm(person) }
		case "done":
			return null
	}
}

function stepCaption(step: ConductStep, isSkipped: boolean): string {
	switch (step) {
		case "call":
			return isSkipped ? "Pulado antes · a fila acabou e ele voltou" : "Próximo a chamar"
		case "reveal":
			return "No telão · OM oculta para a plateia"
		case "confirm":
			return "No telão · OM revelada"
		case "done":
			return ""
	}
}

function omHint(step: ConductStep, hasOm: boolean): string {
	if (step === "confirm") return REVEALED_OM_WARNING
	if (!hasOm) return "Sem OM preenchida. Escolha a que o militar anunciar para poder revelar."
	return "Preenchida antes do evento. Se o militar mudar, troque aqui; a plateia só vê ao revelar."
}

function Stepper({ step }: { step: ConductStep }) {
	const index = STEP_INDEX[step]
	return (
		<ol className="flex items-center gap-2 text-sm" aria-label="Passos">
			{STEPS.map((s, i) => {
				const isDone = i < index
				const isCurrent = i === index
				return (
					<li key={s.step} className="flex flex-1 items-center gap-2" aria-current={isCurrent ? "step" : undefined}>
						<span
							className={cn(
								"grid size-6 shrink-0 place-items-center rounded-full border text-xs font-semibold tabular-nums",
								isCurrent && "border-foreground bg-foreground text-background",
								isDone && "border-success/40 bg-success/15 text-success",
								!isCurrent && !isDone && "border-border text-muted-foreground"
							)}
						>
							{isDone ? <Check className="size-3.5" aria-label="feito" /> : i + 1}
						</span>
						<span className={cn("whitespace-nowrap", isCurrent ? "font-semibold text-foreground" : "text-muted-foreground")}>{s.label}</span>
						{i < STEPS.length - 1 && <span aria-hidden="true" className="h-px min-w-4 flex-1 bg-border" />}
					</li>
				)
			})}
		</ol>
	)
}

function UndoButton({ undo, busy, onUndo }: { undo: UndoAction<Person> | null; busy?: boolean; onUndo: (undo: UndoAction<Person>) => void }) {
	if (!undo) return null
	return (
		<Button variant="ghost" onClick={() => onUndo(undo)} disabled={busy}>
			<CornerUpLeft /> {describeUndo(undo)}
		</Button>
	)
}

function DoneState({
	total,
	confirmed,
	undo,
	busy,
	onUndo,
}: {
	total: number
	confirmed: number
	undo: UndoAction<Person> | null
	busy?: boolean
	onUndo: (undo: UndoAction<Person>) => void
}) {
	if (total === 0) {
		return <p className="py-6 text-base text-muted-foreground">Nenhum militar nesta edição. Cadastre a lista antes de conduzir.</p>
	}
	return (
		<div className="flex flex-col items-start gap-3 py-2">
			<span className="grid size-12 place-items-center rounded-xl bg-success/15 text-success" aria-hidden="true">
				<PartyPopper className="size-6" />
			</span>
			<div>
				<p className="text-2xl font-semibold tracking-tight text-foreground">Escolha concluída</p>
				<p className="text-sm text-muted-foreground">
					{confirmed} de {total} confirmados. O telão mostra o quadro e o mapa completos.
				</p>
			</div>
			<UndoButton undo={undo} busy={busy} onUndo={onUndo} />
		</div>
	)
}

const UPCOMING_LIMIT = 6

function QueueAside({
	state,
	busy,
	onCall,
	onUnskip,
}: {
	state: ConductState<Person>
	busy?: boolean
	onCall: (person: Person) => void
	onUnskip: (personId: number) => void
}) {
	const { total, confirmed, upcoming, behind, missingOm, step } = state
	const pct = total > 0 ? Math.round((confirmed / total) * 100) : 0
	const shown = upcoming.slice(0, UPCOMING_LIMIT)

	return (
		<aside className="flex flex-col gap-5 rounded-xl border border-border bg-card/60 p-4 text-card-foreground" aria-label="Fila">
			<div className="grid gap-2">
				<div className="flex items-baseline justify-between gap-2">
					<span className="text-sm font-medium text-foreground">Confirmados</span>
					<span className="text-sm tabular-nums text-muted-foreground">
						<span className="font-semibold text-foreground">{confirmed}</span> de {total}
					</span>
				</div>
				<div
					role="progressbar"
					aria-label="Confirmados"
					aria-valuemin={0}
					aria-valuemax={total}
					aria-valuenow={confirmed}
					className="h-1.5 overflow-hidden rounded-full bg-muted"
				>
					<div
						className="h-full origin-left rounded-full bg-success transition-transform duration-300 ease-out"
						style={{ transform: `scaleX(${pct / 100})` }}
					/>
				</div>
				{missingOm > 0 && (
					<p className="text-sm text-warning">
						{missingOm} {missingOm === 1 ? "militar ainda sem OM" : "militares ainda sem OM"}
					</p>
				)}
			</div>

			{step !== "done" && (
				<QueueList title="A seguir" people={shown} more={upcoming.length - shown.length} busy={busy} onCall={onCall} empty="Ninguém depois deste." />
			)}

			{behind.length > 0 && (
				<QueueList
					title="Ficaram para trás"
					description="Pulados como ausentes. Chame quando o locutor pedir; voltam sozinhos quando a fila acabar."
					people={behind}
					busy={busy}
					onCall={onCall}
					onUnskip={onUnskip}
				/>
			)}
		</aside>
	)
}

function QueueList({
	title,
	description,
	people,
	more = 0,
	empty,
	busy,
	onCall,
	onUnskip,
}: {
	title: string
	description?: string
	people: Person[]
	more?: number
	empty?: string
	busy?: boolean
	onCall: (person: Person) => void
	/** Só na lista de pulados: devolve o militar à fila, na posição da classificação. */
	onUnskip?: (personId: number) => void
}) {
	return (
		<div className="grid gap-2">
			<div>
				<h3 className="text-sm font-medium text-foreground">{title}</h3>
				{description && <p className="text-xs text-muted-foreground">{description}</p>}
			</div>
			{people.length === 0 ? (
				empty && <p className="text-sm text-muted-foreground">{empty}</p>
			) : (
				<ul className="-mx-2 grid">
					{people.map((p) => (
						<li key={p.id} className="flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-muted/60">
							<span className="w-8 shrink-0 text-right text-sm tabular-nums text-muted-foreground">{p.classificacao}º</span>
							<span className="min-w-0 flex-1">
								<span className="block truncate text-sm font-medium text-foreground">{p.nome}</span>
								{p.localidade ? (
									<span className="block truncate text-xs text-muted-foreground">{p.localidade}</span>
								) : (
									<span className="block text-xs font-medium text-warning">Sem OM</span>
								)}
							</span>
							{onUnskip && (
								<Button
									variant="ghost"
									size="xs"
									onClick={() => onUnskip(p.id)}
									aria-label={`Devolver ${p.classificacao}º ${p.nome} à fila`}
									title="Devolver à fila"
								>
									Devolver
								</Button>
							)}
							<Button
								variant="outline"
								size="xs"
								onClick={() => onCall(p)}
								disabled={busy}
								aria-label={`Chamar ${p.classificacao}º ${p.nome} ao telão agora, fora da ordem`}
								title="Chamar agora, fora da ordem"
							>
								Chamar
							</Button>
						</li>
					))}
				</ul>
			)}
			{more > 0 && <p className="text-xs text-muted-foreground">e mais {more} na fila</p>}
		</div>
	)
}
