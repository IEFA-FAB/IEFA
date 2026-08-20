import type { Genero } from "@iefa/database/rumaer"
import { useQuery } from "@tanstack/react-query"
import { CornerDownLeft, ImageOff, Search } from "lucide-react"
import { type KeyboardEvent, useEffect, useId, useRef, useState } from "react"
import { uniformMatchesQuery } from "@/lib/uniforms/filter"
import { uniformPreviewImagesQueryOptions, uniformsQueryOptions } from "@/lib/uniforms/hooks"
import { GENERO_LABELS, GRUPO_LABELS, uniformTitle } from "@/lib/uniforms/labels"
import { expandUniformEntries, previewImagesFor, type UniformEntry } from "@/lib/uniforms/variants"
import { cn } from "@/lib/utils"

/**
 * Quantos UNIFORMES a lista mostra — não quantas linhas. Cortar depois de separar
 * por gênero derrubaria a variedade de 7 uniformes para 4, e pior: partiria um par
 * ao meio, deixando "Masculino" na lista e "Feminino" de fora.
 */
const MAX_SUGGESTION_UNIFORMS = 5

/**
 * Campo de busca da home com sugestões ao vivo (typeahead estilo Google).
 * Digitar filtra os uniformes e mostra as correspondências; escolher uma vai
 * direto ao detalhe, e confirmar a busca (Enter/Buscar) rola para a lista completa.
 *
 * Uniforme com versão masculina e feminina rende DUAS sugestões, cada uma com a
 * própria miniatura — é a ilustração que muda entre elas, e uma linha só faria a
 * pessoa escolher no escuro.
 */
export function UniformSearchBox({
	initialQuery,
	onSubmitSearch,
	onSelectUniform,
}: {
	initialQuery?: string
	onSubmitSearch: (q: string) => void
	onSelectUniform: (uniformId: string, genero: Genero | null) => void
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
	const suggestions = term && uniforms ? expandUniformEntries(uniforms.filter((u) => uniformMatchesQuery(u, query)).slice(0, MAX_SUGGESTION_UNIFORMS)) : []
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

	function choose(entry: UniformEntry) {
		setOpen(false)
		onSelectUniform(entry.uniform.id, entry.genero)
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
				if (active >= 0 && active < suggestions.length) choose(suggestions[active])
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
					{suggestions.map((entry, i) => (
						<button
							key={entry.key}
							id={`${listId}-opt-${i}`}
							role="option"
							aria-selected={i === active}
							tabIndex={-1}
							type="button"
							onMouseEnter={() => setActive(i)}
							onClick={() => choose(entry)}
							className={cn("flex w-full items-center gap-3 px-3 py-2 text-left transition-colors", i === active ? "bg-accent" : "hover:bg-accent/60")}
						>
							<SuggestionThumb uniformId={entry.uniform.id} genero={entry.genero} />
							<span className="min-w-0 flex-1 truncate text-sm text-foreground">{uniformTitle(entry.uniform)}</span>
							{entry.genero && (
								<span className="shrink-0 rounded-full bg-accent px-2 py-0.5 text-xs font-semibold text-foreground/75">{GENERO_LABELS[entry.genero]}</span>
							)}
							<span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">{GRUPO_LABELS[entry.uniform.grupo]}</span>
							{i === active && <CornerDownLeft className="size-3.5 shrink-0 text-muted-foreground/70" aria-hidden="true" />}
						</button>
					))}
				</div>
			)}
		</div>
	)
}

/** Miniatura da sugestão, na versão de gênero da linha. */
function SuggestionThumb({ uniformId, genero }: { uniformId: string; genero: Genero | null }) {
	const { data } = useQuery(uniformPreviewImagesQueryOptions(uniformId))
	const cover = previewImagesFor(data ?? [], genero)[0]

	return (
		<span className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border/70 bg-muted/30">
			{cover ? (
				<img src={cover.url} alt="" loading="lazy" className="h-full w-full object-contain" />
			) : (
				<ImageOff className="size-4 text-muted-foreground/60" aria-hidden="true" />
			)}
		</span>
	)
}
