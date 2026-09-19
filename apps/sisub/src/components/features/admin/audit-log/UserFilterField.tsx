import { Search, X } from "lucide-react"
import * as React from "react"
import { z } from "zod"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Item, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { useUserSearch } from "@/hooks/data/useUserSearch"

/** Usuário escolhido num filtro: o id vai para a consulta, o rótulo fica na tela. */
export type AuditUserFilter = { id: string; label: string }

/** A MESMA validação do schema da server fn: um id que ela recusaria não vira filtro. */
const UUID = z.uuid()

/** Id que a server fn aceita como filtro. Alvo legado gravado em outro formato não é. */
export function isFilterableUserId(value: string): boolean {
	return UUID.safeParse(value).success
}

type UserFilterFieldProps = {
	id: string
	label: string
	/** Frase antes do rótulo quando o filtro está ativo ("Operações executadas por"). */
	activePrefix: string
	value: AuditUserFilter | null
	onChange: (next: AuditUserFilter | null) => void
}

/**
 * Filtro por usuário da tela de auditoria: busca por e-mail, ou o id colado direto.
 *
 * O id colado existe porque `core.user_data` só nasce no primeiro login — a pessoa que
 * recebeu acesso e nunca entrou não aparece na busca por e-mail, e é justamente ela que se
 * quer investigar quando o acesso foi concedido sem motivo.
 */
export function UserFilterField({ id, label, activePrefix, value, onChange }: UserFilterFieldProps) {
	const [search, setSearch] = React.useState("")
	const { results, isSearching, canSearch } = useUserSearch(search)
	const pastedId = isFilterableUserId(search.trim()) ? search.trim().toLowerCase() : null

	function select(next: AuditUserFilter | null) {
		onChange(next)
		setSearch("")
	}

	if (value) {
		return (
			<div className="space-y-2">
				<span className="text-caption text-muted-foreground">{label}</span>
				<div className="flex flex-wrap items-center gap-2">
					<span className="text-caption text-muted-foreground">{activePrefix}</span>
					<Badge variant="secondary" className="max-w-full truncate">
						{value.label}
					</Badge>
					<Button variant="ghost" size="sm" onClick={() => select(null)}>
						<X className="size-4" />
						Limpar
					</Button>
				</div>
			</div>
		)
	}

	return (
		<div className="space-y-2">
			<Label htmlFor={id} className="text-caption">
				{label}
			</Label>
			<div className="relative">
				<Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
				<Input
					id={id}
					value={search}
					onChange={(e) => setSearch(e.target.value)}
					placeholder="E-mail (ao menos 3 caracteres) ou id do usuário"
					autoComplete="off"
					className="pl-8"
				/>
			</div>

			{pastedId ? (
				<ItemGroup>
					<Item variant="outline" size="sm">
						<ItemContent>
							<ItemTitle className="font-mono text-caption">{pastedId}</ItemTitle>
							<ItemDescription>Id de usuário — vale também para quem nunca entrou no sistema</ItemDescription>
						</ItemContent>
						<Button variant="outline" size="sm" onClick={() => select({ id: pastedId, label: pastedId })}>
							Filtrar
						</Button>
					</Item>
				</ItemGroup>
			) : (
				canSearch && (
					<ItemGroup>
						{isSearching ? (
							<Skeleton className="h-9 w-full" />
						) : results.length === 0 ? (
							<p className="text-caption text-muted-foreground">Nenhum usuário com esse e-mail.</p>
						) : (
							results.map((user) => (
								<Item key={user.id} variant="outline" size="sm">
									<ItemContent>
										<ItemTitle>{user.email}</ItemTitle>
										{user.nrOrdem && <ItemDescription>Nº de ordem {user.nrOrdem}</ItemDescription>}
									</ItemContent>
									<Button variant="outline" size="sm" onClick={() => select({ id: user.id, label: user.email })}>
										Filtrar
									</Button>
								</Item>
							))
						)}
					</ItemGroup>
				)
			)}
		</div>
	)
}
