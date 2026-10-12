import type { Person } from "@iefa/database/assignment-selection"
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute, redirect } from "@tanstack/react-router"
import { type ControllerActions, type ControllerTab, ControllerView, type PendingAction } from "@/components/controller/ControllerView"
import { LegalNotice } from "@/components/LegalNotice"
import { toast } from "@/components/ui/toast"
import { useAuth } from "@/hooks/useAuth"
import { useBoardRealtime } from "@/hooks/useBoardRealtime"
import { useSkipped } from "@/hooks/useSkipped"
import { authQueryOptions } from "@/lib/auth"
import { callRequest, expectedForChanges, expectedState } from "@/lib/person-changes"
import { controllerBoardQueryOptions } from "@/lib/queries"
import { callPersonFn, resetEditionFn, setActiveEditionFn, setEditionLockFn, updatePersonFn } from "@/server/assignment.fn"

type ControllerSearch = { edition?: string; tab?: ControllerTab }

export const Route = createFileRoute("/controller")({
	validateSearch: (search: Record<string, unknown>): ControllerSearch => ({
		edition: typeof search.edition === "string" ? search.edition : undefined,
		tab: search.tab === "conduct" || search.tab === "prepare" ? search.tab : undefined,
	}),
	// Gate de acesso: exige sessão + concessão (PBAC). O telão "/" segue público.
	beforeLoad: async ({ context, location }) => {
		const auth = await context.queryClient.query({ ...authQueryOptions(), staleTime: "static" })
		if (!auth.isAuthenticated) {
			throw redirect({ to: "/auth", search: { redirect: location.href } })
		}
		if (!auth.isAuthorized) {
			// auth-redirect-without-return-path: a sessão é válida, falta a concessão PBAC.
			// Devolver `/controller` aqui só refaria a mesma checagem e voltaria para cá.
			throw redirect({ to: "/auth" })
		}
	},
	loaderDeps: ({ search }) => ({ edition: search.edition }),
	loader: ({ context, deps }) => context.queryClient.query({ ...controllerBoardQueryOptions(deps.edition), staleTime: "static" }),
	component: ControllerPage,
})

function ControllerPage() {
	const { edition, tab } = Route.useSearch()
	const navigate = Route.useNavigate()
	const queryClient = useQueryClient()
	const { user, signOut } = useAuth()
	const { data } = useSuspenseQuery(controllerBoardQueryOptions(edition))

	useBoardRealtime(data.editionId, controllerBoardQueryOptions(edition).queryKey)

	const editionId = data.editionId
	const activeEdition = data.editions.find((e) => e.active)
	// Sem aba na URL: no dia (edição no telão) abre na condução; antes, no preparo.
	const currentTab: ControllerTab = tab ?? (editionId && activeEdition?.id === editionId ? "conduct" : "prepare")

	const handleSignOut = async () => {
		await signOut()
		await queryClient.invalidateQueries({ queryKey: authQueryOptions().queryKey })
		navigate({ to: "/auth" })
	}

	const { skipped, skip, unskip } = useSkipped(editionId)

	// Executa qualquer ação de escrita e revalida o quadro ao terminar. Recusa por tela
	// velha (outro controle andou antes) também revalida: a tela passa a mostrar o atual.
	const mutation = useMutation({
		mutationFn: ({ action }: { kind: PendingAction; action: () => Promise<unknown>; done?: string }) => action(),
		onSuccess: (_result, { done }) => {
			if (done) toast.success(done)
		},
		onError: (err) => toast.error(err instanceof Error ? err.message : "Erro ao atualizar"),
		onSettled: () => queryClient.invalidateQueries({ queryKey: controllerBoardQueryOptions(edition).queryKey }),
	})
	const run = (kind: PendingAction, action: () => Promise<unknown>, options?: { done?: string; onError?: () => void }) =>
		mutation.mutate({ kind, action, done: options?.done }, { onError: options?.onError })

	type Changes = Parameters<typeof updatePersonFn>[0]["data"]["changes"]
	// Condução: a escrita leva tudo o que a tela viu do militar, e o servidor só grava se
	// a linha ainda estiver assim.
	const conductWrite = (kind: PendingAction, person: Person, changes: Changes) =>
		run(kind, () => updatePersonFn({ data: { id: person.id, changes, expected: expectedState(person) } }))

	const actions: ControllerActions = {
		call: (person) => editionId && run("call", () => callPersonFn({ data: callRequest(editionId, person) })),
		reveal: (person) => conductWrite("reveal", person, { show_om: true }),
		confirm: (person) => conductWrite("confirm", person, { hide_card: true }),
		changeOm: (person, om, estado) => conductWrite("om", person, { localidade: om, estado }),
		undo: (undo) => conductWrite("undo", undo.person, undo.changes),
		activate: () => editionId && run("screen", () => setActiveEditionFn({ data: { editionId } })),
		// O bloqueio é sempre da edição que está no telão, não da que o controlador está olhando.
		setLock: (locked) => activeEdition && run("screen", () => setEditionLockFn({ data: { editionId: activeEdition.id, locked } })),
		resetScreen: () => editionId && run("screen", () => resetEditionFn({ data: { editionId, clearChoices: false } }), { done: "Todos saíram do telão." }),
		clearChoices: () => editionId && run("screen", () => resetEditionFn({ data: { editionId, clearChoices: true } }), { done: "OMs apagadas." }),
		updatePerson: (person, changes, options) =>
			run("person", () => updatePersonFn({ data: { id: person.id, changes, expected: expectedForChanges(person, changes) } }), {
				onError: options?.onError,
			}),
		skip,
		unskip,
	}

	return (
		<div className="min-h-screen">
			<ControllerView
				data={data}
				tab={currentTab}
				onTabChange={(next) => navigate({ search: (prev) => ({ ...prev, tab: next }), replace: true })}
				onEditionChange={(id) => navigate({ search: (prev) => ({ ...prev, edition: id }) })}
				userEmail={user?.email}
				onSignOut={handleSignOut}
				busy={mutation.isPending}
				pendingAction={mutation.isPending ? (mutation.variables?.kind ?? null) : null}
				skipped={skipped}
				actions={actions}
			/>
			<LegalNotice />
		</div>
	)
}
