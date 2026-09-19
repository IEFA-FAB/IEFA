import { Clock, Prohibition } from "iconoir-react"
import { Badge } from "@/components/ui/badge"
import { isExpiredGrant, ROLE_INFO, ROLE_SHORT_LABEL, roleOfModule } from "@/lib/alpha/admin-access"
import { formatDate } from "@/lib/alpha/format"
import { type AlphaGrant, type AlphaPerson, civilDaysUntil, EXPIRING_SOON_DAYS, groupAllowsByUnit } from "@/lib/alpha/people"
import { cn } from "@/lib/utils"

const SOON_MS = EXPIRING_SOON_DAYS * 86_400_000

/** O que a ficha de um acesso diz além do papel — em texto, para leitor de tela e para o `title`. */
function chipState(grant: AlphaGrant, now: number): { expired: boolean; soon: boolean; notes: string[] } {
	const expired = isExpiredGrant(grant, now)
	const soon = !expired && grant.expiresAt !== null && new Date(grant.expiresAt).getTime() <= now + SOON_MS
	const notes: string[] = []
	if (expired) notes.push(`vencido em ${formatDate(grant.expiresAt)}`)
	else if (grant.expiresAt !== null) notes.push(`vale até ${formatDate(grant.expiresAt)}`)
	if (!expired && grant.denyImpact === "full") notes.push("anulado por bloqueio")
	if (!expired && grant.denyImpact === "partial") notes.push("recortado por bloqueio em parte das OMs")
	if (grant.source === "policy") notes.push(`pela política “${grant.policyName ?? ""}”`)
	return { expired, soon, notes }
}

/**
 * A ficha de UM acesso: o papel, e o que o afeta. Nenhum estado só pela cor: anulado leva o
 * ícone de proibição e o texto riscado; vencido, a borda tracejada e o texto riscado; vence em
 * breve, o relógio. O detalhe vai no `title` e num texto só para leitor de tela.
 */
export function RoleChip({ grant, now = Date.now() }: { grant: AlphaGrant; now?: number }) {
	const role = roleOfModule(grant.module)
	const { expired, soon, notes } = chipState(grant, now)
	const annulled = !expired && grant.denyImpact !== "none"
	const title = [ROLE_INFO[role].label, ...notes].join(" · ")
	return (
		<span
			title={title}
			className={cn(
				"inline-flex h-6 items-center gap-1 whitespace-nowrap border px-1.5 font-medium text-xs",
				role === "admin" && !annulled && !expired ? "border-foreground bg-foreground text-background" : "border-border bg-background text-foreground",
				annulled && "border-destructive/50 bg-destructive/5 text-destructive",
				expired && "border-dashed text-muted-foreground"
			)}
		>
			{annulled && <Prohibition className="size-3" aria-hidden="true" />}
			{soon && !annulled && <Clock className="size-3" aria-hidden="true" />}
			<span className={cn((expired || grant.denyImpact === "full") && "line-through")}>{ROLE_SHORT_LABEL[role]}</span>
			{grant.source === "policy" && <span className="font-normal text-[0.625rem] text-muted-foreground uppercase tracking-wide">pol.</span>}
			{notes.length > 0 && <span className="sr-only">({notes.join(", ")})</span>}
		</span>
	)
}

/** Os acessos de uma pessoa, agrupados por OM: a sigla abre o grupo, as fichas vêm em seguida. */
export function UnitRoleGroups({ grants, now = Date.now(), className }: { grants: readonly AlphaGrant[]; now?: number; className?: string }) {
	const groups = groupAllowsByUnit(grants)
	if (groups.length === 0) return <span className="text-muted-foreground text-xs">Nenhum acesso, só bloqueio</span>
	return (
		<ul className={cn("flex flex-wrap items-center gap-x-4 gap-y-1.5", className)}>
			{groups.map((group) => (
				<li key={group.unitId ?? "global"} className="flex flex-wrap items-center gap-1">
					{/* `text-label` fora do `cn`: o tailwind-merge o lê como cor de texto e o descarta diante de `text-foreground`. */}
					<span className={`text-label mr-0.5 ${group.unitId === null ? "text-foreground" : "text-muted-foreground"}`}>
						{group.unitId === null ? "Global" : (group.unitCode ?? `OM ${group.unitId}`)}
					</span>
					{group.grants.map((grant) => (
						<RoleChip key={`${grant.source}:${grant.module}:${grant.policyName ?? ""}`} grant={grant} now={now} />
					))}
				</li>
			))}
		</ul>
	)
}

/** A situação da pessoa em selos. "Ativo" só quando nada pede atenção. */
export function PersonStatusBadges({ person, now = Date.now() }: { person: Pick<AlphaPerson, "status" | "copilotBlock">; now?: number }) {
	const { status, copilotBlock } = person
	const badges: React.ReactNode[] = []
	if (copilotBlock === "blocked") {
		badges.push(
			<Badge key="copilot" variant="destructive" title="Bloqueio sem OM nos quatro papéis: nenhum acesso do Projeto α vale">
				<Prohibition aria-hidden="true" />
				Bloqueado no copiloto
			</Badge>
		)
	} else {
		if (copilotBlock === "partial") {
			badges.push(
				<Badge key="partial" variant="outline" title="Bloqueio sem OM em parte dos papéis">
					<Prohibition aria-hidden="true" />
					Bloqueio parcial
				</Badge>
			)
		} else if (status.blocked) {
			badges.push(
				<Badge key="blocked" variant="outline" title="Há bloqueio de algum papel numa OM, ou herdado de uma OM que apoia">
					<Prohibition aria-hidden="true" />
					Bloqueio
				</Badge>
			)
		}
		if (status.annulled) {
			badges.push(
				<Badge key="annulled" variant="destructive" title="Algum acesso não vale por causa de um bloqueio">
					Anulado por bloqueio
				</Badge>
			)
		}
	}
	if (status.expiringSoon && status.nextExpiry) {
		const days = Math.max(0, civilDaysUntil(status.nextExpiry, now))
		badges.push(
			<Badge key="soon" variant="outline" title={`O acesso mais próximo de vencer vale até ${formatDate(status.nextExpiry)}`}>
				<Clock aria-hidden="true" />
				{days === 0 ? "Vence hoje" : `Vence em ${days} ${days === 1 ? "dia" : "dias"}`}
			</Badge>
		)
	}
	if (status.expired) {
		badges.push(
			<Badge key="expired" variant="outline" className="border-dashed text-muted-foreground" title="Há acesso vencido: a linha segue lá até alguém revogar">
				Acesso vencido
			</Badge>
		)
	}
	if (badges.length === 0) return <span className="text-muted-foreground text-xs">{status.active ? "Ativo" : "Sem acesso vigente"}</span>
	return <div className="flex flex-wrap gap-1">{badges}</div>
}
