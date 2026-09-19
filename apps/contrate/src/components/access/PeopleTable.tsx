import { type ColumnDef, flexRender, rowSortingFeature, type SortingState, tableFeatures, useTable } from "@tanstack/react-table"
import { ArrowSeparateVertical, NavArrowRight, SortDown, SortUp } from "iconoir-react"
import { useMemo } from "react"
import { formatDateTime } from "@/lib/alpha/format"
import { type AlphaPerson, defaultDirection, type PeopleSort, personLabel, type SortDirection } from "@/lib/alpha/people"
import { cn } from "@/lib/utils"
import { PersonStatusBadges, UnitRoleGroups } from "./RoleChips"

/**
 * A tabela de pessoas da tela de acessos: uma linha por pessoa. Ordem e página são do
 * SERVIDOR (`manualSorting`) — a tabela só mostra a página recebida e devolve o clique de
 * ordenação para a URL.
 *
 * Acessível: cabeçalho fixo com `aria-sort` nas colunas ordenáveis, o botão de ordem é um
 * `<button>` de verdade, e cada linha abre o painel pela pessoa (um único ponto de foco por
 * linha — com 100 linhas, dois botões por linha seriam 200 paradas de Tab).
 */

const features = tableFeatures({ rowSortingFeature })

/** A coluna ordenável e a ordem do servidor que ela representa. */
const SORT_COLUMN: Record<PeopleSort, string> = { name: "person", recent: "lastChange" }
const COLUMN_SORT: Record<string, PeopleSort> = { person: "name", lastChange: "recent" }

export type PeopleTableProps = {
	rows: AlphaPerson[]
	sort: PeopleSort
	dir: SortDirection
	onSortChange: (sort: PeopleSort, dir: SortDirection) => void
	onOpen: (userId: string) => void
	currentUserId: string | null
	/** Uma página nova está chegando: a atual fica, esmaecida, até ela chegar. */
	isFetching?: boolean
	/** Para o `now` das fichas (vence em breve) — injetável para o harness e o teste. */
	now?: number
	/** Texto do estado vazio — depende de ser escopo sem ninguém ou filtro sem resultado. */
	empty: React.ReactNode
	caption: string
}

export function PeopleTable({ rows, sort, dir, onSortChange, onOpen, currentUserId, isFetching, now, empty, caption }: PeopleTableProps) {
	const columns = useMemo<ColumnDef<typeof features, AlphaPerson>[]>(
		() => [
			{
				id: "person",
				accessorFn: (person) => personLabel(person),
				enableSorting: true,
				header: "Pessoa",
				cell: ({ row }) => {
					const person = row.original
					return (
						<button
							type="button"
							onClick={() => onOpen(person.userId)}
							className="group/person flex w-full min-w-0 items-start justify-between gap-2 text-left outline-none focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
							aria-label={`Abrir acessos de ${personLabel(person)}`}
						>
							<span className="flex min-w-0 flex-col">
								<span className="truncate font-medium group-hover/person:underline">{personLabel(person)}</span>
								{person.name && person.email ? <span className="truncate text-muted-foreground text-xs">{person.email}</span> : null}
								{person.userId === currentUserId ? <span className="text-label mt-0.5 text-muted-foreground">Você</span> : null}
							</span>
							<NavArrowRight className="mt-0.5 size-4 shrink-0 text-muted-foreground md:hidden" aria-hidden="true" />
						</button>
					)
				},
			},
			{
				id: "roles",
				header: "Papéis por OM",
				enableSorting: false,
				cell: ({ row }) => <UnitRoleGroups grants={row.original.grants} now={now} />,
			},
			{
				id: "status",
				header: "Situação",
				enableSorting: false,
				cell: ({ row }) => <PersonStatusBadges person={row.original} now={now} />,
			},
			{
				id: "lastChange",
				accessorFn: (person) => person.lastChangeAt,
				enableSorting: true,
				header: "Última alteração",
				cell: ({ row }) =>
					row.original.lastChangeAt ? (
						<time dateTime={row.original.lastChangeAt} className="whitespace-nowrap text-muted-foreground text-xs tabular-nums">
							{formatDateTime(row.original.lastChangeAt)}
						</time>
					) : (
						<span className="text-muted-foreground text-xs" title="Sem registro no log de auditoria: acesso concedido antes dele">
							Sem registro
						</span>
					),
			},
		],
		[onOpen, currentUserId, now]
	)

	const sorting = useMemo<SortingState>(() => [{ id: SORT_COLUMN[sort], desc: dir === "desc" }], [sort, dir])

	const table = useTable({
		features,
		data: rows,
		columns,
		getRowId: (person) => person.userId,
		manualSorting: true,
		state: { sorting },
		onSortingChange: () => {},
	})

	function toggle(columnId: string) {
		const target = COLUMN_SORT[columnId]
		if (!target) return
		if (target === sort) onSortChange(sort, dir === "asc" ? "desc" : "asc")
		else onSortChange(target, defaultDirection(target))
	}

	const columnClass: Record<string, string> = {
		person: "w-[16rem] min-w-[12rem]",
		roles: "min-w-[14rem]",
		status: "w-[13rem] min-w-[10rem]",
		lastChange: "hidden w-[9rem] md:table-cell",
	}

	return (
		<div
			className={cn("relative max-h-[min(70dvh,52rem)] overflow-auto border border-border transition-opacity duration-150", isFetching && "opacity-60")}
			aria-busy={isFetching || undefined}
		>
			<table className="w-full border-collapse text-sm">
				<caption className="sr-only">{caption}</caption>
				<thead className="sticky top-0 z-10 bg-background shadow-[inset_0_-1px_0_var(--border)]">
					{table.getHeaderGroups().map((group) => (
						<tr key={group.id}>
							{group.headers.map((header) => {
								const sortable = header.column.getCanSort()
								const active = SORT_COLUMN[sort] === header.column.id
								const ariaSort = sortable ? (active ? (dir === "asc" ? "ascending" : "descending") : "none") : undefined
								return (
									<th
										key={header.id}
										scope="col"
										aria-sort={ariaSort}
										className={cn("text-label h-10 px-3 text-left align-middle font-medium text-muted-foreground", columnClass[header.column.id])}
									>
										{sortable ? (
											<button
												type="button"
												onClick={() => toggle(header.column.id)}
												className={cn(
													"-mx-1 inline-flex items-center gap-1 px-1 py-0.5 uppercase outline-none hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2",
													active && "text-foreground"
												)}
											>
												{flexRender(header.column.columnDef.header, header.getContext())}
												{active ? (
													dir === "asc" ? (
														<SortUp className="size-3.5" aria-hidden="true" />
													) : (
														<SortDown className="size-3.5" aria-hidden="true" />
													)
												) : (
													<ArrowSeparateVertical className="size-3.5 opacity-50" aria-hidden="true" />
												)}
											</button>
										) : (
											flexRender(header.column.columnDef.header, header.getContext())
										)}
									</th>
								)
							})}
						</tr>
					))}
				</thead>
				<tbody>
					{rows.length === 0 ? (
						<tr>
							<td colSpan={columns.length} className="px-4 py-10">
								{empty}
							</td>
						</tr>
					) : (
						table.getRowModel().rows.map((row) => (
							<tr
								key={row.id}
								className="border-border border-b align-top transition-colors last:border-b-0 hover:bg-muted/60"
								onClick={(event) => {
									// A linha inteira abre o painel para o mouse; o teclado usa o botão da pessoa.
									if ((event.target as HTMLElement).closest("button, a")) return
									onOpen(row.original.userId)
								}}
							>
								{row.getAllCells().map((cell) => (
									<td key={cell.id} className={cn("px-3 py-3", columnClass[cell.column.id])}>
										{flexRender(cell.column.columnDef.cell, cell.getContext())}
									</td>
								))}
							</tr>
						))
					)}
				</tbody>
			</table>
		</div>
	)
}
