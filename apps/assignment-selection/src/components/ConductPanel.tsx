import type { Person } from "@iefa/database/assignment-selection"
import { Check, CheckCircle2, CornerUpLeft, Eye, Megaphone, PartyPopper } from "lucide-react"
import { useEffect, useId, useRef } from "react"
import { OmCombobox } from "@/components/controller/OmCombobox"
import { Button } from "@/components/ui/button"
import { type ConductState, type ConductStep, describeUndo, isShortcutTarget, type UndoAction } from "@/lib/conduct"
import type { OmOption } from "@/lib/om-options"
import { cn } from "@/lib/utils"

export interface ConductPanelProps {
	state: ConductState<Person>
	omOptions: OmOption[]
	busy?: boolean
	/** Enter avança o passo quando o foco não está num campo. Desligado fora da aba. */
	shortcutEnabled?: boolean
	onCall: (personId: number) => void
	onReveal: (personId: number) => void
	onConfirm: (personId: number) => void
	onChangeOm: (personId: number, om: string) => void
	onUndo: (undo: UndoAction<Person>) => void
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
export function ConductPanel({ state, omOptions, busy, shortcutEnabled, onCall, onReveal, onConfirm, onChangeOm, onUndo }: ConductPanelProps) {
	const { step, current, undo } = state
	const omFieldId = useId()
	const omHintId = useId()
	const primaryRef = useRef<HTMLButtonElement>(null)

	const canReveal = !!current?.localidade
	const primary = current ? primaryAction(step, current, { onCall, onReveal, onConfirm }) : null
	const primaryDisabled = busy || !primary || (step === "reveal" && !canReveal)

	// Enter avança, Esc não faz nada: desfazer exige o botão, que diz o que vai acontecer.
	useEffect(() => {
		if (!shortcutEnabled) return
		const onKeyDown = (e: KeyboardEvent) => {
			if (e.key !== "Enter" || e.repeat || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return
			if (!isShortcutTarget(e.target as HTMLElement | null)) return
			e.preventDefault()
			primaryRef.current?.click()
		}
		window.addEventListener("keydown", onKeyDown)
		return () => window.removeEventListener("keydown", onKeyDown)
	}, [shortcutEnabled])

	return (
		<div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
			<section aria-labelledby="conduct-heading" className="flex flex-col gap-6 rounded-xl border border-border bg-card p-5 text-card-foreground sm:p-6">
				<h2 id="conduct-heading" className="sr-only">
					Militar da vez
				</h2>

				<Stepper step={step} />

				{current ? (
					<>
						<div className="flex items-start gap-4">
							<span className="grid h-16 min-w-16 shrink-0 place-items-center rounded-xl bg-muted px-2 text-2xl font-semibold tabular-nums text-foreground">
								{current.classificacao}º
							</span>
							<div className="min-w-0 pt-1">
								<p className="text-sm text-muted-foreground">{stepCaption(step)}</p>
								<p className="truncate text-3xl font-semibold tracking-tight text-foreground">{current.nome}</p>
							</div>
						</div>

						<div className="grid gap-1.5">
							<label htmlFor={omFieldId} className="text-sm font-medium text-foreground">
								OM escolhida
							</label>
							<OmCombobox
								id={omFieldId}
								size="lg"
								value={current.localidade}
								options={omOptions}
								onChange={(om) => onChangeOm(current.id, om)}
								aria-describedby={omHintId}
							/>
							<p id={omHintId} className={cn("text-sm", step === "confirm" ? "text-warning" : "text-muted-foreground")}>
								{omHint(step, canReveal)}
							</p>
						</div>

						<div className="flex flex-col gap-3">
							{primary && (
								<Button ref={primaryRef} size="xl" className="w-full" onClick={primary.run} disabled={primaryDisabled}>
									<primary.icon /> {primary.label}
									{shortcutEnabled && (
										<kbd className="ml-auto hidden rounded-md border border-current/25 px-1.5 py-0.5 text-xs font-medium opacity-70 sm:inline">Enter</kbd>
									)}
								</Button>
							)}
							<UndoButton undo={undo} busy={busy} onUndo={onUndo} />
						</div>
					</>
				) : (
					<DoneState total={state.total} confirmed={state.confirmed} undo={undo} busy={busy} onUndo={onUndo} />
				)}
			</section>

			<QueueAside state={state} busy={busy} onCall={onCall} />
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
			return { label: "Chamar ao telão", icon: Megaphone, run: () => handlers.onCall(person.id) }
		case "reveal":
			return { label: "Revelar OM", icon: Eye, run: () => handlers.onReveal(person.id) }
		case "confirm":
			return { label: "Confirmar escolha", icon: CheckCircle2, run: () => handlers.onConfirm(person.id) }
		case "done":
			return null
	}
}

function stepCaption(step: ConductStep): string {
	switch (step) {
		case "call":
			return "Próximo a chamar"
		case "reveal":
			return "No telão · OM oculta para a plateia"
		case "confirm":
			return "No telão · OM revelada"
		case "done":
			return ""
	}
}

function omHint(step: ConductStep, hasOm: boolean): string {
	if (step === "confirm") return "A OM já está no telão: trocar aqui muda a projeção na hora."
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
		<Button variant="ghost" className="self-start" onClick={() => onUndo(undo)} disabled={busy}>
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

function QueueAside({ state, busy, onCall }: { state: ConductState<Person>; busy?: boolean; onCall: (personId: number) => void }) {
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
					description="Não confirmados antes do militar em foco. Chame quando o locutor pedir."
					people={behind}
					busy={busy}
					onCall={onCall}
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
}: {
	title: string
	description?: string
	people: Person[]
	more?: number
	empty?: string
	busy?: boolean
	onCall: (personId: number) => void
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
						<li key={p.id} className="group/row flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-muted/60">
							<span className="w-8 shrink-0 text-right text-sm tabular-nums text-muted-foreground">{p.classificacao}º</span>
							<span className="min-w-0 flex-1">
								<span className="block truncate text-sm font-medium text-foreground">{p.nome}</span>
								{p.localidade ? (
									<span className="block truncate text-xs text-muted-foreground">{p.localidade}</span>
								) : (
									<span className="block text-xs font-medium text-warning">Sem OM</span>
								)}
							</span>
							<Button
								variant="outline"
								size="xs"
								onClick={() => onCall(p.id)}
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
