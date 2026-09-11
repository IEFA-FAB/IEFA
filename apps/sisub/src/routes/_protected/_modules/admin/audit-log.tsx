import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { ScrollText, Search, TriangleAlert, X } from "lucide-react"
import * as React from "react"
import { requirePermission } from "@/auth/pbac"
import { PageHeader } from "@/components/layout/PageHeader"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Input } from "@/components/ui/input"
import { Item, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useUserSearch } from "@/hooks/data/useUserSearch"
import { queryKeys } from "@/lib/query-keys"
import { assuranceFor } from "@/server/assurance-registry"
import { listSensitiveOperationsFn, type SensitiveOperationRow } from "@/server/audit.fn"

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

function formatStamp(value: string) {
	return new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "medium" })
}

/** Identificação do ator: e-mail quando há cadastro, o id cru quando ainda não há. */
function actorLabel(row: SensitiveOperationRow) {
	return row.actor_email ?? row.actor_id
}

/**
 * Frase que descreve a operação, lida do registro de classificação — a MESMA que o usuário
 * vê no modal de elevação. Sem ela a tabela mostraria só `createUserPermissionFn`, que é
 * legível para quem escreveu o código e para mais ninguém.
 */
function operationReason(operation: string): string | null {
	const entry = assuranceFor(operation)
	return entry && entry.require !== "none" ? entry.reason : null
}

/** Alvo em JSON compacto; a coluna trunca, e o conteúdo inteiro fica no elemento. */
function formatTarget(target: unknown) {
	if (target == null) return "—"
	return typeof target === "string" ? target : JSON.stringify(target)
}

function AuditLogPage() {
	const [search, setSearch] = React.useState("")
	const [actor, setActor] = React.useState<{ id: string; email: string } | null>(null)
	const [pageSize, setPageSize] = React.useState(50)
	const [offset, setOffset] = React.useState(0)

	const { results, isSearching, canSearch } = useUserSearch(search)

	const {
		data,
		isLoading,
		error: listError,
	} = useQuery({
		queryKey: queryKeys.audit.sensitiveOperations(actor?.id ?? null, pageSize, offset),
		queryFn: () => listSensitiveOperationsFn({ data: { actorId: actor?.id, limit: pageSize, offset } }),
	})

	const rows = data?.rows ?? []
	const total = data?.total ?? 0
	const firstShown = total === 0 ? 0 : offset + 1
	const lastShown = offset + rows.length

	function selectActor(next: { id: string; email: string } | null) {
		setActor(next)
		setSearch("")
		// A página volta ao início: manter o deslocamento levaria a uma tela vazia que
		// parece "esta pessoa não fez nada".
		setOffset(0)
	}

	return (
		<div className="space-y-6">
			<PageHeader
				title="Operações Sensíveis"
				description="Registro das operações classificadas como sensíveis — permissões, políticas, chaves de API, execução orçamentária e reset do ambiente de treino. Cada linha é gravada depois da execução; operação rejeitada não aparece aqui."
			/>

			<Card>
				<CardHeader>
					<CardTitle>Filtro</CardTitle>
				</CardHeader>
				<CardContent className="space-y-3">
					{actor ? (
						<div className="flex flex-wrap items-center gap-2">
							<span className="text-caption text-muted-foreground">Mostrando apenas as operações de</span>
							<Badge variant="secondary">{actor.email}</Badge>
							<Button variant="ghost" size="sm" onClick={() => selectActor(null)}>
								<X className="size-4" />
								Limpar filtro
							</Button>
						</div>
					) : (
						<div className="space-y-2">
							<Label htmlFor="audit-actor-search" className="text-caption">
								Filtrar por usuário (e-mail)
							</Label>
							<div className="relative max-w-md">
								<Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
								<Input
									id="audit-actor-search"
									value={search}
									onChange={(e) => setSearch(e.target.value)}
									placeholder="Digite ao menos 3 caracteres do e-mail"
									autoComplete="off"
									className="pl-8"
								/>
							</div>

							{canSearch && (
								<ItemGroup className="max-w-md">
									{isSearching ? (
										<Skeleton className="h-9 w-full" />
									) : results.length === 0 ? (
										<p className="text-caption text-muted-foreground">Nenhum usuário com esse e-mail.</p>
									) : (
										results.map((user) => (
											<Item key={user.id} variant="outline" size="sm">
												<ItemContent>
													<ItemTitle>{user.email}</ItemTitle>
													{user.nrOrdem && <ItemDescription>Nº de ordem {user.nrOrdem}</ItemDescription>}
												</ItemContent>
												<Button variant="outline" size="sm" onClick={() => selectActor({ id: user.id, email: user.email })}>
													Filtrar
												</Button>
											</Item>
										))
									)}
								</ItemGroup>
							)}
						</div>
					)}

					<div className="flex items-center gap-2">
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
								<TableHead className="text-foreground text-subheading">Quem</TableHead>
								<TableHead className="text-foreground text-subheading">Operação</TableHead>
								<TableHead className="text-foreground text-subheading">Grau</TableHead>
								<TableHead className="text-foreground text-subheading">Alvo</TableHead>
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
													{actor
														? "Este usuário não executou nenhuma operação sensível no período registrado."
														: "Nenhuma operação sensível foi executada desde que o registro entrou em vigor."}
												</EmptyDescription>
											</EmptyHeader>
										</Empty>
									</TableCell>
								</TableRow>
							) : (
								rows.map((row) => (
									<TableRow key={row.id}>
										<TableCell className="text-body whitespace-nowrap">{formatStamp(row.created_at)}</TableCell>
										<TableCell className="text-body">
											<span className="block">{actorLabel(row)}</span>
											{row.actor_nr_ordem && <span className="text-caption text-muted-foreground">Nº de ordem {row.actor_nr_ordem}</span>}
										</TableCell>
										<TableCell className="text-body">
											<span className="block font-mono text-caption">{row.operation}</span>
											{operationReason(row.operation) && <span className="text-caption text-muted-foreground">{operationReason(row.operation)}</span>}
										</TableCell>
										<TableCell>
											<Badge variant={row.assurance === "fresh" ? "warning" : "secondary"}>{row.assurance === "fresh" ? "Elevação recente" : "Sessão"}</Badge>
										</TableCell>
										<TableCell className="max-w-xs truncate font-mono text-caption text-muted-foreground">{formatTarget(row.target)}</TableCell>
									</TableRow>
								))
							)}
						</TableBody>
					</Table>

					<div className="flex flex-wrap items-center justify-between gap-2">
						{/* O total vem do servidor: sem ele, quem lê 50 linhas conclui que o sistema
						    teve 50 operações sensíveis. */}
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
