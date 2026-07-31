"use no memo"

import { Link2, Link2Off, Lock, ShieldOff } from "lucide-react"
import * as React from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useAttachPolicy, useDetachPolicy, useEffectivePermissions, usePolicies, useUserPolicies } from "@/hooks/data/usePolicies"
import { LEVEL_CONFIG, MODULE_LABELS, type ScopeMaps, type SisubModule, scopeLabel } from "./labels"

/**
 * Políticas anexadas a um usuário + as permissões efetivas resultantes.
 *
 * A seção de efetivas é a resposta canônica para "o que essa pessoa pode fazer": mostra a
 * união das duas origens (política e grant inline) com a origem de cada linha, e sinaliza
 * o que foi anulado por um deny. Sem isso, um administrador anexa uma política, não vê
 * efeito e não tem como descobrir que um deny inline a está cancelando.
 */
export function UserAccessPanel({ userId, maps }: { userId: string; maps: ScopeMaps }) {
	"use no memo"

	const { data: attached = [], isLoading: attachedLoading } = useUserPolicies(userId)
	const { data: allPolicies = [] } = usePolicies()
	const { data: effective = [], isLoading: effectiveLoading } = useEffectivePermissions(userId)
	const attach = useAttachPolicy()
	const detach = useDetachPolicy()

	const [attachOpen, setAttachOpen] = React.useState(false)
	const [selectedPolicyId, setSelectedPolicyId] = React.useState("")
	const [detachTarget, setDetachTarget] = React.useState<(typeof attached)[number] | null>(null)

	// Política já anexada não é reofertada — anexar de novo é no-op e só confunde.
	const attachedIds = new Set(attached.map((p) => p.id))
	const available = allPolicies.filter((p) => !attachedIds.has(p.id))
	const selectedPolicy = available.find((p) => p.id === selectedPolicyId)

	return (
		<div className="space-y-6">
			{/* ── Políticas anexadas ── */}
			<div className="rounded-lg border bg-card p-6 space-y-4">
				<div className="flex items-start justify-between gap-4">
					<div>
						<h3 className="text-heading">Políticas anexadas</h3>
						<p className="text-sm text-muted-foreground mt-0.5">Conjuntos nomeados de permissões. Desanexar revoga todas as dela de uma vez.</p>
					</div>
					<Button size="sm" onClick={() => setAttachOpen(true)} disabled={available.length === 0} className="gap-1.5 shrink-0">
						<Link2 className="size-4" />
						Anexar política
					</Button>
				</div>

				{attachedLoading ? (
					<Skeleton className="h-12 w-full rounded-lg" />
				) : attached.length === 0 ? (
					<p className="text-sm text-muted-foreground py-2">Nenhuma política anexada. As permissões abaixo vêm apenas dos grants diretos.</p>
				) : (
					<div className="space-y-1">
						{attached.map((policy) => (
							<div key={policy.id} className="flex items-center justify-between rounded-lg border px-4 py-3">
								<div>
									<p className="text-subheading flex items-center gap-2">
										{policy.name}
										{policy.managed && (
											<Badge variant="secondary" className="gap-1">
												<Lock className="size-3" />
												Gerenciada
											</Badge>
										)}
									</p>
									{policy.description && <p className="text-xs text-muted-foreground mt-0.5">{policy.description}</p>}
								</div>
								<Button variant="ghost" size="sm" onClick={() => setDetachTarget(policy)} className="gap-1.5">
									<Link2Off className="size-4" />
									Desanexar
								</Button>
							</div>
						))}
					</div>
				)}
			</div>

			{/* ── Permissões efetivas ── */}
			<div className="rounded-lg border bg-card p-6 space-y-4">
				<div>
					<h3 className="text-heading">Permissões efetivas</h3>
					<p className="text-sm text-muted-foreground mt-0.5">
						O que este usuário pode fazer, somando políticas e grants diretos. Um deny anula o allow que ele cobre.
					</p>
				</div>

				<Table>
					<TableHeader className="border-b border-foreground">
						<TableRow>
							<TableHead className="text-foreground text-subheading">Módulo</TableHead>
							<TableHead className="text-foreground text-subheading">Nível</TableHead>
							<TableHead className="text-foreground text-subheading">Escopo</TableHead>
							<TableHead className="text-foreground text-subheading">Origem</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{effectiveLoading ? (
							<TableRow>
								<TableCell colSpan={4}>
									<Skeleton className="h-5 w-full" />
								</TableCell>
							</TableRow>
						) : effective.length === 0 ? (
							<TableRow>
								<TableCell colSpan={4} className="h-20 text-center text-sm text-muted-foreground">
									Nenhuma permissão efetiva.
								</TableCell>
							</TableRow>
						) : (
							effective.map((perm) => (
								<TableRow key={`${perm.module}-${perm.unit_id}-${perm.kitchen_id}-${perm.mess_hall_id}`} className={perm.denied ? "opacity-60" : undefined}>
									<TableCell>
										<span className="inline-flex items-center rounded-md border px-2 py-0.5 text-caption">
											{MODULE_LABELS[perm.module as SisubModule] ?? perm.module}
										</span>
									</TableCell>
									<TableCell>
										{perm.denied ? (
											<Badge variant="destructive" className="gap-1">
												<ShieldOff className="size-3" />
												Anulada
											</Badge>
										) : (
											<Badge variant={LEVEL_CONFIG[perm.level]?.variant ?? "secondary"}>{LEVEL_CONFIG[perm.level]?.label ?? perm.level}</Badge>
										)}
									</TableCell>
									<TableCell className="text-sm">{scopeLabel(perm, maps)}</TableCell>
									<TableCell className="text-sm">
										<div className="flex flex-wrap gap-1">
											{/* Vários grants diretos colapsam numa permissão efetiva: a chave precisa do
											    índice, senão todos recebem "inline" e o React reconcilia errado. */}
											{perm.origins.map((origin, index) => (
												<Badge key={origin.kind === "policy" ? origin.policyId : `${origin.kind}-${index}`} variant="outline" className="text-xs">
													{origin.kind === "policy" ? origin.policyName : origin.kind === "implicit" ? "Implícito" : "Direto"}
												</Badge>
											))}
										</div>
										{perm.denied && (
											<p className="text-xs text-destructive mt-1">
												Negada por {perm.deniedBy.map((o) => (o.kind === "policy" ? o.policyName : "grant direto")).join(", ")}
											</p>
										)}
									</TableCell>
								</TableRow>
							))
						)}
					</TableBody>
				</Table>
			</div>

			{/* ── Anexar ── */}
			<Dialog
				open={attachOpen}
				onOpenChange={(v) => {
					if (!v) {
						setAttachOpen(false)
						setSelectedPolicyId("")
					}
				}}
			>
				<DialogContent className="sm:max-w-[440px]">
					<DialogHeader>
						<DialogTitle>Anexar política</DialogTitle>
					</DialogHeader>
					<div className="py-2">
						<Select value={selectedPolicyId} onValueChange={(v) => setSelectedPolicyId(v ?? "")}>
							<SelectTrigger className="w-full">
								<SelectValue placeholder="Selecione a política...">{selectedPolicy?.name}</SelectValue>
							</SelectTrigger>
							<SelectContent className="w-auto min-w-(--anchor-width) p-2">
								{available.map((p) => (
									<SelectItem key={p.id} value={p.id}>
										{p.name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						{selectedPolicy?.description && <p className="text-xs text-muted-foreground mt-2">{selectedPolicy.description}</p>}
					</div>
					<DialogFooter className="flex justify-between">
						<Button variant="outline" onClick={() => setAttachOpen(false)} disabled={attach.isPending}>
							Cancelar
						</Button>
						<Button
							onClick={() =>
								attach.mutate(
									{ userId, policyId: selectedPolicyId },
									{
										onSuccess: () => {
											setAttachOpen(false)
											setSelectedPolicyId("")
										},
									}
								)
							}
							disabled={attach.isPending || !selectedPolicyId}
						>
							{attach.isPending ? "Anexando..." : "Anexar"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* ── Desanexar ── */}
			<Dialog open={!!detachTarget} onOpenChange={(v) => !v && setDetachTarget(null)}>
				<DialogContent className="sm:max-w-[440px]">
					<DialogHeader>
						<DialogTitle>Desanexar política</DialogTitle>
					</DialogHeader>
					<p className="text-sm text-muted-foreground py-2">
						Remover <span className="text-subheading text-foreground">{detachTarget?.name}</span> deste usuário? As permissões que vinham apenas dela deixam de
						valer; o que também vem de outra origem permanece.
					</p>
					<DialogFooter>
						<Button variant="outline" onClick={() => setDetachTarget(null)} disabled={detach.isPending}>
							Cancelar
						</Button>
						<Button
							variant="destructive"
							onClick={() => detachTarget && detach.mutate({ userId, policyId: detachTarget.id }, { onSuccess: () => setDetachTarget(null) })}
							disabled={detach.isPending}
						>
							{detach.isPending ? "Removendo..." : "Desanexar"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	)
}
