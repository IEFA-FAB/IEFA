import type { UnitOption } from "@iefa/alpha-client/access"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Lock, LockSlash, Prohibition, Trash, UserPlus, WarningTriangle } from "iconoir-react"
import { useState } from "react"
import type { UnitChoice } from "@/components/alpha/UnitSelect"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "@/components/ui/toast"
import { canChangeOwnAccess, grantRowKey, isExpiredGrant, ROLE_INFO, roleOfModule, splitGrantsByEffect } from "@/lib/alpha/admin-access"
import { formatDate, formatDateTime } from "@/lib/alpha/format"
import { type AlphaGrant, type AuditEntry, personLabel } from "@/lib/alpha/people"
import { cn } from "@/lib/utils"
import { fetchAlphaPersonFn, type PersonDetail, revokeAlphaPermissionFn, setAlphaCopilotBlockFn } from "@/server/access.fn"
import { GrantRolesForm, invalidateAccessQueries } from "./GrantRolesForm"
import { PersonStatusBadges } from "./RoleChips"

export const personQueryKey = (userId: string) => ["alpha", "access", "person", userId] as const

function unitLabel(grant: Pick<AlphaGrant, "unitId" | "unitCode">): string {
	return grant.unitId === null ? "Global" : (grant.unitCode ?? `OM ${grant.unitId}`)
}

const AUDIT_VERB: Record<AuditEntry["action"], string> = {
	grant: "Concedeu",
	revoke: "Revogou",
	block: "Bloqueou no copiloto",
	unblock: "Desbloqueou no copiloto",
}

function describeAudit(entry: AuditEntry): string {
	const role = entry.module ? ROLE_INFO[roleOfModule(entry.module)].label : "papel"
	if (entry.action === "block" || entry.action === "unblock") return `${AUDIT_VERB[entry.action]}: ${role}`
	const where = entry.unitId === null ? "global" : `em ${entry.unitCode ?? `OM ${entry.unitId}`}`
	const what = entry.action === "revoke" && entry.partition === "deny" ? `Retirou o bloqueio de ${role}` : `${AUDIT_VERB[entry.action]} ${role}`
	const until = entry.action === "grant" && entry.expiresAt ? `, até ${formatDate(entry.expiresAt)}` : ""
	return `${what} ${where}${until}`
}

/**
 * O painel de UMA pessoa: todos os papéis dela no que o administrador alcança, com revogar por
 * papel; os bloqueios (retirar é só do global); o bloqueio no copiloto (só o global, nunca
 * sobre si); conceder mais papéis sem sair daqui; e a trilha de quem alterou o quê, só leitura.
 *
 * Toda regra é reconferida no servidor. Aqui os botões só não oferecem o que seria recusado.
 */
export function PersonPanel({
	userId,
	onOpenChange,
	currentUserId,
	isGlobalAdmin,
	units,
	defaultUnit,
}: {
	userId: string | null
	onOpenChange: (open: boolean) => void
	currentUserId: string | null
	isGlobalAdmin: boolean
	units: readonly UnitOption[]
	/** A OM da página, para o formulário de concessão partir dela. */
	defaultUnit: UnitChoice | null
}) {
	return (
		<Sheet open={userId !== null} onOpenChange={onOpenChange}>
			<SheetContent side="right" className="overflow-y-auto data-[side=right]:w-full data-[side=right]:sm:max-w-xl">
				{userId ? (
					<PersonPanelBody key={userId} userId={userId} currentUserId={currentUserId} isGlobalAdmin={isGlobalAdmin} units={units} defaultUnit={defaultUnit} />
				) : null}
			</SheetContent>
		</Sheet>
	)
}

function PersonPanelBody({
	userId,
	currentUserId,
	isGlobalAdmin,
	units,
	defaultUnit,
}: {
	userId: string
	currentUserId: string | null
	isGlobalAdmin: boolean
	units: readonly UnitOption[]
	defaultUnit: UnitChoice | null
}) {
	const queryClient = useQueryClient()
	const detail = useQuery({ queryKey: personQueryKey(userId), queryFn: () => fetchAlphaPersonFn({ data: { userId } }) })
	const [granting, setGranting] = useState(false)

	const identity = detail.data?.identity
	const label = identity ? personLabel({ name: identity.name, email: identity.email, userId }) : ""
	const isSelf = userId === currentUserId

	return (
		<>
			<SheetHeader className="border-border border-b pr-12">
				<p className="text-label text-muted-foreground">Acessos da pessoa</p>
				<SheetTitle className="font-semibold text-xl tracking-tight">{detail.isLoading ? "Carregando…" : label || "Pessoa"}</SheetTitle>
				<SheetDescription render={<div />} className="flex flex-wrap gap-x-3 gap-y-0.5">
					{identity?.name && identity.email ? <span>{identity.email}</span> : null}
					{identity?.nrOrdem ? <span className="font-mono">Nr. {identity.nrOrdem}</span> : null}
					{isSelf ? <span className="text-label text-foreground">Você</span> : null}
				</SheetDescription>
			</SheetHeader>

			<div className="flex flex-col gap-8 px-4 pb-8">
				{detail.isLoading ? (
					<div className="flex flex-col gap-2">
						<Skeleton className="h-10 w-full" />
						<Skeleton className="h-10 w-full" />
						<Skeleton className="h-10 w-full" />
					</div>
				) : detail.isError ? (
					<div role="alert" className="flex items-start gap-3 border border-destructive/40 bg-destructive/5 p-4 text-sm">
						<WarningTriangle className="size-5 shrink-0 text-destructive" aria-hidden="true" />
						<span>Não foi possível carregar os acessos desta pessoa: {detail.error instanceof Error ? detail.error.message : "falha na consulta"}.</span>
					</div>
				) : detail.data ? (
					<>
						<LastChange audit={detail.data.audit} />
						<Grants detail={detail.data} currentUserId={currentUserId} isGlobalAdmin={isGlobalAdmin} />

						<section aria-labelledby="conceder-mais" className="flex flex-col gap-3">
							<div className="flex items-center justify-between gap-3">
								<h3 id="conceder-mais" className="font-semibold tracking-tight">
									Conceder papéis
								</h3>
								{granting ? null : (
									<Button type="button" variant="outline" size="sm" onClick={() => setGranting(true)}>
										<UserPlus aria-hidden="true" />
										Conceder
									</Button>
								)}
							</div>
							{granting ? (
								<GrantRolesForm
									fixedPerson={{ id: userId, email: identity?.email ?? "", name: identity?.name ?? null, nrOrdem: identity?.nrOrdem ?? null }}
									units={units}
									allowGlobal={isGlobalAdmin}
									initialUnit={defaultUnit}
									currentUserId={currentUserId}
									isGlobalAdmin={isGlobalAdmin}
									onClose={() => setGranting(false)}
								/>
							) : (
								<p className="text-muted-foreground text-sm">Vários papéis de uma vez, na mesma OM, com prazo opcional.</p>
							)}
						</section>

						{isGlobalAdmin ? <CopilotBlock detail={detail.data} isSelf={isSelf} onChanged={() => void invalidateAccessQueries(queryClient)} /> : null}

						<AuditTrail audit={detail.data.audit} />
					</>
				) : null}
			</div>
		</>
	)
}

function LastChange({ audit }: { audit: AuditEntry[] }) {
	const last = audit[0]
	return (
		<p className="border border-border bg-muted/40 px-3 py-2 text-sm">
			{last ? (
				<>
					<span className="text-muted-foreground">Última alteração: </span>
					{describeAudit(last)} · <span className="font-medium">{last.actorLabel}</span> ·{" "}
					<time dateTime={last.at} className="tabular-nums">
						{formatDateTime(last.at)}
					</time>
				</>
			) : (
				<span className="text-muted-foreground">Nenhuma alteração registrada no log de auditoria para o que você administra.</span>
			)}
		</p>
	)
}

function Grants({ detail, currentUserId, isGlobalAdmin }: { detail: PersonDetail; currentUserId: string | null; isGlobalAdmin: boolean }) {
	const queryClient = useQueryClient()
	const revoke = useMutation({
		mutationFn: (grant: AlphaGrant) =>
			revokeAlphaPermissionFn({ data: { userId: grant.userId, module: grant.module, unitId: grant.unitId, effect: grant.effect } }),
		onSuccess: (_result, grant) => {
			toast.success(grant.effect === "deny" ? "Bloqueio retirado" : `${ROLE_INFO[roleOfModule(grant.module)].label} revogado em ${unitLabel(grant)}`)
			void invalidateAccessQueries(queryClient)
		},
		onError: (error) => toast.error(error instanceof Error ? error.message : "Falha ao revogar"),
	})
	const revokingKey = revoke.isPending && revoke.variables ? grantRowKey(revoke.variables) : null

	const person = detail.person
	if (!person) {
		return <p className="border border-border p-4 text-muted-foreground text-sm">Esta pessoa não tem papel do Projeto α nas OMs que você administra.</p>
	}
	const { allows, denies } = splitGrantsByEffect(person.grants)
	const now = Date.now()

	return (
		<>
			<section aria-labelledby="papeis-da-pessoa" className="flex flex-col gap-3">
				<div className="flex flex-wrap items-center justify-between gap-2">
					<h3 id="papeis-da-pessoa" className="font-semibold tracking-tight">
						Papéis
					</h3>
					<PersonStatusBadges person={person} />
				</div>
				{allows.length === 0 ? (
					<p className="text-muted-foreground text-sm">Nenhum acesso concedido, só bloqueio.</p>
				) : (
					<ul className="flex flex-col divide-y divide-border border border-border">
						{allows.map((grant) => {
							const key = grantRowKey(grant)
							const isSelf = grant.userId === currentUserId
							const selfBlocked = isSelf && !canChangeOwnAccess(isGlobalAdmin, { action: "revoke", module: grant.module })
							const byPolicy = grant.source === "policy"
							const expired = isExpiredGrant(grant, now)
							return (
								<li key={key} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 px-3 py-2.5">
									<div className="flex min-w-0 flex-col gap-0.5">
										<span className="flex flex-wrap items-center gap-2 text-sm">
											<span className="text-label text-muted-foreground">{unitLabel(grant)}</span>
											<span className={cn("font-medium", expired && "text-muted-foreground line-through")}>{ROLE_INFO[roleOfModule(grant.module)].label}</span>
										</span>
										<span className="flex flex-wrap items-center gap-1.5 text-muted-foreground text-xs">
											{expired ? `Venceu em ${formatDate(grant.expiresAt)}` : grant.expiresAt ? `Vale até ${formatDate(grant.expiresAt)}` : "Sem prazo"}
											{byPolicy ? <span>· pela política “{grant.policyName}”</span> : null}
										</span>
									</div>
									<div className="flex shrink-0 items-center gap-2">
										{!expired && grant.denyImpact === "full" ? (
											<Badge variant="destructive" title="Um bloqueio vigente deste papel alcança esta OM: global, nela ou numa OM que a apoia">
												<Prohibition aria-hidden="true" />
												Anulado por bloqueio
											</Badge>
										) : null}
										{!expired && grant.denyImpact === "partial" ? (
											<Badge variant="destructive" title="Há bloqueio deste papel em algumas OMs: nelas o acesso global não vale">
												Recortado por bloqueio
											</Badge>
										) : null}
										<Button
											type="button"
											variant="ghost"
											size="sm"
											disabled={selfBlocked || byPolicy || revokingKey === key}
											onClick={() => revoke.mutate(grant)}
											aria-label={`Revogar ${ROLE_INFO[roleOfModule(grant.module)].label} em ${unitLabel(grant)}`}
											title={
												byPolicy
													? "Acesso emprestado por política: desanexe a política para retirá-lo"
													: selfBlocked
														? grant.module === "alpha-admin"
															? "Ninguém revoga a própria administração de acessos: peça a outro administrador"
															: "Só um administrador global altera o próprio acesso"
														: "Revogar o acesso. Um bloqueio do mesmo papel, se houver, continua"
											}
										>
											<Trash aria-hidden="true" />
											{revokingKey === key ? "Revogando…" : "Revogar"}
										</Button>
									</div>
								</li>
							)
						})}
					</ul>
				)}
			</section>

			{denies.length > 0 ? (
				<section aria-labelledby="bloqueios-da-pessoa" className="flex flex-col gap-3">
					<div className="flex flex-col gap-1">
						<h3 id="bloqueios-da-pessoa" className="font-semibold tracking-tight">
							Bloqueios
						</h3>
						<p className="text-muted-foreground text-xs">
							Um bloqueio anula o papel mesmo com acesso concedido.{" "}
							{isGlobalAdmin
								? "Retirar o bloqueio não remove o acesso, e revogar o acesso não retira o bloqueio."
								: "Só um administrador global retira um bloqueio."}
						</p>
					</div>
					<ul className="flex flex-col divide-y divide-destructive/20 border border-destructive/40 bg-destructive/5">
						{denies.map((grant) => {
							const key = grantRowKey(grant)
							const byPolicy = grant.source === "policy"
							const expired = isExpiredGrant(grant, now)
							return (
								<li key={key} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 px-3 py-2.5">
									<div className="flex min-w-0 flex-col gap-0.5">
										<span className="flex flex-wrap items-center gap-2 text-sm">
											<span className="text-label text-muted-foreground">{unitLabel(grant)}</span>
											<span className="inline-flex items-center gap-1 font-medium text-destructive">
												<Prohibition className="size-3.5" aria-hidden="true" />
												Bloqueio de {ROLE_INFO[roleOfModule(grant.module)].label}
											</span>
										</span>
										<span className="text-muted-foreground text-xs">
											{expired
												? "Vencido: não bloqueia mais"
												: grant.inherited
													? grant.unitId === null
														? "Herdado: vale em todas as OMs"
														: "Herdado de uma OM que apoia"
													: "Nesta OM"}
											{byPolicy ? ` · pela política “${grant.policyName}”` : ""}
										</span>
									</div>
									{isGlobalAdmin ? (
										<Button
											type="button"
											variant="ghost"
											size="sm"
											disabled={byPolicy || revokingKey === key}
											onClick={() => revoke.mutate(grant)}
											aria-label={`Retirar bloqueio de ${ROLE_INFO[roleOfModule(grant.module)].label} em ${unitLabel(grant)}`}
											title={
												byPolicy
													? "Bloqueio vindo de política: desanexe a política para retirá-lo"
													: "Retirar o bloqueio. O acesso do mesmo papel, se houver, continua"
											}
										>
											<LockSlash aria-hidden="true" />
											Retirar
										</Button>
									) : null}
								</li>
							)
						})}
					</ul>
				</section>
			) : null}
		</>
	)
}

/**
 * "Bloquear no copiloto": deny sem OM nos quatro papéis, de uma vez. Confirmação em linha — o
 * clique derruba todos os papéis da pessoa em todas as OMs.
 */
function CopilotBlock({ detail, isSelf, onChanged }: { detail: PersonDetail; isSelf: boolean; onChanged: () => void }) {
	const [confirming, setConfirming] = useState<null | boolean>(null)
	const state = detail.person?.copilotBlock ?? "none"
	const change = useMutation({
		mutationFn: (blocked: boolean) => setAlphaCopilotBlockFn({ data: { userId: detail.userId, blocked } }),
		onSuccess: (result) => {
			if (result.changed === 0) {
				toast.info(result.blocked ? "A pessoa já estava bloqueada no copiloto" : "Não havia bloqueio no copiloto a retirar", {
					description: result.blocked ? undefined : "Um bloqueio que vem de política se retira desanexando a política.",
				})
			} else {
				toast.success(result.blocked ? "Bloqueado no copiloto" : "Desbloqueado no copiloto")
			}
			setConfirming(null)
			onChanged()
		},
		onError: (error) => toast.error(error instanceof Error ? error.message : "Falha ao alterar o bloqueio"),
	})

	return (
		<section aria-labelledby="bloqueio-copiloto" className="flex flex-col gap-3">
			<div className="flex flex-col gap-1">
				<h3 id="bloqueio-copiloto" className="font-semibold tracking-tight">
					Bloqueio no copiloto
				</h3>
				<p className="text-muted-foreground text-xs">
					Desliga a pessoa do Projeto α de uma vez: vale em todas as OMs e nos quatro papéis. Os acessos concedidos ficam guardados e voltam no desbloqueio.
				</p>
			</div>
			{isSelf ? (
				<p className="text-muted-foreground text-sm">Ninguém bloqueia a si mesmo. Peça a outro administrador global.</p>
			) : confirming !== null ? (
				<div role="alertdialog" aria-labelledby="bloqueio-copiloto-confirma" className="flex flex-col gap-3 border border-foreground p-3">
					<p id="bloqueio-copiloto-confirma" className="text-sm">
						{confirming
							? "Bloquear? A pessoa perde Requisitante, Licitações, ACI e Administração de acessos em todas as OMs, e não envia mais documento."
							: "Desbloquear? Os papéis concedidos voltam a valer. Bloqueios de uma OM específica continuam."}
					</p>
					<div className="flex gap-2">
						<Button
							type="button"
							size="sm"
							variant={confirming ? "destructive" : "default"}
							disabled={change.isPending}
							onClick={() => change.mutate(confirming)}
						>
							{change.isPending ? "Gravando…" : confirming ? "Bloquear" : "Desbloquear"}
						</Button>
						<Button type="button" size="sm" variant="ghost" disabled={change.isPending} onClick={() => setConfirming(null)}>
							Cancelar
						</Button>
					</div>
				</div>
			) : (
				<div className="flex flex-wrap items-center gap-2">
					{state === "blocked" ? (
						<Badge variant="destructive">
							<Prohibition aria-hidden="true" />
							Bloqueado no copiloto
						</Badge>
					) : null}
					{state === "partial" ? <Badge variant="outline">Bloqueio parcial</Badge> : null}
					{state !== "blocked" ? (
						<Button type="button" size="sm" variant="destructive" onClick={() => setConfirming(true)}>
							<Lock aria-hidden="true" />
							{state === "partial" ? "Completar bloqueio" : "Bloquear no copiloto"}
						</Button>
					) : null}
					{state !== "none" ? (
						<Button type="button" size="sm" variant="ghost" onClick={() => setConfirming(false)}>
							<LockSlash aria-hidden="true" />
							Desbloquear
						</Button>
					) : null}
				</div>
			)}
		</section>
	)
}

function AuditTrail({ audit }: { audit: AuditEntry[] }) {
	if (audit.length === 0) return null
	return (
		<section aria-labelledby="historico-da-pessoa" className="flex flex-col gap-3">
			<h3 id="historico-da-pessoa" className="font-semibold tracking-tight">
				Histórico recente
			</h3>
			<ol className="flex flex-col divide-y divide-border border border-border">
				{audit.map((entry) => (
					<li key={entry.id} className="flex flex-col gap-0.5 px-3 py-2 text-sm">
						<span>{describeAudit(entry)}</span>
						<span className="text-muted-foreground text-xs">
							{entry.actorLabel} ·{" "}
							<time dateTime={entry.at} className="tabular-nums">
								{formatDateTime(entry.at)}
							</time>
						</span>
					</li>
				))}
			</ol>
			<p className="text-muted-foreground text-xs">Registro de auditoria, só leitura. Mostra as últimas alterações nas OMs que você administra.</p>
		</section>
	)
}
