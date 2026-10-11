import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute, redirect } from "@tanstack/react-router"
import { type ControllerActions, type ControllerTab, ControllerView } from "@/components/controller/ControllerView"
import { LegalNotice } from "@/components/LegalNotice"
import { toast } from "@/components/ui/toast"
import { useAuth } from "@/hooks/useAuth"
import { useBoardRealtime } from "@/hooks/useBoardRealtime"
import { authQueryOptions } from "@/lib/auth"
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

	// Executa qualquer ação de escrita e revalida o quadro ao terminar.
	const mutation = useMutation({
		mutationFn: ({ action }: { action: () => Promise<unknown>; done?: string }) => action(),
		onSuccess: (_result, { done }) => {
			if (done) toast.success(done)
		},
		onError: (err) => toast.error(err instanceof Error ? err.message : "Erro ao atualizar"),
		onSettled: () => queryClient.invalidateQueries({ queryKey: controllerBoardQueryOptions(edition).queryKey }),
	})
	const run = (action: () => Promise<unknown>, done?: string) => mutation.mutate({ action, done })
	const updatePerson = (id: number, changes: Parameters<typeof updatePersonFn>[0]["data"]["changes"]) => run(() => updatePersonFn({ data: { id, changes } }))

	const actions: ControllerActions = {
		call: (personId) => editionId && run(() => callPersonFn({ data: { editionId, personId } })),
		reveal: (personId) => updatePerson(personId, { show_om: true }),
		confirm: (personId) => updatePerson(personId, { hide_card: true }),
		changeOm: (personId, om, estado) => updatePerson(personId, { localidade: om, estado }),
		undo: (undo) => updatePerson(undo.person.id, undo.changes),
		activate: () => editionId && run(() => setActiveEditionFn({ data: { editionId } })),
		// O bloqueio é sempre da edição que está no telão, não da que o controlador está olhando.
		setLock: (locked) => activeEdition && run(() => setEditionLockFn({ data: { editionId: activeEdition.id, locked } })),
		resetScreen: () => editionId && run(() => resetEditionFn({ data: { editionId, clearChoices: false } }), "Todos saíram do telão."),
		clearChoices: () => editionId && run(() => resetEditionFn({ data: { editionId, clearChoices: true } }), "OMs apagadas."),
		updatePerson,
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
				actions={actions}
			/>
			<LegalNotice />
		</div>
	)
}
