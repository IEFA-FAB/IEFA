import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { IdCard, Loader2, Mail, Plus, Search, Trash2, UserRound, X } from "lucide-react"
import { useId, useState } from "react"
import { useSucontAccess } from "#/auth/pbac"
import { ReadOnlyNotice } from "#/components/read-only-notice"
import { Badge } from "#/components/ui/badge"
import { Button } from "#/components/ui/button"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "#/components/ui/empty"
import { Input } from "#/components/ui/input"
import { toast } from "#/components/ui/toast"
import { sectionPeopleQueryOptions } from "#/lib/notifications"
import {
	createSectionPersonFn,
	linkPersonAccountFn,
	linkPersonRosterFn,
	type RosterMatch,
	removeSectionPersonFn,
	type SectionPerson,
	searchRosterFn,
} from "#/server/people.fn"

/**
 * Cadastro de pessoas da seção.
 *
 * A tela existe por causa de um número: no efetivo da FAB, "3S VANESSA" casa com
 * QUATORZE pessoas e "3S TALITA" com cinco. Enquanto o responsável era texto
 * livre, o app não sabia — e não tinha como saber — de quem estava falando. Quem
 * desfaz a ambiguidade é um humano escolhendo o SARAM aqui; o app nunca adivinha
 * por casamento de nome.
 *
 * Três vínculos, e eles são independentes:
 *   • NOME      — sempre existe. É o rótulo de reserva.
 *   • SARAM     — liga ao efetivo. A partir dele o posto vem do cadastro e fica
 *                 certo depois de uma promoção.
 *   • CONTA     — liga ao login. É o que dá caixa de entrada: sem ela a pessoa
 *                 recebe tarefa, mas não recebe o sino.
 */
export function SucontPeopleManager() {
	const { canManage, isLoading: loadingAccess } = useSucontAccess()
	const queryClient = useQueryClient()
	const { data: people = [], isPending, isError } = useQuery(sectionPeopleQueryOptions())
	const [isAdding, setIsAdding] = useState(false)
	const [newName, setNewName] = useState("")
	const newNameId = useId()

	const invalidate = () => queryClient.invalidateQueries({ queryKey: sectionPeopleQueryOptions().queryKey })

	const createPerson = useMutation({
		mutationFn: (displayName: string) => createSectionPersonFn({ data: { displayName } }),
		onSuccess: (result) => {
			setIsAdding(false)
			setNewName("")
			// A pessoa pode já existir no ERP — saiu desta seção um dia, ou outro app
			// a cadastrou. Dizer isso evita a leitura de que houve duplicata, e
			// explica por que o SARAM já vem preenchido.
			if (result.reused) toast.success("Essa pessoa já estava no cadastro do ERP e voltou para a seção.")
			invalidate()
		},
		onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao cadastrar"),
	})

	const removePerson = useMutation({
		mutationFn: (id: string) => removeSectionPersonFn({ data: { id } }),
		onSuccess: invalidate,
		onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao remover"),
	})

	// Carregando, falhou e vazio são três telas — §7.1 do contrato.
	if (isPending || loadingAccess) {
		return (
			<div className="flex items-center justify-center gap-2 py-12 text-body font-mono text-muted-foreground">
				<Loader2 className="size-4 animate-spin" /> Carregando pessoas...
			</div>
		)
	}
	if (isError) {
		return <p className="py-12 text-center text-caption text-destructive">Não foi possível carregar o cadastro de pessoas.</p>
	}

	return (
		<div className="space-y-6">
			{!canManage && <ReadOnlyNotice scope="o cadastro de pessoas da seção" />}

			{canManage && (
				<div className="flex justify-end">
					<Button type="button" variant="outline" onClick={() => setIsAdding(true)} className="gap-2 bg-card font-mono text-tech-cyan hover:bg-muted/50">
						<Plus className="size-4" /> CADASTRAR PESSOA
					</Button>
				</div>
			)}

			{isAdding && canManage && (
				<form
					onSubmit={(e) => {
						e.preventDefault()
						createPerson.mutate(newName)
					}}
					className="flex flex-col gap-3 rounded-lg border border-tech-cyan/30 bg-card p-4 shadow-md sm:flex-row sm:items-end"
				>
					<div className="flex flex-1 flex-col gap-1">
						<label htmlFor={newNameId} className="font-mono text-label text-muted-foreground">
							Nome na seção
						</label>
						{/* O SARAM não é pedido aqui de propósito: a pessoa precisa existir
						    para receber trabalho antes de alguém ter o número em mãos. */}
						<Input
							id={newNameId}
							value={newName}
							onChange={(e) => setNewName(e.target.value)}
							placeholder="Como a seção chama a pessoa — ex.: 3S VANESSA"
							required
							minLength={2}
							className="border-border bg-muted/50 text-foreground focus:border-tech-cyan"
						/>
					</div>
					<div className="flex gap-2">
						<Button type="button" variant="ghost" onClick={() => setIsAdding(false)} className="text-muted-foreground hover:text-foreground">
							CANCELAR
						</Button>
						<Button type="submit" disabled={createPerson.isPending} className="gap-2 bg-tech-cyan text-white shadow-md hover:bg-tech-cyan/90">
							{createPerson.isPending && <Loader2 className="size-3 animate-spin" />} CADASTRAR
						</Button>
					</div>
				</form>
			)}

			{people.length === 0 ? (
				<Empty>
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<UserRound />
						</EmptyMedia>
						<EmptyTitle>Nenhuma pessoa na seção</EmptyTitle>
						<EmptyDescription>
							Cadastre quem opera as Unidades Gestoras e responde pelo cronograma. Sem cadastro, o campo de responsável volta a ser um nome solto que nenhuma
							consulta consegue seguir.
						</EmptyDescription>
					</EmptyHeader>
				</Empty>
			) : (
				<ul className="space-y-3">
					{people.map((person) => (
						<PersonRow key={person.id} person={person} canManage={canManage} onChanged={invalidate} onRemove={() => removePerson.mutate(person.id)} />
					))}
				</ul>
			)}
		</div>
	)
}

function PersonRow({ person, canManage, onChanged, onRemove }: { person: SectionPerson; canManage: boolean; onChanged: () => void; onRemove: () => void }) {
	const [linking, setLinking] = useState<"roster" | "account" | null>(null)

	return (
		<li className="rounded-lg border border-border bg-card p-4 shadow-sm">
			<div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
				<div className="min-w-0">
					<p className="text-subheading text-foreground">{person.label}</p>
					{/* O nome de reserva só aparece quando DIFERE do rótulo resolvido:
					    repetir "3S VANESSA" embaixo de "3S VANESSA" seria ruído. Quando
					    difere, ele explica por que a tela mudou de nome sozinha. */}
					{person.displayName && person.displayName !== person.label && (
						<p className="mt-0.5 text-hint font-mono text-muted-foreground">cadastrada na seção como “{person.displayName}”</p>
					)}
					<div className="mt-2 flex flex-wrap items-center gap-1.5">
						<Badge variant={person.nrOrdem ? "success" : "muted"} className="gap-1">
							<IdCard className="size-3" /> {person.nrOrdem ? `SARAM ${person.nrOrdem}` : "sem SARAM"}
						</Badge>
						<Badge variant={person.hasAccount ? "success" : "warning"} className="gap-1">
							<Mail className="size-3" /> {person.email ?? "sem conta"}
						</Badge>
						<Badge variant="muted">
							{person.taskCount} {person.taskCount === 1 ? "tarefa" : "tarefas"}
						</Badge>
						<Badge variant="muted">
							{person.ugCount} {person.ugCount === 1 ? "UG" : "UGs"}
						</Badge>
					</div>
					{/* Diz a consequência, não o estado: "sem conta" já está no selo. O
					    que o admin precisa saber é que o sino não alcança essa pessoa. */}
					{!person.hasAccount && (
						<p className="mt-2 text-hint text-muted-foreground">Recebe tarefa, mas não recebe notificação — a caixa de entrada depende de uma conta.</p>
					)}
				</div>

				{canManage && (
					<div className="flex shrink-0 flex-wrap gap-2">
						<Button type="button" variant="outline" size="sm" onClick={() => setLinking(linking === "roster" ? null : "roster")} className="gap-1.5">
							<IdCard className="size-3.5" /> {person.nrOrdem ? "Trocar SARAM" : "Vincular SARAM"}
						</Button>
						<Button type="button" variant="outline" size="sm" onClick={() => setLinking(linking === "account" ? null : "account")} className="gap-1.5">
							<Mail className="size-3.5" /> {person.hasAccount ? "Trocar conta" : "Vincular conta"}
						</Button>
						<Button
							type="button"
							variant="ghost"
							size="sm"
							onClick={onRemove}
							className="gap-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
						>
							<Trash2 className="size-3.5" /> Tirar da seção
						</Button>
					</div>
				)}
			</div>

			{linking === "roster" && (
				<RosterLinker
					person={person}
					onDone={() => {
						setLinking(null)
						onChanged()
					}}
				/>
			)}
			{linking === "account" && (
				<AccountLinker
					person={person}
					onDone={() => {
						setLinking(null)
						onChanged()
					}}
				/>
			)}
		</li>
	)
}

/** Busca no efetivo e vincula o SARAM. */
function RosterLinker({ person, onDone }: { person: SectionPerson; onDone: () => void }) {
	// Inicializador preguiçoso: sem a função, o `split` roda a cada renderização
	// do cartão para descartar o resultado — o valor inicial só é lido uma vez.
	// Palpite útil: o último token do nome cadastrado costuma ser o nome de guerra.
	const [term, setTerm] = useState(() => person.displayName.split(" ").pop() ?? "")
	const [submitted, setSubmitted] = useState<string | null>(null)
	const inputId = useId()

	const { data: matches = [], isFetching } = useQuery({
		queryKey: ["sucont", "roster", submitted] as const,
		queryFn: () => searchRosterFn({ data: { nomeGuerra: submitted ?? "" } }),
		enabled: Boolean(submitted && submitted.length >= 3),
	})

	const link = useMutation({
		mutationFn: (nrOrdem: string | null) => linkPersonRosterFn({ data: { id: person.id, nrOrdem } }),
		onSuccess: onDone,
		onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao vincular"),
	})

	return (
		<div className="mt-4 rounded-lg border border-border bg-muted/30 p-3">
			<form
				onSubmit={(e) => {
					e.preventDefault()
					setSubmitted(term.trim())
				}}
				className="flex items-end gap-2"
			>
				<div className="flex flex-1 flex-col gap-1">
					<label htmlFor={inputId} className="font-mono text-label text-muted-foreground">
						Nome de guerra no efetivo
					</label>
					<Input
						id={inputId}
						value={term}
						onChange={(e) => setTerm(e.target.value)}
						minLength={3}
						required
						className="border-border bg-card text-foreground focus:border-tech-cyan"
					/>
				</div>
				<Button type="submit" variant="outline" size="sm" className="gap-1.5">
					<Search className="size-3.5" /> Buscar
				</Button>
				{person.nrOrdem && (
					<Button type="button" variant="ghost" size="sm" onClick={() => link.mutate(null)} className="gap-1.5 text-muted-foreground hover:text-destructive">
						<X className="size-3.5" /> Desvincular
					</Button>
				)}
			</form>

			{isFetching ? (
				<p className="mt-3 text-caption text-muted-foreground">Buscando…</p>
			) : submitted && matches.length === 0 ? (
				<p className="mt-3 text-caption text-muted-foreground">Nenhum militar com esse nome de guerra.</p>
			) : matches.length > 0 ? (
				<>
					{/* A organização é o que torna a lista decidível: só o posto não
					    separa quatorze homônimos. */}
					<p className="mt-3 text-hint text-muted-foreground">Escolha pela organização — nome e posto não separam homônimos.</p>
					<ul className="mt-2 divide-y divide-border rounded border border-border bg-card">
						{matches.map((match: RosterMatch) => (
							<li key={match.nrOrdem}>
								<button
									type="button"
									onClick={() => link.mutate(match.nrOrdem)}
									disabled={link.isPending}
									className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-muted/50"
								>
									<span className="text-subheading text-foreground">
										{match.posto} {match.nomeGuerra}
									</span>
									<span className="text-caption text-muted-foreground">{match.organizacao ?? "organização não informada"}</span>
									<span className="ml-auto text-hint font-mono text-muted-foreground">SARAM {match.nrOrdem}</span>
								</button>
							</li>
						))}
					</ul>
				</>
			) : null}
		</div>
	)
}

/** Vincula a conta do ERP pelo e-mail. */
function AccountLinker({ person, onDone }: { person: SectionPerson; onDone: () => void }) {
	const [email, setEmail] = useState(person.email ?? "")
	const inputId = useId()

	const link = useMutation({
		mutationFn: (value: string | null) => linkPersonAccountFn({ data: { id: person.id, email: value } }),
		onSuccess: onDone,
		onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao vincular"),
	})

	return (
		<form
			onSubmit={(e) => {
				e.preventDefault()
				link.mutate(email.trim())
			}}
			className="mt-4 flex items-end gap-2 rounded-lg border border-border bg-muted/30 p-3"
		>
			<div className="flex flex-1 flex-col gap-1">
				<label htmlFor={inputId} className="font-mono text-label text-muted-foreground">
					E-mail da conta no ERP
				</label>
				<Input
					id={inputId}
					type="email"
					value={email}
					onChange={(e) => setEmail(e.target.value)}
					required
					placeholder="nome@fab.mil.br"
					className="border-border bg-card text-foreground focus:border-tech-cyan"
				/>
			</div>
			<Button type="submit" disabled={link.isPending} variant="outline" size="sm" className="gap-1.5">
				{link.isPending && <Loader2 className="size-3 animate-spin" />} Vincular
			</Button>
			{person.hasAccount && (
				<Button type="button" variant="ghost" size="sm" onClick={() => link.mutate(null)} className="gap-1.5 text-muted-foreground hover:text-destructive">
					<X className="size-3.5" /> Desvincular
				</Button>
			)}
		</form>
	)
}
