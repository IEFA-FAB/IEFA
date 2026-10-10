// Casos de teste de `.opengrep/rules/router-state-select.yaml`. Não é código do app.

// ruleid: router-state-select-unannotated
const pathname = useRouterState({ select: (s) => s.location.pathname })
// ruleid: router-state-select-unannotated
const isLoading = useRouterState({ select: s => s.isLoading })
// ruleid: router-state-select-unannotated
const multiline = useRouterState({
	select: (state) => state.status,
})
// ruleid: router-state-select-unannotated
const destructured = useRouterState({ select: ({ location }) => location.pathname })
// ruleid: router-state-select-unannotated
const paramOnly = useRouterState({ select: (s: RouterState) => s.location.pathname })
// ruleid: router-state-select-unannotated
const fn = useRouterState({ select: function (s) { return s.status } })
// ruleid: router-state-select-unannotated
const second = useRouterState({ structuralSharing: true, select: (s) => s.location.pathname })

// ok: router-state-select-unannotated
const path = useLocation({ select: (location) => location.pathname })
// ok: router-state-select-unannotated
const loading = useRouterState({ select: (s): boolean => s.isLoading })
// ok: router-state-select-unannotated
const annotatedBoth = useRouterState({ select: (s: RouterState): string => s.status })
// ok: router-state-select-unannotated
const annotatedFn = useRouterState({ select: function (s): string { return s.status } })
// ok: router-state-select-unannotated
const all = useRouterState()
