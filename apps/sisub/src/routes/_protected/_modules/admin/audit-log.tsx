import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { ListFilter, ScrollText, TriangleAlert } from "lucide-react"
import * as React from "react"
import { requirePermission } from "@/auth/pbac"
import { AuditEntryChange } from "@/components/features/admin/audit-log/AuditEntryChange"
import { type AuditUserFilter, isFilterableUserId, UserFilterField } from "@/components/features/admin/audit-log/UserFilterField"
import { PageHeader } from "@/components/layout/PageHeader"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { AUDIT_SOURCE_LABELS, describeAuditEntry, sourceOf, staticTitle } from "@/lib/audit-log/describe-entry"
import { describeRequirement } from "@/lib/audit-log/requirement-label"
import { queryKeys } from "@/lib/query-keys"
import { assuranceFor } from "@/server/assurance-registry"
import { listSensitiveOperationNamesFn, listSensitiveOperationsFn, type SensitiveOperationRow } from "@/server/audit.fn"

/**
 * Rota: /admin/audit-log
 * ACL: módulo "admin" nível 3 — aqui E na server fn de leitura. O `beforeLoad` sozinho não
 * protege nada: `/_serverFn/<id>` é chamável direto por HTTP, sem passar pelo router.
 */
export const Route = createFileRoute("/_protected/_modules/admin/audit-log")({
	beforeLoad: (opts) => requirePermission(opts, "admin", 3),
	component: AuditLogPage,
	head: () => ({
		meta: [{ title: "Operações Sensíveis — SISUB" }, { name: "description", content: "Registro das operações sensíveis executadas no sistema" }],
	}),
})

const PAGE_SIZES = ["25", "50", "100", "200"] as const

/**
 * "Todas as operações" no Select. Nome de operação gravado nunca começa por `_` (o
 * `audit_context` do banco exige `^[A-Za-z0-9]`), então o sentinela não colide.
 */
const ALL_OPERATIONS = "__all__"

function formatStamp(value: string) {
	return new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "medium" })
}

/** Identificação do ator: e-mail quando há cadastro, o id cru quando ainda não há. */
function actorLabel(row: SensitiveOperationRow) {
	return row.actor_email ?? row.actor_id
}

/**
 * Frase que descreve a operação, lida do registro de classificação — a MESMA que o usuário
 * vê no modal de elevação. É o fallback para operação que não é mudança de acesso (empenho,
 * orçamento, MFA): sem ela a tabela mostraria só `createEmpenhoFn`, que é legível para quem
 * escreveu o código e para mais ninguém.
 */
function operationReason(operation: string): string | null {
	const entry = assuranceFor(operation)
	return entry && entry.require !== "none" ? entry.reason : null
}

/** Rótulo de uma operação sem olhar o alvo — as opções do filtro. */
function operationOptionLabel(operation: string): string {
	return staticTitle(operation) ?? operationReason(operation) ?? operation
}

function AuditLogPage() {
	const [actor, setActor] = React.useState<AuditUserFilter | null>(null)
	const [targetUser, setTargetUser] = React.useState<AuditUserFilter | null>(null)
	const [operation, setOperation] = React.useState<string | null>(null)
	const [pageSize, setPageSize] = React.useState(50)
	const [offset, setOffset] = React.useState(0)

	const filters = { actorId: actor?.id ?? null, targetUserId: targetUser?.id ?? null, operation }
	const hasFilter = Boolean(actor || targetUser || operation)

	const {
		data,
		isLoading,
		error: listError,
	} = useQuery({
		queryKey: queryKeys.audit.sensitiveOperations(filters, pageSize, offset),
		queryFn: () =>
			listSensitiveOperationsFn({
				data: { actorId: actor?.id, targetUserId: targetUser?.id, operation: operation ?? undefined, limit: pageSize, offset },
			}),
	})

	const { data: operationNames = [], error: namesError } = useQuery({
		queryKey: queryKeys.audit.sensitiveOperationNames(),
		queryFn: () => listSensitiveOperationNamesFn(),
		staleTime: 5 * 60_000,
	})

	const rows = data?.rows ?? []
	const total = data?.total ?? 0
	const firstShown = total === 0 ? 0 : offset + 1
	const lastShown = offset + rows.length

	// Todo filtro novo volta à primeira página: manter o deslocamento levaria a uma tela vazia
	// que parece "esta pessoa não fez nada".
	function changeActor(next: AuditUserFilter | null) {
		setActor(next)
		setOffset(0)
	}
	function changeTarget(next: AuditUserFilter | null) {
		setTargetUser(next)
		setOffset(0)
	}
	function changeOperation(next: string | null) {
		setOperation(next)
		setOffset(0)
	}

	return (
		<div className="space-y-6">
			<PageHeader
				title="Operações Sensíveis"
				description="Registro das operações classificadas como sensíveis — concessão, alteração e revogação de acesso em todos os apps, políticas, chaves de API, execução orçamentária e reset do ambiente de treino. Cada linha é gravada junto da execução; operação rejeitada não aparece aqui."
			/>

			<Card>
				<CardHeader>
					<CardTitle>Filtros</CardTitle>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="grid gap-4 md:grid-cols-2">
						<UserFilterField id="audit-actor-search" label="Quem executou" activePrefix="Operações executadas por" value={actor} onChange={changeActor} />
						<UserFilterField
							id="audit-target-search"
							label="Alvo — pessoa cujo acesso mudou"
							activePrefix="Operações sobre o acesso de"
							value={targetUser}
							onChange={changeTarget}
						/>
					</div>

					<div className="flex flex-wrap items-end gap-4">
						<div className="space-y-2">
							<Label htmlFor="audit-operation" className="text-caption">
								Operação
							</Label>
							<Select value={operation ?? ALL_OPERATIONS} onValueChange={(value) => changeOperation(!value || value === ALL_OPERATIONS ? null : value)}>
								<SelectTrigger id="audit-operation" size="sm" className="w-80 max-w-full">
									<SelectValue>{operation ? operationOptionLabel(operation) : "Todas as operações"}</SelectValue>
								</SelectTrigger>
								<SelectContent>
									<SelectItem value={ALL_OPERATIONS}>Todas as operações</SelectItem>
									{operationNames.map((name) => (
										<SelectItem key={name} value={name}>
											<span className="flex min-w-0 flex-col">
												<span className="truncate">
													{AUDIT_SOURCE_LABELS[sourceOf(name)]} · {operationOptionLabel(name)}
												</span>
												<span className="truncate font-mono text-caption text-muted-foreground">{name}</span>
											</span>
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							{/* Sem a lista, o filtro não oferece opções — dizer por quê, e não fingir que
							    o registro não tem operações. */}
							{namesError ? <p className="text-caption text-destructive">Não foi possível carregar a lista de operações.</p> : null}
						</div>

						<div className="space-y-2">
							<Label htmlFor="audit-page-size" className="text-caption">
								Linhas por página
							</Label>
							<Select
								value={String(pageSize)}
								onValueChange={(value) => {
									setPageSize(Number(value ?? 50))
									setOffset(0)
								}}
							>
								<SelectTrigger id="audit-page-size" size="sm" className="w-24">
									<SelectValue>{pageSize}</SelectValue>
								</SelectTrigger>
								<SelectContent>
									{PAGE_SIZES.map((size) => (
										<SelectItem key={size} value={size}>
											{size}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					</div>
				</CardContent>
			</Card>

			{listError ? (
				// Falha de leitura NÃO pode cair no estado vazio: a tela afirmaria que nada
				// aconteceu quando na verdade não conseguiu ler.
				<Alert variant="destructive">
					<TriangleAlert className="size-4" />
					<AlertTitle>Não foi possível carregar o registro</AlertTitle>
					<AlertDescription>{(listError as Error).message}</AlertDescription>
				</Alert>
			) : null}

			<Card>
				<CardHeader>
					<CardTitle>Registro</CardTitle>
				</CardHeader>
				<CardContent className="space-y-4">
					<Table>
						<TableHeader className="border-b border-foreground">
							<TableRow>
								<TableHead className="text-foreground text-subheading">Quando</TableHead>
								<TableHead className="text-foreground text-subheading">Quem → alvo</TableHead>
								<TableHead className="text-foreground text-subheading">Operação</TableHead>
								<TableHead className="text-foreground text-subheading">O que mudou</TableHead>
								<TableHead className="text-foreground text-subheading">Exigência</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{isLoading ? (
								<TableRow>
									<TableCell colSpan={5}>
										<Skeleton className="h-5 w-full" />
									</TableCell>
								</TableRow>
							) : listError ? (
								<TableRow>
									<TableCell colSpan={5} className="h-20 text-center text-body text-destructive">
										Leitura indisponível.
									</TableCell>
								</TableRow>
							) : rows.length === 0 ? (
								<TableRow>
									<TableCell colSpan={5}>
										<Empty>
											<EmptyHeader>
												<EmptyMedia variant="icon">
													<ScrollText className="size-5" />
												</EmptyMedia>
												<EmptyTitle>Nenhuma operação registrada</EmptyTitle>
												<EmptyDescription>
													{hasFilter
														? "Nenhuma operação sensível corresponde aos filtros no período registrado."
														: "Nenhuma operação sensível foi executada desde que o registro entrou em vigor."}
												</EmptyDescription>
											</EmptyHeader>
										</Empty>
									</TableCell>
								</TableRow>
							) : (
								rows.map((row) => (
									<AuditRow
										key={row.id}
										row={row}
										onFilterActor={actor?.id === row.actor_id ? undefined : changeActor}
										onFilterTarget={changeTarget}
										activeTargetId={targetUser?.id ?? null}
									/>
								))
							)}
						</TableBody>
					</Table>

					<div className="flex flex-wrap items-center justify-between gap-2">
						{/* O total vem do servidor, com os mesmos filtros: sem ele, quem lê 50 linhas
						    conclui que o sistema teve 50 operações sensíveis. */}
						<p className="text-caption text-muted-foreground">{total === 0 ? "Nenhuma linha" : `Mostrando ${firstShown}–${lastShown} de ${total}`}</p>
						<div className="flex items-center gap-2">
							<Button variant="outline" size="sm" disabled={offset === 0 || isLoading} onClick={() => setOffset(Math.max(offset - pageSize, 0))}>
								Anterior
							</Button>
							<Button variant="outline" size="sm" disabled={lastShown >= total || isLoading} onClick={() => setOffset(offset + pageSize)}>
								Próxima
							</Button>
						</div>
					</div>
				</CardContent>
			</Card>
		</div>
	)
}

type AuditRowProps = {
	row: SensitiveOperationRow
	/** Ausente quando o filtro de ator já é esta pessoa. */
	onFilterActor?: (next: AuditUserFilter) => void
	onFilterTarget: (next: AuditUserFilter) => void
	activeTargetId: string | null
}

function AuditRow({ row, onFilterActor, onFilterTarget, activeTargetId }: AuditRowProps) {
	const description = describeAuditEntry(row.operation, row.target)
	const title = description.title ?? operationReason(row.operation)
	const requirement = describeRequirement(row.operation, row.assurance)
	const targetId = description.targetUserId
	const selfTarget = targetId !== null && targetId === row.actor_id
	const targetLabel = row.target_email ?? targetId

	return (
		<TableRow className="align-top">
			<TableCell className="text-body whitespace-nowrap">{formatStamp(row.created_at)}</TableCell>

			<TableCell className="text-body">
				<div className="flex items-start gap-1">
					<div className="min-w-0">
						<span className="block break-all">{actorLabel(row)}</span>
						{row.actor_nr_ordem && <span className="block text-caption text-muted-foreground">Nº de ordem {row.actor_nr_ordem}</span>}
					</div>
					{onFilterActor && (
						<Button
							variant="ghost"
							size="icon-xs"
							aria-label="Filtrar pelas operações executadas por esta pessoa"
							title="Filtrar pelas operações executadas por esta pessoa"
							onClick={() => onFilterActor({ id: row.actor_id, label: actorLabel(row) })}
						>
							<ListFilter />
						</Button>
					)}
				</div>
				{targetId && (
					<div className="mt-1 flex items-start gap-1">
						<span className="min-w-0 break-all text-caption text-muted-foreground">→ {selfTarget ? "a própria conta" : targetLabel}</span>
						{!selfTarget && targetId !== activeTargetId && isFilterableUserId(targetId) && (
							<Button
								variant="ghost"
								size="icon-xs"
								aria-label="Filtrar pelo histórico de acesso desta pessoa"
								title="Filtrar pelo histórico de acesso desta pessoa"
								onClick={() => onFilterTarget({ id: targetId, label: targetLabel ?? targetId })}
							>
								<ListFilter />
							</Button>
						)}
					</div>
				)}
			</TableCell>

			<TableCell className="text-body">
				<span className="block">{title ?? row.operation}</span>
				<span className="mt-1 flex flex-wrap items-center gap-1.5">
					<Badge variant="outline">{AUDIT_SOURCE_LABELS[description.source]}</Badge>
					<span className="font-mono text-caption text-muted-foreground">{row.operation}</span>
				</span>
			</TableCell>

			<TableCell className="min-w-64 max-w-md">
				<AuditEntryChange description={description} />
			</TableCell>

			<TableCell>
				{/* A coluna diz o grau EXIGIDO pela operação, não o que a sessão provou.
				    Rotular como "elevação recente" afirmaria uma verificação de segundo fator
				    que, enquanto os pisos estão desligados, não aconteceu — uma trilha de
				    auditoria que afirma o que não mediu é pior que uma que não afirma nada.
				    A frase segue o grau GRAVADO na linha (o fato), nunca a classificação de
				    hoje: `session` nunca vira "elevação" — ver `describeRequirement`. */}
				<Badge variant={requirement.tone}>{requirement.label}</Badge>
			</TableCell>
		</TableRow>
	)
}
