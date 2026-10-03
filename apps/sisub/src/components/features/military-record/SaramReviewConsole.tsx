import { describeVerification, formatLocalDate, formatMilitaryIdentity, onlyDigits, type SaramAccountKind } from "@iefa/database/saram-link"
import { useMutation, useQuery } from "@tanstack/react-query"
import { Building2, Inbox, Loader2, Scale, Search, TriangleAlert, UserRound } from "lucide-react"
import { type ReactNode, useDeferredValue, useId, useState } from "react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "@/components/ui/toast"
import { isElevationCancelled } from "@/lib/assurance/assurance-error"
import { queryKeys } from "@/lib/query-keys"
import type { SaramAdminResult, SaramReviewQueue, SaramSearchAccount } from "@/server/saram-admin.fn"

/**
 * Console "Cadastro militar" (admin:2): filas do vínculo de SARAM e as decisões sobre elas.
 *
 * Toda mudança passa por um diálogo que diz o EFEITO em frase ("a conta X deixa de ver os dados
 * militares de Y"), pede o motivo (gravado no registro de operações sensíveis pela função SQL,
 * na mesma transação) e manda a versão que a tela viu (pedido pendente, SARAM esperado, tipo
 * esperado). Se outra pessoa mexeu antes, o servidor recusa, a fila é relida e o diálogo mostra
 * o que mudou — nada é gravado por cima.
 *
 * A tela recebe a API por props: a rota passa as server functions já com a elevação de garantia
 * (`useSaramAdminApi`, segundo fator fresco quando o piso estiver ligado); a pré-visualização de
 * desenvolvimento passa uma falsa.
 */

type Queue = SaramReviewQueue
type RequestRow = Queue["requests"][number]
type LegacyRow = Queue["legacy"][number]

export type SaramAdminApi = {
	decide(input: { requestId: string; decision: "approve" | "reject"; note?: string }): Promise<SaramAdminResult>
	link(input: { userId: string; saram: string; expectedSaram: string | null; reason: string }): Promise<SaramAdminResult>
	unlink(input: { userId: string; expectedSaram: string; reason: string }): Promise<SaramAdminResult>
	setKind(input: { userId: string; kind: SaramAccountKind; expectedKind: SaramAccountKind; reason: string }): Promise<SaramAdminResult>
	search(query: string): Promise<SaramSearchAccount[]>
	refresh(): Promise<unknown>
}

const REASON_MIN = 10
const REASON_MAX = 1000

/** Uma ação pendente de confirmação: o que mostrar, o que pedir e o que chamar. */
type PendingAction = {
	/** Identifica a linha na fila relida: some → alguém resolveu antes. */
	key: string
	title: string
	effect: ReactNode
	confirmLabel: string
	destructive?: boolean
	/** Motivo obrigatório (toda mudança de vínculo); na aprovação de pedido, opcional. */
	reasonRequired: boolean
	/** Vínculo manual: pede o SARAM. */
	askSaram?: { initial: string }
	run: (input: { reason: string; saram: string }) => Promise<SaramAdminResult>
	successMessage: string
	/** Lote: o resultado parcial já foi gravado; reenviar repetiria contas já marcadas. Fecha e relata. */
	closeOnError?: boolean
}

function rowKeys(queue: Queue | undefined): Set<string> {
	const keys = new Set<string>()
	if (!queue) return keys
	for (const r of queue.requests) keys.add(`request:${r.id}`)
	for (const l of queue.legacy) keys.add(`legacy:${l.userId}:${l.saram}`)
	for (const u of queue.unverified) keys.add(`unverified:${u.userId}:${u.saram}`)
	for (const c of queue.institutionalCandidates) keys.add(`candidate:${c.userId}`)
	for (const i of queue.institutional) keys.add(`institutional:${i.userId}`)
	return keys
}

function matches(query: string, ...values: Array<string | null | undefined>): boolean {
	if (!query) return true
	const q = query.toLocaleLowerCase("pt-BR")
	return values.some((v) => v?.toLocaleLowerCase("pt-BR").includes(q))
}

function errorText(error: unknown): string {
	return error instanceof Error && error.message ? error.message : "Não foi possível concluir. Tente de novo em instantes."
}

export function SaramReviewConsole({ queue, isLoading, error, api }: { queue: Queue | undefined; isLoading: boolean; error: unknown; api: SaramAdminApi }) {
	const [filter, setFilter] = useState("")
	const query = useDeferredValue(filter.trim())
	const [tab, setTab] = useState<string>("requests")
	const [pending, setPending] = useState<PendingAction | null>(null)
	const [selected, setSelected] = useState<Set<string>>(new Set())
	const searchId = useId()

	const keys = rowKeys(queue)
	const requests = (queue?.requests ?? []).filter((r) => r.kind === "link")
	const disputes = (queue?.requests ?? []).filter((r) => r.kind === "dispute")
	const legacy = queue?.legacy ?? []
	const unverified = queue?.unverified ?? []
	const candidates = queue?.institutionalCandidates ?? []
	const institutional = queue?.institutional ?? []

	const filterRequest = (r: RequestRow) => matches(query, r.requester.email, r.saram, r.identity?.nomeGuerra, ...r.holders.map((h) => h.email))
	const filterLegacy = (l: LegacyRow) => matches(query, l.email, l.saram, l.identity?.nomeGuerra)
	const shown = {
		requests: requests.filter(filterRequest),
		disputes: disputes.filter(filterRequest),
		legacy: legacy.filter(filterLegacy),
		unverified: unverified.filter((u) => matches(query, u.email, u.saram)),
		candidates: candidates.filter((c) => matches(query, c.email)),
		institutional: institutional.filter((c) => matches(query, c.email)),
	}

	const search = useQuery({
		queryKey: queryKeys.user.saramAccountSearch(query),
		queryFn: () => api.search(query),
		enabled: tab === "search" && query.length >= 3,
		staleTime: 30_000,
	})

	// Só o que está NA TELA entra no lote: a seleção feita sem filtro não pode marcar contas que o
	// filtro escondeu, nem as que já saíram da fila.
	const selectedShown = shown.candidates.filter((c) => selected.has(c.userId))

	const count = (filtered: number, total: number) => (query && filtered !== total ? `${filtered} de ${total}` : String(total))

	// ── Ações por linha ───────────────────────────────────────────────────────

	const approve = (r: RequestRow) => {
		const who = r.requester.email ?? "a conta"
		const identity = formatMilitaryIdentity(r.identity)
		setPending({
			key: `request:${r.id}`,
			title: r.kind === "dispute" ? "Aprovar a contestação?" : "Aprovar o pedido?",
			effect: (
				<>
					{identity ? (
						<>
							<strong>{who}</strong> passa a ser {identity} no sistema e a ver os dados militares do SARAM {r.saram}.
						</>
					) : (
						<>
							<strong>{who}</strong> fica vinculada ao SARAM {r.saram}, que não está no cadastro de pessoal: posto e nome de guerra só aparecem depois da
							próxima carga do cadastro.
						</>
					)}
					{r.holders.length > 0 && (
						<>
							{" "}
							{r.holders.map((h) => h.email ?? "outra conta").join(", ")} {r.holders.length === 1 ? "deixa" : "deixam"} de ter este SARAM e de ver esses dados.
						</>
					)}
				</>
			),
			confirmLabel: "Aprovar",
			reasonRequired: false,
			run: ({ reason }) => api.decide({ requestId: r.id, decision: "approve", note: reason || undefined }),
			successMessage: `Vínculo aprovado: ${who}.`,
		})
	}

	const reject = (r: RequestRow) => {
		const who = r.requester.email ?? "a conta"
		setPending({
			key: `request:${r.id}`,
			title: r.kind === "dispute" ? "Recusar a contestação?" : "Recusar o pedido?",
			effect: (
				<>
					Nada muda no vínculo: <strong>{who}</strong> continua sem o SARAM {r.saram}
					{r.holders.length > 0 ? ", que segue com a conta atual" : ""}. A pessoa vê que o pedido foi recusado e pode tentar outro caminho.
				</>
			),
			confirmLabel: "Recusar",
			destructive: true,
			reasonRequired: true,
			run: ({ reason }) => api.decide({ requestId: r.id, decision: "reject", note: reason }),
			successMessage: `Pedido recusado: ${who}.`,
		})
	}

	const confirmLegacy = (l: { userId: string; email: string; saram: string; identity?: LegacyRow["identity"] }, key: string) => {
		const identity = formatMilitaryIdentity(l.identity ?? null) || `SARAM ${l.saram}`
		setPending({
			key,
			title: "Confirmar o vínculo?",
			effect: (
				<>
					<strong>{l.email}</strong> fica vinculada a {identity} como verificada pela administração, e sai desta fila. Confirme só depois de conferir com a
					pessoa.
				</>
			),
			confirmLabel: "Confirmar vínculo",
			reasonRequired: true,
			run: ({ reason }) => api.link({ userId: l.userId, saram: l.saram, expectedSaram: l.saram, reason }),
			successMessage: `Vínculo confirmado: ${l.email}.`,
		})
	}

	const unlink = (l: { userId: string; email: string; saram: string; identity?: LegacyRow["identity"] }, key: string) => {
		const identity = formatMilitaryIdentity(l.identity ?? null) || `o SARAM ${l.saram}`
		setPending({
			key,
			title: "Desvincular o SARAM?",
			effect: (
				<>
					<strong>{l.email}</strong> deixa de ver os dados militares de {identity} e passa a aparecer pelo e-mail. A pessoa pode verificar de novo pelo e-mail,
					pelo CPF ou pedindo à administração.
				</>
			),
			confirmLabel: "Desvincular",
			destructive: true,
			reasonRequired: true,
			run: ({ reason }) => api.unlink({ userId: l.userId, expectedSaram: l.saram, reason }),
			successMessage: `SARAM desvinculado: ${l.email}.`,
		})
	}

	const setKind = (account: { userId: string; email: string }, kind: SaramAccountKind, key: string) => {
		const toInstitutional = kind === "institucional"
		setPending({
			key,
			title: toInstitutional ? "Marcar como conta de seção?" : "Voltar a conta pessoal?",
			effect: toInstitutional ? (
				<>
					<strong>{account.email}</strong> deixa de ter SARAM e arranchamento próprio: os arranchamentos dela de hoje em diante são cancelados e um pedido em
					análise é encerrado. Módulos, permissões, senha e verificação em duas etapas continuam.
				</>
			) : (
				<>
					<strong>{account.email}</strong> volta a poder arranchar e passa a pedir o vínculo do SARAM de quem a usa. Arranchamentos cancelados antes não voltam.
				</>
			),
			confirmLabel: toInstitutional ? "Marcar como seção" : "Marcar como pessoal",
			destructive: toInstitutional,
			reasonRequired: true,
			run: ({ reason }) => api.setKind({ userId: account.userId, kind, expectedKind: toInstitutional ? "pessoal" : "institucional", reason }),
			successMessage: toInstitutional ? `Conta de seção: ${account.email}.` : `Conta pessoal: ${account.email}.`,
		})
	}

	const linkManually = (account: SaramSearchAccount) => {
		setPending({
			key: `search:${account.userId}`,
			title: account.saram ? "Trocar o SARAM vinculado?" : "Vincular um SARAM?",
			effect: (
				<>
					<strong>{account.email}</strong> passa a ver os dados militares do SARAM informado, verificado pela administração.
					{account.saram ? ` O SARAM atual (${account.saram}) sai da conta.` : ""} Se o SARAM estiver em outra conta sem verificação, ele sai de lá.
				</>
			),
			confirmLabel: "Vincular",
			reasonRequired: true,
			askSaram: { initial: "" },
			run: ({ reason, saram }) => api.link({ userId: account.userId, saram, expectedSaram: account.saram, reason }),
			successMessage: `SARAM vinculado: ${account.email}.`,
		})
	}

	const bulkInstitutional = () => {
		const targets = selectedShown
		setPending({
			key: "bulk",
			title: `Marcar ${targets.length} ${targets.length === 1 ? "conta" : "contas"} como de seção?`,
			effect: (
				<>
					Cada conta deixa de ter SARAM e arranchamento próprio (os arranchamentos de hoje em diante são cancelados). Uma operação por conta, cada uma no
					registro de operações sensíveis com este motivo: {targets.map((t) => t.email).join(", ")}.
				</>
			),
			confirmLabel: `Marcar ${targets.length}`,
			destructive: true,
			reasonRequired: true,
			run: async ({ reason }) => {
				const failed: string[] = []
				let last: SaramAdminResult = { outcome: "changed", logId: null }
				for (const t of targets) {
					try {
						last = await api.setKind({ userId: t.userId, kind: "institucional", expectedKind: "pessoal", reason })
					} catch (e) {
						if (isElevationCancelled(e)) throw e
						failed.push(`${t.email}: ${errorText(e)}`)
					}
				}
				setSelected(new Set())
				if (failed.length > 0) throw new Error(`${targets.length - failed.length} marcadas; ${failed.length} não: ${failed.join(" · ")}`)
				return last
			},
			successMessage: `${targets.length} ${targets.length === 1 ? "conta marcada" : "contas marcadas"} como de seção.`,
			closeOnError: true,
		})
	}

	// ── Render ────────────────────────────────────────────────────────────────

	if (error) {
		return (
			<Alert variant="destructive">
				<TriangleAlert aria-hidden />
				<AlertTitle>Não foi possível carregar as filas</AlertTitle>
				<AlertDescription>
					<p>{errorText(error)}</p>
					<Button variant="outline" size="sm" className="mt-2" onClick={() => api.refresh()}>
						Tentar de novo
					</Button>
				</AlertDescription>
			</Alert>
		)
	}

	return (
		<div className="flex flex-col gap-4">
			<Field>
				<FieldLabel htmlFor={searchId}>Buscar por e-mail, nome de guerra ou SARAM</FieldLabel>
				<Input
					id={searchId}
					className="max-w-md"
					value={filter}
					onChange={(e) => setFilter(e.target.value)}
					placeholder="ex.: fulanofs@fab.mil.br"
					type="search"
				/>
				<FieldDescription>Filtra as filas abaixo. Para achar qualquer conta, mesmo fora das filas, use a aba "Buscar conta".</FieldDescription>
			</Field>

			<Tabs value={tab} onValueChange={(v) => setTab(String(v))}>
				<div className="-mx-1 overflow-x-auto px-1 pb-1">
					<TabsList variant="line">
						<TabsTrigger value="requests">Pedidos ({count(shown.requests.length, requests.length)})</TabsTrigger>
						<TabsTrigger value="disputes">Contestações ({count(shown.disputes.length, disputes.length)})</TabsTrigger>
						<TabsTrigger value="legacy">
							Vínculos antigos ({count(shown.legacy.length + shown.unverified.length, legacy.length + unverified.length)})
						</TabsTrigger>
						<TabsTrigger value="candidates">Candidatas a seção ({count(shown.candidates.length, candidates.length)})</TabsTrigger>
						<TabsTrigger value="institutional">Contas de seção ({count(shown.institutional.length, institutional.length)})</TabsTrigger>
						<TabsTrigger value="search">Buscar conta</TabsTrigger>
					</TabsList>
				</div>

				{isLoading ? (
					<Skeleton className="h-48 w-full" />
				) : (
					<>
						<TabsContent value="requests" className="pt-2">
							<QueueIntro>
								Pessoas que pediram o vínculo de um SARAM sem conseguir conferir pelo e-mail ou pelo CPF. Confira com a pessoa antes de aprovar.
							</QueueIntro>
							<RequestList rows={shown.requests} empty="Nenhum pedido esperando decisão." onApprove={approve} onReject={reject} />
						</TabsContent>
						<TabsContent value="disputes" className="pt-2">
							<QueueIntro>
								Alguém diz que um SARAM já vinculado a outra conta é seu. Compare as duas contas: aprovar passa o SARAM para quem contestou.
							</QueueIntro>
							<RequestList rows={shown.disputes} empty="Nenhuma contestação esperando decisão." onApprove={approve} onReject={reject} />
						</TabsContent>
						<TabsContent value="legacy" className="pt-2">
							<QueueIntro>
								Vínculos feitos antes da verificação automática, que o e-mail não confirma. Continuam valendo até você confirmar ou desvincular.
							</QueueIntro>
							<LegacyList
								rows={shown.legacy}
								onConfirm={(l) => confirmLegacy(l, `legacy:${l.userId}:${l.saram}`)}
								onUnlink={(l) => unlink(l, `legacy:${l.userId}:${l.saram}`)}
							/>
							{shown.unverified.length > 0 && (
								<div className="mt-6 flex flex-col gap-2">
									<h3 className="text-subheading text-foreground">Gravados sem verificação</h3>
									<QueueIntro>SARAM gravado por uma versão antiga do sistema. Não dá acesso a dado militar até ser confirmado.</QueueIntro>
									<ItemGroup>
										{shown.unverified.map((u) => (
											<Item key={`${u.userId}:${u.saram}`} variant="outline" role="listitem">
												<ItemMedia variant="icon">
													<UserRound aria-hidden />
												</ItemMedia>
												<ItemContent>
													<ItemTitle>{u.email}</ItemTitle>
													<ItemDescription className="line-clamp-none">SARAM {u.saram}, sem verificação</ItemDescription>
												</ItemContent>
												<ItemActions className="basis-full justify-end sm:basis-auto">
													<Button size="sm" variant="outline" onClick={() => confirmLegacy(u, `unverified:${u.userId}:${u.saram}`)}>
														Confirmar
													</Button>
													<Button size="sm" variant="ghost" onClick={() => unlink(u, `unverified:${u.userId}:${u.saram}`)}>
														Desvincular
													</Button>
												</ItemActions>
											</Item>
										))}
									</ItemGroup>
								</div>
							)}
						</TabsContent>
						<TabsContent value="candidates" className="pt-2">
							<QueueIntro>
								Contas @fab.mil.br sem SARAM cujo e-mail não corresponde a ninguém do cadastro: costumam ser de seção (cozinha, subsistência). Confira antes de
								marcar; dá para desfazer.
							</QueueIntro>
							{shown.candidates.length === 0 ? (
								<EmptyQueue text="Nenhuma conta candidata." />
							) : (
								<>
									<div className="mb-3 flex flex-wrap items-center gap-3">
										<Checkbox
											aria-label="Selecionar todas as contas listadas"
											checked={shown.candidates.length > 0 && shown.candidates.every((c) => selected.has(c.userId))}
											indeterminate={shown.candidates.some((c) => selected.has(c.userId)) && !shown.candidates.every((c) => selected.has(c.userId))}
											onCheckedChange={(checked) => setSelected(checked ? new Set(shown.candidates.map((c) => c.userId)) : new Set())}
										/>
										<span className="text-caption text-muted-foreground">
											{selectedShown.length > 0 ? `${selectedShown.length} selecionadas` : "Selecionar todas"}
										</span>
										<Button size="sm" variant="outline" disabled={selectedShown.length === 0} onClick={bulkInstitutional}>
											Marcar selecionadas como seção
										</Button>
									</div>
									<ItemGroup>
										{shown.candidates.map((c) => (
											<Item key={c.userId} variant="outline" role="listitem">
												<Checkbox
													aria-label={`Selecionar ${c.email}`}
													checked={selected.has(c.userId)}
													onCheckedChange={(checked) =>
														setSelected((prev) => {
															const next = new Set(prev)
															if (checked) next.add(c.userId)
															else next.delete(c.userId)
															return next
														})
													}
												/>
												<ItemContent>
													<ItemTitle>{c.email}</ItemTitle>
													<ItemDescription className="line-clamp-none">Conta criada em {formatLocalDate(c.createdAt) || "data desconhecida"}</ItemDescription>
												</ItemContent>
												<ItemActions className="basis-full justify-end sm:basis-auto">
													<Button size="sm" variant="outline" onClick={() => setKind(c, "institucional", `candidate:${c.userId}`)}>
														Marcar como seção
													</Button>
												</ItemActions>
											</Item>
										))}
									</ItemGroup>
								</>
							)}
						</TabsContent>
						<TabsContent value="institutional" className="pt-2">
							<QueueIntro>Contas de seção: sem SARAM e sem arranchamento. Se uma delas é de uma pessoa, volte-a para pessoal.</QueueIntro>
							{shown.institutional.length === 0 ? (
								<EmptyQueue text="Nenhuma conta de seção." />
							) : (
								<ItemGroup>
									{shown.institutional.map((c) => (
										<Item key={c.userId} variant="outline" role="listitem">
											<ItemMedia variant="icon">
												<Building2 aria-hidden />
											</ItemMedia>
											<ItemContent>
												<ItemTitle>{c.email}</ItemTitle>
											</ItemContent>
											<ItemActions className="basis-full justify-end sm:basis-auto">
												<Button size="sm" variant="outline" onClick={() => setKind(c, "pessoal", `institutional:${c.userId}`)}>
													Voltar a pessoal
												</Button>
											</ItemActions>
										</Item>
									))}
								</ItemGroup>
							)}
						</TabsContent>
						<TabsContent value="search" className="pt-2">
							<QueueIntro>
								Qualquer conta do sistema, para vincular, desvincular ou marcar o tipo fora das filas. Digite ao menos 3 caracteres acima.
							</QueueIntro>
							{query.length < 3 ? (
								<EmptyQueue text="Digite parte do e-mail, o nome de guerra ou o SARAM no campo de busca." icon={Search} />
							) : search.isLoading ? (
								<Skeleton className="h-32 w-full" />
							) : search.error ? (
								<Alert variant="destructive">
									<TriangleAlert aria-hidden />
									<AlertTitle>A busca falhou</AlertTitle>
									<AlertDescription>{errorText(search.error)}</AlertDescription>
								</Alert>
							) : (search.data ?? []).length === 0 ? (
								<EmptyQueue text={`Nenhuma conta encontrada para "${query}".`} icon={Search} />
							) : (
								<ItemGroup>
									{(search.data ?? []).map((a) => (
										<Item key={a.userId} variant="outline" role="listitem">
											<ItemMedia variant="icon">{a.accountKind === "institucional" ? <Building2 aria-hidden /> : <UserRound aria-hidden />}</ItemMedia>
											<ItemContent>
												<ItemTitle>{a.email}</ItemTitle>
												<ItemDescription className="line-clamp-none">{describeAccount(a)}</ItemDescription>
											</ItemContent>
											<ItemActions className="basis-full flex-wrap justify-end sm:basis-auto">
												{a.accountKind === "pessoal" && (
													<Button size="sm" variant="outline" onClick={() => linkManually(a)}>
														{a.saram ? "Trocar SARAM" : "Vincular SARAM"}
													</Button>
												)}
												{a.saram && (
													<Button size="sm" variant="ghost" onClick={() => unlink({ ...a, saram: a.saram ?? "" }, `search:${a.userId}`)}>
														Desvincular
													</Button>
												)}
												<Button
													size="sm"
													variant="ghost"
													onClick={() => setKind(a, a.accountKind === "institucional" ? "pessoal" : "institucional", `search:${a.userId}`)}
												>
													{a.accountKind === "institucional" ? "Voltar a pessoal" : "Marcar como seção"}
												</Button>
											</ItemActions>
										</Item>
									))}
								</ItemGroup>
							)}
						</TabsContent>
					</>
				)}
			</Tabs>

			<AdminActionDialog
				action={pending}
				stale={!!pending && pending.key !== "bulk" && !pending.key.startsWith("search:") && !!queue && !keys.has(pending.key)}
				onClose={() => setPending(null)}
				onSettled={async () => {
					await api.refresh()
					if (tab === "search") await search.refetch()
				}}
			/>
		</div>
	)
}

function describeAccount(a: SaramSearchAccount): string {
	if (a.accountKind === "institucional") return "Conta de seção, sem SARAM"
	if (!a.saram) return a.hasPendingRequest ? "Sem SARAM; pedido em análise" : "Sem SARAM vinculado"
	const who = formatMilitaryIdentity(a.identity)
	const how =
		a.verifiedBy === "legacy" ? "vínculo antigo, em revisão" : a.verifiedBy ? `verificado ${describeVerification(a.verifiedBy)}` : "gravado sem verificação"
	const conflict = a.verifiedElsewhere && (a.verifiedBy === "legacy" || a.verifiedBy === null)
	return [`SARAM ${a.saram}`, who, how, conflict ? "o mesmo SARAM está verificado em outra conta" : null].filter(Boolean).join(" · ")
}

function QueueIntro({ children }: { children: ReactNode }) {
	return <p className="mb-3 max-w-prose text-caption text-muted-foreground">{children}</p>
}

function EmptyQueue({ text, icon: Icon = Inbox }: { text: string; icon?: typeof Inbox }) {
	return (
		<Empty>
			<EmptyHeader>
				<EmptyMedia variant="icon">
					<Icon aria-hidden />
				</EmptyMedia>
				<EmptyTitle>Nada aqui</EmptyTitle>
				<EmptyDescription>{text}</EmptyDescription>
			</EmptyHeader>
		</Empty>
	)
}

function RequestList({
	rows,
	empty,
	onApprove,
	onReject,
}: {
	rows: RequestRow[]
	empty: string
	onApprove: (r: RequestRow) => void
	onReject: (r: RequestRow) => void
}) {
	if (rows.length === 0) return <EmptyQueue text={empty} />
	return (
		<ItemGroup>
			{rows.map((r) => (
				<Item key={r.id} variant="outline" role="listitem">
					<ItemMedia variant="icon">{r.kind === "dispute" ? <Scale aria-hidden /> : <UserRound aria-hidden />}</ItemMedia>
					<ItemContent>
						<ItemTitle>
							{r.requester.email ?? "Conta sem e-mail"}
							{r.claimVerifiedBy && <Badge variant="success">Provou pelo {r.claimVerifiedBy === "cpf" ? "CPF" : "e-mail"}</Badge>}
						</ItemTitle>
						<ItemDescription className="line-clamp-none">
							Pede o SARAM {r.saram}
							{r.identity ? `, que no cadastro é ${formatMilitaryIdentity(r.identity)}` : ", que não está no cadastro de pessoal"} ·{" "}
							{formatLocalDate(r.createdAt)}
						</ItemDescription>
						{r.holders.length > 0 && (
							<ItemDescription className="line-clamp-none">
								Hoje com:{" "}
								{r.holders.map((h) => `${h.email ?? "conta sem e-mail"} (${h.verifiedBy ? describeHolder(h.verifiedBy) : "sem verificação"})`).join(", ")}
							</ItemDescription>
						)}
						<ItemDescription className="line-clamp-none text-foreground">“{r.justification}”</ItemDescription>
					</ItemContent>
					<ItemActions className="basis-full justify-end sm:basis-auto">
						<Button size="sm" onClick={() => onApprove(r)}>
							Aprovar
						</Button>
						<Button size="sm" variant="outline" onClick={() => onReject(r)}>
							Recusar
						</Button>
					</ItemActions>
				</Item>
			))}
		</ItemGroup>
	)
}

function describeHolder(by: NonNullable<RequestRow["holders"][number]["verifiedBy"]>): string {
	return by === "legacy" ? "vínculo antigo" : `verificado ${describeVerification(by)}`
}

function LegacyList({ rows, onConfirm, onUnlink }: { rows: LegacyRow[]; onConfirm: (l: LegacyRow) => void; onUnlink: (l: LegacyRow) => void }) {
	if (rows.length === 0) return <EmptyQueue text="Nenhum vínculo antigo para revisar." />
	return (
		<ItemGroup>
			{rows.map((l) => (
				<Item key={`${l.userId}:${l.saram}`} variant="outline" role="listitem">
					<ItemMedia variant="icon">
						<UserRound aria-hidden />
					</ItemMedia>
					<ItemContent>
						<ItemTitle>
							{l.email}
							{l.verifiedElsewhere && <Badge variant="destructive">SARAM verificado em outra conta</Badge>}
						</ItemTitle>
						<ItemDescription className="line-clamp-none">
							SARAM {l.saram}
							{l.identity ? `: ${formatMilitaryIdentity(l.identity)}` : ", fora do cadastro de pessoal"}
							{l.sharedWith > 0 ? ` · em mais ${l.sharedWith} ${l.sharedWith === 1 ? "conta" : "contas"}` : ""}
						</ItemDescription>
						{l.verifiedElsewhere && (
							<ItemDescription className="line-clamp-none">
								Esta conta já não vê os dados (o dono verificou em outra). O caminho comum é desvincular.
							</ItemDescription>
						)}
					</ItemContent>
					<ItemActions className="basis-full justify-end sm:basis-auto">
						{!l.verifiedElsewhere && (
							<Button size="sm" variant="outline" onClick={() => onConfirm(l)}>
								Confirmar
							</Button>
						)}
						<Button size="sm" variant={l.verifiedElsewhere ? "outline" : "ghost"} onClick={() => onUnlink(l)}>
							Desvincular
						</Button>
					</ItemActions>
				</Item>
			))}
		</ItemGroup>
	)
}

function AdminActionDialog({
	action,
	stale,
	onClose,
	onSettled,
}: {
	action: PendingAction | null
	stale: boolean
	onClose: () => void
	onSettled: () => Promise<void>
}) {
	const [reason, setReason] = useState("")
	const [saram, setSaram] = useState("")
	const [touched, setTouched] = useState(false)
	const [failure, setFailure] = useState<string | null>(null)
	const [prevAction, setPrevAction] = useState(action)
	const reasonId = useId()
	const saramId = useId()

	if (prevAction !== action) {
		setPrevAction(action)
		setReason("")
		setSaram(action?.askSaram?.initial ?? "")
		setTouched(false)
		setFailure(null)
	}

	const mutation = useMutation({
		mutationFn: (input: { reason: string; saram: string }) => {
			if (!action) throw new Error("Nenhuma ação selecionada.")
			return action.run(input)
		},
		onSuccess: async () => {
			if (action) toast.success(action.successMessage)
			await onSettled()
			onClose()
		},
		onError: async (error) => {
			if (isElevationCancelled(error)) return
			if (action?.closeOnError) {
				toast.error("O lote não terminou inteiro", { description: errorText(error) })
				await onSettled()
				onClose()
				return
			}
			setFailure(errorText(error))
			// Conflito de versão (alguém decidiu antes) ou falha: a fila é relida e o diálogo mostra o novo estado.
			await onSettled()
		},
	})

	const trimmed = reason.trim()
	const reasonError = touched && action?.reasonRequired && trimmed.length < REASON_MIN ? `Informe o motivo (mínimo de ${REASON_MIN} caracteres).` : null
	const saramError = touched && action?.askSaram && !/^\d{6,7}$/.test(saram) ? "O SARAM tem 6 ou 7 dígitos." : null

	const submit = () => {
		setTouched(true)
		if (!action) return
		if (action.reasonRequired && trimmed.length < REASON_MIN) return
		if (action.askSaram && !/^\d{6,7}$/.test(saram)) return
		if (!action.reasonRequired && trimmed.length > 0 && trimmed.length < REASON_MIN) return
		setFailure(null)
		mutation.mutate({ reason: trimmed, saram })
	}

	return (
		<Dialog open={!!action} onOpenChange={(open) => !open && !mutation.isPending && onClose()}>
			<DialogContent className="sm:max-w-lg">
				{action && (
					<>
						<DialogHeader>
							<DialogTitle>{action.title}</DialogTitle>
							<DialogDescription>{action.effect}</DialogDescription>
						</DialogHeader>

						{stale && (
							<Alert variant="warning">
								<TriangleAlert aria-hidden />
								<AlertTitle>Este item saiu da fila</AlertTitle>
								<AlertDescription>Outra pessoa já resolveu este caso (a fila foi atualizada). Feche e confira a lista de novo.</AlertDescription>
							</Alert>
						)}

						<form
							noValidate
							onSubmit={(e) => {
								e.preventDefault()
								submit()
							}}
						>
							<FieldGroup>
								{action.askSaram && (
									<Field data-invalid={!!saramError}>
										<FieldLabel htmlFor={saramId}>SARAM</FieldLabel>
										<Input
											id={saramId}
											className="max-w-40"
											value={saram}
											onChange={(e) => setSaram(onlyDigits(e.target.value, 7))}
											inputMode="numeric"
											autoComplete="off"
											maxLength={7}
											aria-invalid={!!saramError}
											disabled={mutation.isPending}
										/>
										{saramError && <FieldError>{saramError}</FieldError>}
									</Field>
								)}
								<Field data-invalid={!!reasonError}>
									<FieldLabel htmlFor={reasonId}>
										{action.reasonRequired ? "Motivo (vai para o registro de operações sensíveis)" : "Observação (opcional)"}
									</FieldLabel>
									<Textarea
										id={reasonId}
										value={reason}
										onChange={(e) => setReason(e.target.value.slice(0, REASON_MAX))}
										rows={3}
										placeholder="Ex.: Conferido por telefone com o militar e com a seção de pessoal."
										aria-invalid={!!reasonError}
										disabled={mutation.isPending}
									/>
									<FieldDescription>
										{action.reasonRequired ? `Mínimo de ${REASON_MIN} caracteres.` : `Se escrever, mínimo de ${REASON_MIN} caracteres.`} {trimmed.length}/
										{REASON_MAX}
									</FieldDescription>
									{reasonError && <FieldError>{reasonError}</FieldError>}
								</Field>
							</FieldGroup>

							{failure && (
								<Alert variant="destructive" className="mt-4">
									<TriangleAlert aria-hidden />
									<AlertTitle>Não foi gravado</AlertTitle>
									<AlertDescription>{failure}</AlertDescription>
								</Alert>
							)}

							<DialogFooter className="mt-4">
								<Button type="button" variant="outline" onClick={onClose} disabled={mutation.isPending}>
									Cancelar
								</Button>
								<Button type="submit" variant={action.destructive ? "destructive" : "default"} disabled={mutation.isPending || stale}>
									{mutation.isPending && <Loader2 className="animate-spin" aria-hidden />}
									{action.confirmLabel}
								</Button>
							</DialogFooter>
						</form>
					</>
				)}
			</DialogContent>
		</Dialog>
	)
}
