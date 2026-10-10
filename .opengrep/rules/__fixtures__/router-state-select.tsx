// Casos de teste de `.opengrep/rules/router-state-select.yaml`. Não é código do app.

// ruleid: router-state-select-unannotated
const pathname = useRouterState({ select: (s) => s.location.pathname })
// ruleid: router-state-select-unannotated
const isLoading = useRouterState({ select: s => s.isLoading })
// ruleid: router-state-select-unannotated
const multiline = useRouterState({
	select: (state) => state.status,
})

// ok: router-state-select-unannotated
const path = useLocation({ select: (location) => location.pathname })
// ok: router-state-select-unannotated
const loading = useRouterState({ select: (s): boolean => s.isLoading })
// ok: router-state-select-unannotated
const all = useRouterState()
