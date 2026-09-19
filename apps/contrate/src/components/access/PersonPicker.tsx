import { Combobox } from "@base-ui/react/combobox"
import { useQuery } from "@tanstack/react-query"
import { Search } from "iconoir-react"
import { useEffect, useState } from "react"
import { type PersonCandidate, searchAlphaCandidatesFn } from "@/server/access.fn"

/** Espera depois da última tecla antes de buscar. */
const DEBOUNCE_MS = 250
const MIN_CHARS = 2

function candidateLabel(candidate: PersonCandidate): string {
	return candidate.name || candidate.email || candidate.id
}

/**
 * Busca de pessoa para conceder acesso: nome (posto + nome de guerra), e-mail ou Nr. de ordem,
 * no cadastro do ERP, pelo servidor. Combobox do Base UI com filtro desligado (`filter={null}`):
 * quem filtra é a busca, e a lista mostra o que ela devolveu. Setas, Enter e Esc funcionam
 * como em qualquer combobox; o estado da busca é anunciado (`Combobox.Status`).
 */
export function PersonPicker({
	id,
	value,
	onChange,
	autoFocus,
}: {
	id?: string
	value: PersonCandidate | null
	onChange: (value: PersonCandidate | null) => void
	autoFocus?: boolean
}) {
	const [input, setInput] = useState(value ? candidateLabel(value) : "")
	const [term, setTerm] = useState("")

	useEffect(() => {
		const handle = setTimeout(() => setTerm(input.trim()), DEBOUNCE_MS)
		return () => clearTimeout(handle)
	}, [input])

	// Com a pessoa escolhida, o campo mostra o nome dela — não é termo de busca.
	const searching = term.length >= MIN_CHARS && !(value && term === candidateLabel(value))
	const search = useQuery({
		queryKey: ["alpha", "candidates", term],
		queryFn: () => searchAlphaCandidatesFn({ data: { q: term } }),
		enabled: searching,
		staleTime: 30_000,
	})
	const items = searching ? (search.data ?? []) : value ? [value] : []

	const status = !searching
		? input.trim().length > 0 && input.trim().length < MIN_CHARS
			? "Digite ao menos 2 letras."
			: null
		: search.isFetching
			? "Buscando…"
			: search.isError
				? "A busca falhou. Tente de novo."
				: items.length === 0
					? "Ninguém encontrado. Só aparece quem já entrou ao menos uma vez num sistema do IEFA que registra o cadastro: peça à pessoa que entre e busque de novo."
					: `${items.length} ${items.length === 1 ? "pessoa encontrada" : "pessoas encontradas"}${items.length >= 10 ? " (as 10 primeiras; refine a busca)" : ""}.`

	return (
		<Combobox.Root<PersonCandidate>
			items={items}
			filter={null}
			value={value}
			onValueChange={(next) => {
				onChange(next)
				if (next) setInput(candidateLabel(next))
			}}
			inputValue={input}
			onInputValueChange={(next) => setInput(next)}
			itemToStringLabel={candidateLabel}
			itemToStringValue={(candidate) => candidate.id}
			isItemEqualToValue={(left, right) => left.id === right.id}
			autoHighlight
		>
			<div className="relative">
				<Search className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-2.5 size-4 text-muted-foreground" aria-hidden="true" />
				<Combobox.Input
					id={id}
					autoFocus={autoFocus}
					placeholder="Nome de guerra, e-mail ou Nr. de ordem"
					className="h-9 w-full min-w-0 border border-input bg-transparent pr-2.5 pl-8 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
				/>
			</div>
			<Combobox.Portal>
				<Combobox.Positioner sideOffset={4} className="isolate z-60">
					<Combobox.Popup className="max-h-[min(var(--available-height),22rem)] w-(--anchor-width) overflow-y-auto border border-foreground bg-popover text-popover-foreground shadow-[4px_4px_0_0_var(--foreground)] data-closed:animate-out data-open:animate-in data-closed:fade-out-0 data-open:fade-in-0">
						<Combobox.Status className="block px-3 py-2 text-muted-foreground text-xs empty:hidden">{status}</Combobox.Status>
						<Combobox.List>
							{(candidate: PersonCandidate) => (
								<Combobox.Item
									key={candidate.id}
									value={candidate}
									className="flex w-full select-none flex-col gap-0.5 border-border border-t px-3 py-2 text-sm outline-none first:border-t-0 data-highlighted:bg-accent"
								>
									<span className="truncate font-medium">{candidateLabel(candidate)}</span>
									<span className="flex gap-2 truncate text-muted-foreground text-xs">
										{candidate.name && candidate.email ? <span className="truncate">{candidate.email}</span> : null}
										{candidate.nrOrdem ? <span className="shrink-0 font-mono">{candidate.nrOrdem}</span> : null}
									</span>
								</Combobox.Item>
							)}
						</Combobox.List>
					</Combobox.Popup>
				</Combobox.Positioner>
			</Combobox.Portal>
		</Combobox.Root>
	)
}
