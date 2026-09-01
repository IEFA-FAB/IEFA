import { useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList, ComboboxTrigger } from "@/components/ui/combobox"
import { cn } from "@/lib/cn"

export interface FolderComboboxOption {
	id: string
	path: string
	name?: string
	/** Quando presente, o item vira duas linhas: nome em cima, caminho do pai embaixo. */
	parentPath?: string
}

interface FolderComboboxProps {
	value: string | null
	onChange: (id: string | null) => void
	options: FolderComboboxOption[]
	/** Rótulo da opção que zera a seleção. Sem ele a lista não oferece "nenhuma". */
	clearLabel?: string
	placeholder?: string
	searchPlaceholder?: string
	emptyLabel?: string
	/** Rótulo quando o id salvo não está entre as opções (pasta apagada ou fora de escopo). */
	unavailableLabel?: string
	className?: string
	contentClassName?: string
}

/** Sentinela da opção "nenhuma": id vazio nunca colide com um uuid de pasta. */
const NONE_ID = ""

function normalize(value: string) {
	return value
		.normalize("NFD")
		.replace(/\p{Diacritic}/gu, "")
		.toLowerCase()
}

/**
 * Cada palavra da busca tem de aparecer em algum lugar de `nome + caminho`, em
 * qualquer ordem.
 *
 * Casar a consulta inteira como uma substring só seria mais estrito do que o
 * `cmdk` que este componente substituiu: "hortifruti citricas" não é substring
 * de "Hortifruti / Frutas / Cítricas" por causa do nível do meio, e a busca
 * responderia "Nenhuma pasta encontrada" para o caminho que o usuário está
 * olhando. Palavra a palavra cobre esse caso sem o custo de um score difuso.
 */
function matches(haystack: string, query: string) {
	const terms = normalize(query).split(/\s+/).filter(Boolean)
	if (terms.length === 0) return true
	const target = normalize(haystack)
	return terms.every((term) => target.includes(term))
}

/**
 * Seletor de pasta com busca, sobre o primitivo `Combobox` do Base UI.
 *
 * Existe para aposentar as três montagens `Popover` + `cmdk` que eram a mesma
 * tela copiada em `FolderForm`, `IngredientForm` e `IngredientDetailForm`. Além
 * da duplicação, as três punham `role="combobox"` no botão que abre o popup e
 * deixavam o campo de busca sem relação nenhuma com a lista: sem
 * `aria-activedescendant`, navegar pelos resultados com as setas não anunciava
 * item nenhum.
 *
 * A lista é local, então o filtro do próprio primitivo serve — só a comparação
 * é trocada, para casar nome E caminho sem acento, que era o que o `cmdk` fazia
 * com o `value={\`${path} ${id}\`}`.
 */
export function FolderCombobox({
	value,
	onChange,
	options,
	clearLabel,
	placeholder = "Selecione uma pasta...",
	searchPlaceholder = "Pesquisar pasta...",
	emptyLabel = "Nenhuma pasta encontrada.",
	unavailableLabel = "Pasta indisponível",
	className,
	contentClassName,
}: FolderComboboxProps) {
	const [open, setOpen] = useState(false)

	// Identidade estável: `items` e `value` alimentam os memos de coleção do
	// primitivo, e um literal novo a cada render refaz a lista e a sincronização
	// do item destacado a cada tecla do formulário em volta.
	const noneOption = useMemo<FolderComboboxOption | null>(() => (clearLabel ? { id: NONE_ID, path: clearLabel } : null), [clearLabel])
	const items = useMemo(() => (noneOption ? [noneOption, ...options] : options), [noneOption, options])

	const found = useMemo(() => (value ? (options.find((option) => option.id === value) ?? null) : null), [value, options])
	const selected = value ? found : noneOption
	const triggerLabel = value ? (found?.path ?? unavailableLabel) : (clearLabel ?? placeholder)

	return (
		<Combobox
			items={items}
			value={selected}
			isItemEqualToValue={(item: FolderComboboxOption, current: FolderComboboxOption) => item.id === current.id}
			itemToStringLabel={(item: FolderComboboxOption) => item.path}
			filter={(item: FolderComboboxOption, query) => matches(`${item.name ?? ""} ${item.path}`, query)}
			open={open}
			onOpenChange={setOpen}
			onValueChange={(next) => {
				const item = next as FolderComboboxOption | null
				onChange(item && item.id !== NONE_ID ? item.id : null)
				setOpen(false)
			}}
		>
			<ComboboxTrigger render={<Button type="button" variant="outline" className={cn("w-full justify-between font-normal", className)} />}>
				<span className="truncate">{triggerLabel}</span>
			</ComboboxTrigger>

			<ComboboxContent className={cn("min-w-[320px]", contentClassName)}>
				<ComboboxInput showTrigger={false} placeholder={searchPlaceholder} aria-label={searchPlaceholder} />
				<ComboboxEmpty>{emptyLabel}</ComboboxEmpty>
				<ComboboxList className="max-h-80">
					{(item: FolderComboboxOption) => (
						<ComboboxItem key={item.id} value={item} className={cn(item.parentPath && "items-start", item.id === NONE_ID && "text-muted-foreground italic")}>
							{item.parentPath ? (
								<span className="min-w-0">
									<span className="block truncate">{item.name ?? item.path}</span>
									<span className="block truncate text-xs font-normal text-muted-foreground">{item.parentPath}</span>
								</span>
							) : (
								<span className="truncate">{item.path}</span>
							)}
						</ComboboxItem>
					)}
				</ComboboxList>
			</ComboboxContent>
		</Combobox>
	)
}
