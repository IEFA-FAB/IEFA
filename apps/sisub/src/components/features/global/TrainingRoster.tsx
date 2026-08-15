"use no memo"

import { GraduationCap, Search, UserMinus, UserPlus } from "lucide-react"
import * as React from "react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useGlobalWrite } from "@/hooks/auth/useGlobalWrite"
import { useAttachPolicy, useDetachPolicy, usePolicyMembers, useTrainingPolicy } from "@/hooks/data/usePolicies"
import { useUserSearch } from "@/hooks/data/useUserSearch"

/**
 * Turma do ambiente de treino.
 *
 * Colocar alguém em treino é anexar a política gerenciada "Conjunto Treino" — a mesma
 * operação do console de acesso. O que muda é ONDE: aqui, junto do escopo, dos dados
 * pendentes e do reset, em vez de perdida num dropdown com todas as políticas do sistema.
 *
 * Ver QUEM está em treino não era possível antes: só existia a direção usuário → políticas.
 */
export function TrainingRoster() {
	"use no memo"

	const canWrite = useGlobalWrite()
	const { data: policy, isLoading: policyLoading, error: policyError } = useTrainingPolicy()
	// A listagem exige `global:2` — o painel em si é visível em `global:1` (inclusive para o
	// próprio treinando, que ganha esse nível pela política). Sem o gate a query dispararia e
	// falharia, e a tabela mostraria "ninguém em treino" no lugar do erro.
	const { data: members = [], isLoading: membersLoading, error: membersError } = usePolicyMembers(policy?.id ?? null, { enabled: canWrite })
	const attach = useAttachPolicy()
	const detach = useDetachPolicy()

	const [addOpen, setAddOpen] = React.useState(false)
	const [removeTarget, setRemoveTarget] = React.useState<(typeof members)[number] | null>(null)

	if (policyError) {
		return (
			<Alert variant="destructive">
				<GraduationCap className="size-4" />
				<AlertTitle>Política de treino não encontrada</AlertTitle>
				<AlertDescription>{(policyError as Error).message}</AlertDescription>
			</Alert>
		)
	}

	return (
		<Card>
			<CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
				<div>
					<CardTitle>Treinandos</CardTitle>
					<p className="text-sm text-muted-foreground mt-0.5">
						Quem tem acesso ao ambiente de treino. Escreve em tudo que é treino e apenas lê a administração global.
					</p>
				</div>
				{canWrite && (
					<Button size="sm" onClick={() => setAddOpen(true)} disabled={!policy} className="gap-1.5 shrink-0">
						<UserPlus className="size-4" />
						Adicionar treinando
					</Button>
				)}
			</CardHeader>

			<CardContent>
				<Table>
					<TableHeader className="border-b border-foreground">
						<TableRow>
							<TableHead className="text-foreground text-subheading">Usuário</TableHead>
							<TableHead className="text-foreground text-subheading">Nr. Ordem</TableHead>
							<TableHead className="text-foreground text-subheading">Desde</TableHead>
							<TableHead className="w-[120px]" />
						</TableRow>
					</TableHeader>
					<TableBody>
						{!canWrite ? (
							<TableRow>
								<TableCell colSpan={4} className="h-20 text-center text-sm text-muted-foreground">
									A turma do treino é visível para quem administra o acesso da SDAB (nível de escrita).
								</TableCell>
							</TableRow>
						) : membersError ? (
							// Erro precisa aparecer como erro: cair no estado vazio afirmaria que não há
							// ninguém em treino quando na verdade a lista não pôde ser lida.
							<TableRow>
								<TableCell colSpan={4} className="h-20 text-center text-sm text-destructive">
									Não foi possível carregar a turma: {(membersError as Error).message}
								</TableCell>
							</TableRow>
						) : policyLoading || membersLoading ? (
							<TableRow>
								<TableCell colSpan={4}>
									<Skeleton className="h-5 w-full" />
								</TableCell>
							</TableRow>
						) : members.length === 0 ? (
							<TableRow>
								<TableCell colSpan={4} className="h-20 text-center text-sm text-muted-foreground">
									Ninguém em treino no momento.
								</TableCell>
							</TableRow>
						) : (
							members.map((member) => (
								<TableRow key={member.user_id} className="hover:bg-accent/40">
									<TableCell className="text-sm">{member.email ?? member.user_id}</TableCell>
									<TableCell className="text-sm font-mono">{member.nrOrdem ?? "—"}</TableCell>
									<TableCell className="text-sm">{new Date(member.attached_at).toLocaleDateString("pt-BR")}</TableCell>
									<TableCell>
										{canWrite && (
											<div className="flex justify-end">
												<Button variant="ghost" size="sm" onClick={() => setRemoveTarget(member)} className="gap-1.5">
													<UserMinus className="size-4" />
													Remover
												</Button>
											</div>
										)}
									</TableCell>
								</TableRow>
							))
						)}
					</TableBody>
				</Table>
			</CardContent>

			<AddTraineeDialog
				open={addOpen}
				policyId={policy?.id ?? null}
				existingIds={new Set(members.map((m) => m.user_id))}
				isPending={attach.isPending}
				onAdd={(userId) => policy && attach.mutate({ userId, policyId: policy.id }, { onSuccess: () => setAddOpen(false) })}
				onClose={() => setAddOpen(false)}
			/>

			<Dialog open={!!removeTarget} onOpenChange={(v) => !v && setRemoveTarget(null)}>
				<DialogContent className="sm:max-w-[440px]">
					<DialogHeader>
						<DialogTitle>Remover do treino</DialogTitle>
					</DialogHeader>
					<p className="text-sm text-muted-foreground py-2">
						Remover <span className="text-subheading text-foreground">{removeTarget?.email ?? removeTarget?.user_id}</span> do ambiente de treino? O acesso ao
						escopo de treino e a leitura da SDAB deixam de valer. Os dados que a pessoa criou no treino permanecem até o próximo reset.
					</p>
					<DialogFooter>
						<Button variant="outline" onClick={() => setRemoveTarget(null)} disabled={detach.isPending}>
							Cancelar
						</Button>
						<Button
							variant="destructive"
							onClick={() =>
								removeTarget && policy && detach.mutate({ userId: removeTarget.user_id, policyId: policy.id }, { onSuccess: () => setRemoveTarget(null) })
							}
							disabled={detach.isPending}
						>
							{detach.isPending ? "Removendo..." : "Remover"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</Card>
	)
}

/** Busca por email e anexa a política de treino em um passo. */
function AddTraineeDialog({
	open,
	policyId,
	existingIds,
	isPending,
	onAdd,
	onClose,
}: {
	open: boolean
	policyId: string | null
	existingIds: Set<string>
	isPending: boolean
	onAdd: (userId: string) => void
	onClose: () => void
}) {
	const [email, setEmail] = React.useState("")
	const { results, isSearching, canSearch } = useUserSearch(email)

	React.useEffect(() => {
		if (!open) setEmail("")
	}, [open])

	return (
		<Dialog open={open} onOpenChange={(v) => !v && onClose()}>
			<DialogContent className="sm:max-w-[480px]">
				<DialogHeader>
					<DialogTitle>Adicionar treinando</DialogTitle>
				</DialogHeader>

				<div className="space-y-3 py-2">
					<div className="relative">
						<Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
						<Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@fab.mil.br" className="pl-9" autoComplete="off" />
					</div>

					{!canSearch && email.length > 0 && <p className="text-xs text-muted-foreground">Digite ao menos 3 caracteres para buscar.</p>}

					{canSearch &&
						(isSearching ? (
							<Skeleton className="h-12 w-full rounded-lg" />
						) : results.length === 0 ? (
							<p className="text-sm text-muted-foreground py-2">Nenhum usuário encontrado.</p>
						) : (
							<div className="space-y-1">
								{results.map((user) => {
									const alreadyIn = existingIds.has(user.id)
									return (
										<button
											key={user.id}
											type="button"
											disabled={alreadyIn || isPending || !policyId}
											onClick={() => onAdd(user.id)}
											className="w-full flex items-center justify-between rounded-lg border px-4 py-3 text-left text-sm transition-colors enabled:hover:bg-accent disabled:opacity-60"
										>
											<div>
												<p className="text-subheading">{user.email}</p>
												{user.nrOrdem && <p className="text-xs text-muted-foreground mt-0.5">Nr. Ordem: {user.nrOrdem}</p>}
											</div>
											<span className="text-xs text-muted-foreground">{alreadyIn ? "Já está em treino" : "Adicionar →"}</span>
										</button>
									)
								})}
							</div>
						))}
				</div>

				<DialogFooter>
					<Button variant="outline" onClick={onClose} disabled={isPending}>
						Fechar
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
