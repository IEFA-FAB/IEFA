import type { Person } from "@iefa/database/assignment-selection"
import { ClipboardList, LogOut, Radio } from "lucide-react"
import { useMemo } from "react"
import { ConductPanel } from "@/components/ConductPanel"
import { toOmItems } from "@/components/controller/OmCombobox"
import { PrepareTable } from "@/components/controller/PrepareTable"
import { RecoveryPanel, type UpdatePerson } from "@/components/controller/RecoveryPanel"
import { ScreenStatusBar } from "@/components/controller/ScreenStatusBar"
import { EditionSelect } from "@/components/EditionSelect"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsPanel, TabsTab } from "@/components/ui/tabs"
import { deriveConduct, deriveScreenView, type UndoAction } from "@/lib/conduct"
import { buildOmOptions, estadoForOm, hasVacancyBoard } from "@/lib/om-options"
import type { BoardData } from "@/server/assignment.fn"

export type ControllerTab = "conduct" | "prepare"

/**
 * Ações do operador. As da condução recebem o militar como a tela o viu: é dele que sai o
 * estado esperado que o servidor confere antes de gravar.
 */
export interface ControllerActions {
	call: (person: Person) => void
	reveal: (person: Person) => void
	confirm: (person: Person) => void
	/** `estado` vem do quadro de vagas: é por ele que o mapa do telão destaca. */
	changeOm: (person: Person, om: string, estado: string) => void
	undo: (undo: UndoAction<Person>) => void
	activate: () => void
	setLock: (locked: boolean) => void
	resetScreen: () => void
	clearChoices: () => void
	updatePerson: UpdatePerson
	skip: (personId: number) => void
	unskip: (personId: number) => void
}

/** Escrita em andamento, para travar o que não pode mudar no meio dela. */
export type PendingAction = "call" | "reveal" | "confirm" | "undo" | "om" | "screen" | "person"

interface ControllerViewProps {
	data: Pick<BoardData, "editionId" | "editions" | "persons" | "vacancies">
	tab: ControllerTab
	onTabChange: (tab: ControllerTab) => void
	onEditionChange: (editionId: string) => void
	userEmail?: string | null
	onSignOut: () => void
	busy?: boolean
	pendingAction?: PendingAction | null
	/** Ids pulados na condução (locais a este navegador, por edição). */
	skipped: ReadonlySet<number>
	actions: ControllerActions
}

/**
 * Painel do operador, sem dado de rede: a rota entrega o quadro e as ações. Duas abas,
 * uma por momento: **Preparar** (antes do evento, a lista e as OMs) e **Conduzir** (no
 * dia, um militar por vez). A faixa do telão fica fixa no topo nas duas.
 */
export function ControllerView({ data, tab, onTabChange, onEditionChange, userEmail, onSignOut, busy, pendingAction, skipped, actions }: ControllerViewProps) {
	const conduct = useMemo(() => deriveConduct(data.persons, skipped), [data.persons, skipped])
	const screen = useMemo(() => deriveScreenView(data.editions, data.editionId, data.persons), [data.editions, data.editionId, data.persons])
	const omOptions = useMemo(() => buildOmOptions(data.vacancies, data.persons), [data.vacancies, data.persons])
	// Uma lista de itens por quadro, a mesma referência para todos os combobox da tela.
	const omItems = useMemo(() => toOmItems(omOptions), [omOptions])
	const hasBoard = hasVacancyBoard(data.vacancies)
	const changeOm = (person: Person, om: string) => actions.changeOm(person, om, estadoForOm(omOptions, om))
	const offAir = screen.kind === "other-edition" || screen.kind === "no-edition"
	const editionName = data.editions.find((e) => e.id === data.editionId)?.name ?? "—"

	return (
		<div className="min-h-screen bg-background text-foreground">
			<Tabs value={tab} onValueChange={(v) => onTabChange(v as ControllerTab)}>
				<header className="sticky top-0 z-30 border-b border-border bg-background/95 supports-backdrop-filter:bg-background/85 supports-backdrop-filter:backdrop-blur">
					<div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-4 pt-3 sm:px-6">
						<div className="min-w-0">
							<h1 className="text-base font-semibold leading-tight text-foreground">Escolha de Vagas</h1>
							<p className="text-xs text-muted-foreground">Controle do telão · CPAINT</p>
						</div>

						<TabsList aria-label="Momento">
							<TabsTab value="prepare">
								<ClipboardList /> Preparar
							</TabsTab>
							<TabsTab value="conduct">
								<Radio /> Conduzir
							</TabsTab>
						</TabsList>

						<div className="ml-auto flex items-center gap-2">
							<EditionSelect editions={data.editions} value={data.editionId} onChange={onEditionChange} />
							{userEmail && (
								<span className="hidden max-w-[22ch] truncate text-xs text-muted-foreground md:inline" title={userEmail}>
									{userEmail}
								</span>
							)}
							<Button variant="ghost" size="icon" onClick={onSignOut} aria-label="Sair" title="Sair">
								<LogOut />
							</Button>
						</div>
					</div>

					<div className="mx-auto max-w-6xl px-4 py-3 sm:px-6">
						<ScreenStatusBar view={screen} busy={busy} onActivate={actions.activate} onToggleLock={actions.setLock} />
					</div>
				</header>

				<main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
					<TabsPanel value="conduct">
						<ConductPanel
							state={conduct}
							omItems={omItems}
							hasVacancyBoard={hasBoard}
							busy={busy}
							omLocked={pendingAction === "reveal" || pendingAction === "confirm"}
							offAir={offAir}
							onActivate={actions.activate}
							shortcutEnabled={tab === "conduct"}
							onCall={actions.call}
							onReveal={actions.reveal}
							onConfirm={actions.confirm}
							onChangeOm={changeOm}
							onUndo={actions.undo}
							onSkip={actions.skip}
							onUnskip={actions.unskip}
						/>
					</TabsPanel>

					<TabsPanel value="prepare">
						<div className="flex flex-col gap-8">
							<PrepareTable persons={data.persons} omItems={omItems} hasVacancyBoard={hasBoard} onChangeOm={changeOm} />
							<RecoveryPanel
								persons={data.persons}
								editionName={editionName}
								busy={busy}
								onUpdate={actions.updatePerson}
								onResetScreen={actions.resetScreen}
								onClearChoices={actions.clearChoices}
							/>
						</div>
					</TabsPanel>
				</main>
			</Tabs>
		</div>
	)
}
