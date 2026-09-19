import type { UnitOption } from "@iefa/alpha-client/access"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Check, Prohibition, UserPlus, WarningTriangle, Xmark } from "iconoir-react"
import { useId, useState } from "react"
import { GLOBAL_UNIT, type UnitChoice, UnitSelect } from "@/components/alpha/UnitSelect"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { toast } from "@/components/ui/toast"
import {
	ALPHA_GRANT_ROLES,
	type AlphaGrantRole,
	canChangeOwnAccess,
	type GrantAlphaRolesInput,
	ROLE_INFO,
	type RoleGrantOutcome,
	summarizeGrantOutcomes,
	todayInBrasilia,
} from "@/lib/alpha/admin-access"
import { formatDate } from "@/lib/alpha/format"
import { cn } from "@/lib/utils"
import { grantAlphaRolesFn, type PersonCandidate, previewAlphaGrantFn, type RolePreview } from "@/server/access.fn"
import { PersonPicker } from "./PersonPicker"

/** Invalida tudo o que uma concessão muda: lista, painel e prévia. */
export function invalidateAccessQueries(queryClient: ReturnType<typeof useQueryClient>) {
	return queryClient.invalidateQueries({ queryKey: ["alpha", "access"] })
}

function RoleState({ preview }: { preview: RolePreview | undefined }) {
	if (!preview) return null
	const lines: React.ReactNode[] = []
	for (const existing of preview.existing) {
		if (existing.source === "policy") {
			lines.push(<span key={`p-${existing.policyName}`}>Já tem pela política “{existing.policyName}”.</span>)
		} else if (existing.expired) {
			lines.push(<span key="expired">Tinha até {formatDate(existing.expiresAt)} (vencido). Conceder reativa.</span>)
		} else {
			lines.push(
				<span key="inline" className="font-medium text-foreground">
					Já tem nesta OM{existing.expiresAt ? `, até ${formatDate(existing.expiresAt)}` : ", sem prazo"}. Conceder de novo substitui o prazo.
				</span>
			)
		}
	}
	if (preview.denyImpact === "full") {
		lines.push(
			<span key="deny" className="inline-flex items-center gap-1 text-destructive">
				<Prohibition className="size-3.5 shrink-0" aria-hidden="true" />
				Um bloqueio desta pessoa anula este papel aqui. O acesso seria gravado, mas não valeria.
			</span>
		)
	} else if (preview.denyImpact === "partial") {
		lines.push(
			<span key="deny" className="inline-flex items-center gap-1 text-destructive">
				<Prohibition className="size-3.5 shrink-0" aria-hidden="true" />
				Um bloqueio recorta este papel em parte das OMs: nelas ele não valeria.
			</span>
		)
	}
	if (lines.length === 0) return null
	return <span className="flex flex-col gap-0.5 text-muted-foreground text-xs">{lines}</span>
}

function OutcomeList({ outcomes }: { outcomes: RoleGrantOutcome[] }) {
	return (
		<ul className="flex flex-col divide-y divide-border border border-border text-sm" aria-label="Resultado da concessão">
			{outcomes.map((outcome) => {
				const label = ROLE_INFO[outcome.role].label
				if (outcome.status === "failed") {
					return (
						<li key={outcome.role} className="flex items-start gap-2 bg-destructive/5 px-3 py-2 text-destructive">
							<Xmark className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
							<span>
								<span className="font-medium">{label}: não concedido.</span> {outcome.message}
							</span>
						</li>
					)
				}
				const warn = outcome.blocked !== false
				return (
					<li key={outcome.role} className="flex items-start gap-2 px-3 py-2">
						{warn ? (
							<WarningTriangle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" />
						) : (
							<Check className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
						)}
						<span>
							<span className="font-medium">{label}: concedido.</span>{" "}
							{outcome.blocked === true
								? outcome.partial
									? "Vale, menos nas OMs bloqueadas."
									: "Gravado, mas um bloqueio o anula."
								: outcome.blocked === null
									? "Sem conferência de bloqueio: confira o painel da pessoa."
									: outcome.previousLevel !== null
										? "Já existia; prazo atualizado."
										: null}
						</span>
					</li>
				)
			})}
		</ul>
	)
}

/**
 * Conceder VÁRIOS papéis de uma vez: pessoa, OM, papéis (caixas), prazo opcional, um envio.
 * Cada papel vira uma concessão auditada própria no servidor, e o resultado volta papel a
 * papel — falha parcial aparece como falha parcial, nunca como "concedido".
 *
 * A prévia (`previewAlphaGrantFn`) mostra, para a OM escolhida, o que a pessoa já tem e se um
 * bloqueio dela anularia o papel — a mesma conta que o servidor faz depois de gravar.
 */
export function GrantRolesForm({
	fixedPerson,
	units,
	allowGlobal,
	initialUnit,
	currentUserId,
	isGlobalAdmin,
	onClose,
}: {
	/** A pessoa já escolhida (painel da pessoa); sem ela, o formulário abre na busca. */
	fixedPerson?: PersonCandidate | null
	units: readonly UnitOption[]
	allowGlobal: boolean
	initialUnit: UnitChoice | null
	currentUserId: string | null
	isGlobalAdmin: boolean
	onClose?: () => void
}) {
	const ids = useId()
	const queryClient = useQueryClient()
	const [person, setPerson] = useState<PersonCandidate | null>(fixedPerson ?? null)
	const [unit, setUnit] = useState<UnitChoice | null>(initialUnit)
	const [roles, setRoles] = useState<ReadonlySet<AlphaGrantRole>>(new Set())
	const [expiresOn, setExpiresOn] = useState("")
	const [outcomes, setOutcomes] = useState<RoleGrantOutcome[] | null>(null)

	const unitId = unit === null ? undefined : unit === GLOBAL_UNIT ? null : unit
	const preview = useQuery({
		queryKey: ["alpha", "access", "preview", person?.id ?? "", unit ?? "none"],
		queryFn: () => previewAlphaGrantFn({ data: { userId: person?.id ?? "", unitId: unitId ?? null } }),
		enabled: person !== null && unitId !== undefined,
		staleTime: 10_000,
	})
	const previewByRole = new Map((preview.data ?? []).map((entry) => [entry.role, entry]))

	const grant = useMutation({
		mutationFn: (data: GrantAlphaRolesInput) => grantAlphaRolesFn({ data }),
		onSuccess: (result) => {
			const summary = summarizeGrantOutcomes(result.outcomes)
			const show = summary.tone === "success" ? toast.success : summary.tone === "warning" ? toast.warning : toast.error
			show(summary.title, summary.description ? { description: summary.description, duration: 15_000 } : undefined)
			setOutcomes(result.outcomes)
			// Os que entraram saem da seleção; os que falharam ficam marcados para tentar de novo.
			setRoles(new Set(result.outcomes.filter((outcome) => outcome.status === "failed").map((outcome) => outcome.role)))
			void invalidateAccessQueries(queryClient)
		},
		onError: (error) => toast.error(error instanceof Error ? error.message : "Falha ao conceder"),
	})

	const isSelf = person !== null && person.id === currentUserId
	const selfBlocked = isSelf && !canChangeOwnAccess(isGlobalAdmin, { action: "grant" })
	const today = todayInBrasilia()
	const expiryInvalid = expiresOn !== "" && expiresOn < today
	const canSubmit = person !== null && unitId !== undefined && roles.size > 0 && !selfBlocked && !expiryInvalid && !grant.isPending

	function toggleRole(role: AlphaGrantRole, checked: boolean) {
		setOutcomes(null)
		setRoles((current) => {
			const next = new Set(current)
			if (checked) next.add(role)
			else next.delete(role)
			return next
		})
	}

	return (
		<form
			className="flex flex-col gap-5"
			onSubmit={(event) => {
				event.preventDefault()
				if (!canSubmit || person === null || unitId === undefined) return
				grant.mutate({ userId: person.id, roles: ALPHA_GRANT_ROLES.filter((role) => roles.has(role)), unitId, expiresOn: expiresOn || null })
			}}
		>
			{fixedPerson ? null : (
				<div className="flex flex-col gap-1.5">
					<label htmlFor={`${ids}-person`} className="text-label text-muted-foreground">
						Pessoa
					</label>
					<PersonPicker
						id={`${ids}-person`}
						value={person}
						autoFocus
						onChange={(next) => {
							setPerson(next)
							setOutcomes(null)
						}}
					/>
				</div>
			)}

			<div className="flex flex-col gap-1.5">
				<label htmlFor={`${ids}-unit`} className="text-label text-muted-foreground">
					OM
				</label>
				<UnitSelect
					id={`${ids}-unit`}
					units={units}
					value={unit}
					onChange={(next) => {
						setUnit(next)
						setOutcomes(null)
					}}
					allowGlobal={allowGlobal}
					className="max-w-none"
				/>
				<span className="text-muted-foreground text-xs">
					O papel numa OM que apoia outras alcança também as apoiadas.{allowGlobal ? " Global vale em todas as OMs." : ""}
				</span>
			</div>

			<fieldset className="flex flex-col gap-2" disabled={selfBlocked}>
				<div className="flex items-baseline justify-between gap-3">
					<legend className="text-label text-muted-foreground">Papéis</legend>
					<button
						type="button"
						className="text-xs underline-offset-2 hover:underline disabled:opacity-50"
						onClick={() => setRoles(roles.size === ALPHA_GRANT_ROLES.length ? new Set() : new Set(ALPHA_GRANT_ROLES))}
					>
						{roles.size === ALPHA_GRANT_ROLES.length ? "Desmarcar todos" : "Marcar os quatro"}
					</button>
				</div>
				<ul className="flex flex-col divide-y divide-border border border-border">
					{ALPHA_GRANT_ROLES.map((role) => {
						const checked = roles.has(role)
						const checkboxId = `${ids}-role-${role}`
						return (
							<li key={role} className={cn("transition-colors", checked && "bg-muted/60")}>
								<label htmlFor={checkboxId} className="flex items-start gap-3 px-3 py-2.5">
									<Checkbox id={checkboxId} className="mt-0.5" checked={checked} onCheckedChange={(next) => toggleRole(role, next)} />
									<span className="flex min-w-0 flex-col gap-0.5">
										<span className="font-medium text-sm">{ROLE_INFO[role].label}</span>
										<span className="text-muted-foreground text-xs">{ROLE_INFO[role].hint}</span>
										{preview.isLoading && person && unitId !== undefined ? (
											<span className="text-muted-foreground text-xs">Conferindo o que a pessoa já tem…</span>
										) : (
											<RoleState preview={previewByRole.get(role)} />
										)}
									</span>
								</label>
							</li>
						)
					})}
				</ul>
				{preview.isError ? (
					<span className="text-destructive text-xs">Não foi possível conferir o que a pessoa já tem. A concessão ainda confere os bloqueios ao gravar.</span>
				) : null}
			</fieldset>

			<div className="flex flex-col gap-1.5">
				<label htmlFor={`${ids}-expiry`} className="text-label text-muted-foreground">
					Prazo (opcional)
				</label>
				<div className="flex items-center gap-2">
					<Input
						id={`${ids}-expiry`}
						type="date"
						min={today}
						value={expiresOn}
						onChange={(event) => {
							setExpiresOn(event.target.value)
							setOutcomes(null)
						}}
						aria-invalid={expiryInvalid || undefined}
						aria-describedby={`${ids}-expiry-hint`}
						className="h-9 w-auto"
					/>
					{expiresOn ? (
						<Button type="button" variant="ghost" size="sm" onClick={() => setExpiresOn("")}>
							Sem prazo
						</Button>
					) : null}
				</div>
				<span id={`${ids}-expiry-hint`} className={cn("text-xs", expiryInvalid ? "text-destructive" : "text-muted-foreground")}>
					{expiryInvalid
						? "O prazo não pode ser uma data passada."
						: expiresOn
							? `Vale até o fim de ${formatDate(`${expiresOn}T12:00:00-03:00`)}, horário de Brasília.`
							: "Sem data, o acesso vale até alguém revogar."}
				</span>
			</div>

			{selfBlocked ? <p className="text-destructive text-sm">Este é o seu próprio acesso: só um administrador global o altera.</p> : null}
			{outcomes ? <OutcomeList outcomes={outcomes} /> : null}

			<div className="flex flex-wrap items-center gap-2">
				<Button type="submit" disabled={!canSubmit}>
					<UserPlus aria-hidden="true" />
					{grant.isPending ? "Concedendo…" : roles.size <= 1 ? "Conceder papel" : `Conceder ${roles.size} papéis`}
				</Button>
				{onClose ? (
					<Button type="button" variant="ghost" onClick={onClose}>
						{outcomes ? "Fechar" : "Cancelar"}
					</Button>
				) : null}
				<span className="text-muted-foreground text-xs">Cada papel fica registrado com o seu nome.</span>
			</div>
		</form>
	)
}
