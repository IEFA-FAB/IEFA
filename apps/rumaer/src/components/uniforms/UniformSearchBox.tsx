import { useQuery } from "@tanstack/react-query"
import { CornerDownLeft, Search } from "lucide-react"
import { type KeyboardEvent, useEffect, useId, useRef, useState } from "react"
import { uniformMatchesQuery } from "@/lib/uniforms/filter"
import { uniformsQueryOptions } from "@/lib/uniforms/hooks"
import { GRUPO_LABELS, uniformTitle } from "@/lib/uniforms/labels"
import { cn } from "@/lib/utils"

const MAX_SUGGESTIONS = 7

/**
 * Campo de busca da home com sugestões ao vivo (typeahead estilo Google).
 * Digitar filtra os uniformes e mostra as correspondências; escolher uma vai
 * direto ao detalhe, e confirmar a busca (Enter/Buscar) rola para a lista completa.
 */
export function UniformSearchBox({
	initialQuery,
	onSubmitSearch,
	onSelectUniform,
}: {
	initialQuery?: string
	onSubmitSearch: (q: string) => void
	onSelectUniform: (uniformId: string) => void
}) {
	const [query, setQuery] = useState(initialQuery ?? "")
	const [open, setOpen] = useState(false)
	const [active, setActive] = useState(-1)
	const rootRef = useRef<HTMLDivElement>(null)
	const inputRef = useRef<HTMLInputElement>(null)
	const listId = useId()

	// Mantém o campo em sincronia com o `q` da URL (ex.: editado na busca da lista),
	// sem sobrescrever o que a pessoa está digitando aqui (só quando sem foco).
	useEffect(() => {
		if (document.activeElement !== inputRef.current) setQuery(initialQuery ?? "")
	}, [initialQuery])

	// Todos os uniformes (sem filtro) — base das sugestões; carrega em background.
	const { data: uniforms } = useQuery(uniformsQueryOptions({}))

	const term = query.trim()
	const suggestions = term && uniforms ? uniforms.filter((u) => uniformMatchesQuery(u, query)).slice(0, MAX_SUGGESTIONS) : []
	const showList = open && suggestions.length > 0

	// Fecha o dropdown ao clicar fora.
	useEffect(() => {
		function onDocClick(e: MouseEvent) {
			if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
		}
		document.addEventListener("mousedown", onDocClick)
		return () => document.removeEventListener("mousedown", onDocClick)
	}, [])

	function submit() {
		setOpen(false)
		onSubmitSearch(query.trim())
	}

	function choose(id: string) {
		setOpen(false)
		onSelectUniform(id)
	}

	function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
		if (!showList) {
			if (e.key === "Enter") {
				e.preventDefault()
				submit()
			}
			return
		}
		switch (e.key) {
			case "ArrowDown":
				e.preventDefault()
				setActive((i) => (i + 1) % suggestions.length)
				break
			case "ArrowUp":
				e.preventDefault()
				setActive((i) => (i <= 0 ? suggestions.length - 1 : i - 1))
				break
			case "Enter":
				e.preventDefault()
				if (active >= 0 && active < suggestions.length) choose(suggestions[active].id)
				else submit()
				break
			case "Escape":
				setOpen(false)
				break
		}
	}

	return (
		<div ref={rootRef} className="relative w-full">
			<form
				onSubmit={(e) => {
					e.preventDefault()
					submit()
				}}
				className="flex w-full items-center gap-2 rounded-[14px] border border-input bg-card p-1.5 pl-4 shadow-sm transition-shadow focus-within:border-ring focus-within:shadow-md"
			>
				<Search className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
				<input
					ref={inputRef}
					type="text"
					value={query}
					onChange={(e) => {
						setQuery(e.target.value)
						setOpen(true)
						setActive(-1)
					}}
					onFocus={() => setOpen(true)}
					onKeyDown={onKeyDown}
					placeholder="Busque por uniforme, ocasião ou peça…"
					aria-label="Buscar uniforme"
					role="combobox"
					aria-expanded={showList}
					aria-haspopup="listbox"
					aria-autocomplete="list"
					aria-controls={listId}
					aria-activedescendant={active >= 0 ? `${listId}-opt-${active}` : undefined}
					className="min-w-0 flex-1 bg-transparent px-1 py-2.5 text-[15px] text-foreground outline-none placeholder:text-muted-foreground"
				/>
				<button
					type="submit"
					className="inline-flex shrink-0 items-center gap-2 rounded-[9px] bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground transition-colors hover:bg-navy-deep"
				>
					Buscar
				</button>
			</form>

			{showList && (
				<div
					id={listId}
					role="listbox"
					aria-label="Sugestões de uniformes"
					className="absolute z-20 mt-2 w-full overflow-hidden rounded-[14px] border border-input bg-card py-1.5 text-left shadow-lg"
				>
					{suggestions.map((u, i) => (
						<button
							key={u.id}
							id={`${listId}-opt-${i}`}
							role="option"
							aria-selected={i === active}
							tabIndex={-1}
							type="button"
							onMouseEnter={() => setActive(i)}
							onClick={() => choose(u.id)}
							className={cn("flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors", i === active ? "bg-accent" : "hover:bg-accent/60")}
						>
							<Search className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
							<span className="min-w-0 flex-1 truncate text-sm text-foreground">{uniformTitle(u)}</span>
							<span className="shrink-0 text-xs text-muted-foreground">{GRUPO_LABELS[u.grupo]}</span>
							{i === active && <CornerDownLeft className="size-3.5 shrink-0 text-muted-foreground/70" aria-hidden="true" />}
						</button>
					))}
				</div>
			)}
		</div>
	)
}
